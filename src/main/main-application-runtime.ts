import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { BrowserManager } from '../automation/browser/browser-manager'
import { BrowserWorkspaceService } from '../automation/browser/browser-workspace-service'
import { PlatformPageManager } from '../automation/browser/platform-page-manager'
import { PlaywrightBrowserLauncher } from '../automation/browser/playwright-browser-launcher'
import { CpiQueueFilterController } from '../automation/cpi/cpi-queue-filter-controller'
import { ContinuousResearchRunner } from '../automation/flow/continuous-research-runner'
import { ResearchHistoryService } from '../automation/history/research-history-service'
import { PlatformSessionService } from '../automation/session/platform-session-service'
import { AgentPublicStateStore } from '../automation/workflow/agent-public-state-store'
import { ContinuousAgentRuntimeService } from '../automation/workflow/continuous-agent-runtime-service'
import { ResearchHistoryRepository } from '../infrastructure/database/research-history-repository'
import {
  ensureRuntimeDirectories,
  resolveRuntimePaths
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
    const runtimePaths = resolveRuntimePaths(join(app.getPath('appData'), 'AgenteCPI'))

    await ensureRuntimeDirectories(runtimePaths)

    const browserManager = new BrowserManager(
      new PlaywrightBrowserLauncher(),
      runtimePaths.browserProfileDir
    )

    this.browserService = new BrowserWorkspaceService(browserManager, new PlatformPageManager())

    const sessionService = new PlatformSessionService(browserManager)

    const queueFilterController = new CpiQueueFilterController()

    this.historyRepository = ResearchHistoryRepository.open(
      join(app.getPath('userData'), 'agente-cpi.sqlite')
    )

    this.historyRepository.markUnfinishedAsInterrupted(new Date().toISOString())

    const historyService = new ResearchHistoryService(this.historyRepository)

    const stateStore = new AgentPublicStateStore()

    this.agentRuntimeService = new ContinuousAgentRuntimeService({
      stateStore,
      browser: this.browserService,
      sessions: sessionService,
      filter: queueFilterController,
      runner: new ContinuousResearchRunner(),
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
