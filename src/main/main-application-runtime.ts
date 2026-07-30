import { stat } from 'node:fs/promises'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { BrowserManager } from '../automation/browser/browser-manager'
import { BrowserWorkspaceService } from '../automation/browser/browser-workspace-service'
import { PlatformPageManager } from '../automation/browser/platform-page-manager'
import { PlaywrightBrowserLauncher } from '../automation/browser/playwright-browser-launcher'
import { CpiQueueFilterController } from '../automation/cpi/cpi-queue-filter-controller'
import { createContinuousResearchRunner } from '../automation/flow/continuous-research-runner'
import { ResearchHistoryService } from '../automation/history/research-history-service'
import { PlatformSessionService } from '../automation/session/platform-session-service'
import { AgentPublicStateStore } from '../automation/workflow/agent-public-state-store'
import { ContinuousAgentRuntimeService } from '../automation/workflow/continuous-agent-runtime-service'
import { parseAppConfig } from '../infrastructure/config/app-config'
import { ResearchHistoryRepository } from '../infrastructure/database/research-history-repository'
import { resolvePdfOutputDirectory } from '../infrastructure/filesystem/pdf-output-directory-resolver'
import {
  ensureOperationalDirectories,
  resolveApplicationPaths
} from '../infrastructure/filesystem/runtime-paths'
import { registerBrowserIpcHandlers } from './ipc/register-browser-ipc-handlers'
import { registerContinuousAgentIpcHandlers } from './ipc/register-continuous-agent-ipc-handlers'
import { registerHistoryIpcHandlers } from './ipc/register-history-ipc-handlers'
import { registerPdfIpcHandlers } from './ipc/register-pdf-ipc-handlers'
import { registerSessionIpcHandlers } from './ipc/register-session-ipc-handlers'
import { PdfFileService } from './services/pdf-file-service'

const eventSender = {
  send(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    })
  }
}

export class MainApplicationRuntime {
  private browserService: BrowserWorkspaceService | null = null

  private agentRuntimeService: ContinuousAgentRuntimeService | null = null

  private historyRepository: ResearchHistoryRepository | null = null

  private disposeAgentIpc: (() => void) | null = null

  private disposeHistoryIpc: (() => void) | null = null

  async initialize(): Promise<void> {
    const config = parseAppConfig()
    const runtimePaths = resolveApplicationPaths(
      {
        appDataDir: app.getPath('appData'),
        userDataDir: app.getPath('userData')
      },
      config.paths
    )

    await ensureOperationalDirectories(runtimePaths)

    const pdfOutputDirectory = await resolvePdfOutputDirectory({
      preferredDirectory: runtimePaths.preferredPdfDirectory,
      fallbackDirectory: runtimePaths.downloadsDir
    })

    const browserManager = new BrowserManager(
      new PlaywrightBrowserLauncher(),
      runtimePaths.browserProfileDir
    )

    this.browserService = new BrowserWorkspaceService(
      browserManager,
      new PlatformPageManager(config.platform, config.timing.platformPageNavigationTimeoutMs)
    )

    const sessionService = new PlatformSessionService(browserManager)

    const queueFilterController = new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    })

    this.historyRepository = ResearchHistoryRepository.open(runtimePaths.databaseFile)

    this.historyRepository.markUnfinishedAsInterrupted(new Date().toISOString())

    const historyService = new ResearchHistoryService(this.historyRepository)

    const stateStore = new AgentPublicStateStore()

    this.agentRuntimeService = new ContinuousAgentRuntimeService({
      stateStore,
      browser: this.browserService,
      sessions: sessionService,
      filter: queueFilterController,
      runner: createContinuousResearchRunner({
        queueCheckIntervalMs: config.timing.queueCheckIntervalMs,
        cpiSearchPollingIntervalMs: config.timing.cpiSearchPollingIntervalMs,
        actionTimeoutMs: config.timing.actionTimeoutMs,
        readTimeoutMs: config.timing.readTimeoutMs,
        queueFilterSettleDelayMs: config.timing.queueFilterSettleDelayMs,
        cpiFrameSearchAttempts: config.limits.cpiFrameSearchAttempts,
        deskDataPeopleUrl: config.platform.deskDataPeopleUrl,
        navigationTimeoutMs: config.timing.navigationTimeoutMs,
        downloadStartTimeoutMs: config.timing.downloadStartTimeoutMs,
        deskDataFormPollingIntervalMs: config.timing.deskDataFormPollingIntervalMs,
        deskDataResultPollingIntervalMs: config.timing.deskDataResultPollingIntervalMs,
        deskDataHistoryNavigationIntervalMs: config.timing.deskDataHistoryNavigationIntervalMs,
        submitSettleDelayMs: config.timing.submitSettleDelayMs,
        queueReturnDelayMs: config.timing.queueReturnDelayMs,
        cpiIdentitySearchAttempts: config.limits.cpiIdentitySearchAttempts,
        cpiAttachmentSearchAttempts: config.limits.cpiAttachmentSearchAttempts,
        cpiResultSearchAttempts: config.limits.cpiResultSearchAttempts,
        cpiResultStabilizationAttempts: config.limits.cpiResultStabilizationAttempts,
        deskDataFormReadyAttempts: config.limits.deskDataFormReadyAttempts,
        deskDataResultSearchAttempts: config.limits.deskDataResultSearchAttempts,
        deskDataHistoryNavigationAttempts: config.limits.deskDataHistoryNavigationAttempts,
        pdfOutputDirectory
      }),
      history: historyService
    })

    const pdfFileService = new PdfFileService(shell, {
      stat
    })

    registerBrowserIpcHandlers(ipcMain, this.browserService)

    registerSessionIpcHandlers(ipcMain, sessionService)

    this.disposeAgentIpc = registerContinuousAgentIpcHandlers(
      ipcMain,
      this.agentRuntimeService,
      eventSender
    )

    this.disposeHistoryIpc = registerHistoryIpcHandlers(ipcMain, historyService, eventSender)

    registerPdfIpcHandlers(ipcMain, pdfFileService)
  }

  async shutdown(): Promise<void> {
    try {
      await this.agentRuntimeService?.shutdown()
    } catch (error: unknown) {
      console.error('Falha ao encerrar o agente:', error)
    }

    try {
      if (this.browserService?.getSnapshot().state === 'RUNNING') {
        await this.browserService.stop()
      }
    } catch (error: unknown) {
      console.error('Falha ao encerrar o navegador:', error)
    }

    this.disposeAgentIpc?.()
    this.disposeHistoryIpc?.()

    this.historyRepository?.close()

    this.disposeAgentIpc = null
    this.disposeHistoryIpc = null
    this.historyRepository = null
    this.agentRuntimeService = null
    this.browserService = null
  }
}
