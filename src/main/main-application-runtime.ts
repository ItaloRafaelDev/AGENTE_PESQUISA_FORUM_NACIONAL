import { stat } from 'node:fs/promises'
import { app, shell } from 'electron'
import { AgentStateMachine } from '../application/agent/agent-state-machine'
import { ContinuousAgentCoordinator } from '../application/agent/continuous-agent-coordinator'
import { ResearchHistoryService } from '../application/history/research-history-service'
import { parseAppConfig } from '../infrastructure/config/app-config'
import { ResearchHistoryRepository } from '../infrastructure/database/research-history-repository'
import { resolvePdfOutputDirectory } from '../infrastructure/filesystem/pdf-output-directory-resolver'
import {
  ensureOperationalDirectories,
  resolveApplicationPaths
} from '../infrastructure/filesystem/runtime-paths'
import { BrowserManager } from '../infrastructure/automation/browser/browser-manager'
import { BrowserWorkspaceService } from '../infrastructure/automation/browser/browser-workspace-service'
import { PlatformPageManager } from '../infrastructure/automation/browser/platform-page-manager'
import { PlaywrightBrowserLauncher } from '../infrastructure/automation/browser/playwright-browser-launcher'
import { PlatformSessionService } from '../infrastructure/automation/session/platform-session-service'
import { CpiQueueFilterController } from '../infrastructure/automation/cpi/cpi-queue-filter-controller'
import { PlaywrightAgentWorkspaceAdapter } from '../infrastructure/automation/workflow/playwright-agent-workspace-adapter'
import { SafeMessageSanitizerAdapter } from '../infrastructure/logging/safe-message-sanitizer'
import { SystemClock } from '../infrastructure/runtime/system-clock'
import { UuidGenerator } from '../infrastructure/runtime/uuid-generator'
import { ContinuousAgentIpcAdapter } from './adapters/continuous-agent-ipc-adapter'
import { registerBrowserIpcHandlers } from './ipc/register-browser-ipc-handlers'
import { registerContinuousAgentIpcHandlers } from './ipc/register-continuous-agent-ipc-handlers'
import { registerHistoryIpcHandlers } from './ipc/register-history-ipc-handlers'
import { registerPdfIpcHandlers } from './ipc/register-pdf-ipc-handlers'
import { registerSessionIpcHandlers } from './ipc/register-session-ipc-handlers'
import { ApplicationRuntimeLifecycle } from './lifecycle/application-runtime-lifecycle'
import { ApplicationShutdown } from './lifecycle/application-shutdown'
import type { MainWindowEventSender } from './security/main-window-event-sender'
import type { SecureIpcMainRegistrar } from './security/secure-ipc-main-registrar'
import { PdfFileService } from './services/pdf-file-service'

export interface MainApplicationRuntimeElectronBoundary {
  ipcMain: SecureIpcMainRegistrar
  eventSender: MainWindowEventSender
}

export class MainApplicationRuntime {
  private browserService: BrowserWorkspaceService | null = null

  private agentCoordinator: ContinuousAgentCoordinator | null = null

  private historyRepository: ResearchHistoryRepository | null = null

  private disposeAgentIpc: (() => void) | null = null

  private disposeHistoryIpc: (() => void) | null = null

  private readonly applicationShutdown = new ApplicationShutdown(
    () => [
      {
        component: 'AGENT',
        execute: () => this.agentCoordinator?.shutdown()
      },
      {
        component: 'BROWSER',
        execute: () => this.browserService?.shutdown()
      },
      {
        component: 'AGENT_IPC',
        execute: () => this.disposeAgentIpc?.()
      },
      {
        component: 'HISTORY_IPC',
        execute: () => this.disposeHistoryIpc?.()
      },
      {
        component: 'HISTORY_REPOSITORY',
        execute: () => this.historyRepository?.close()
      },
      {
        component: 'RUNTIME_REFERENCES',
        execute: () => {
          this.disposeAgentIpc = null
          this.disposeHistoryIpc = null
          this.historyRepository = null
          this.agentCoordinator = null
          this.browserService = null
        }
      }
    ],
    (component) => {
      console.error(`Falha no encerramento seguro: ${component}`)
    }
  )

  private readonly applicationLifecycle = new ApplicationRuntimeLifecycle(
    () => this.initializeResources(),
    () => this.applicationShutdown.run()
  )

  constructor(private readonly electronBoundary: MainApplicationRuntimeElectronBoundary) {}

  initialize(): Promise<void> {
    return this.applicationLifecycle.initialize()
  }

  private async initializeResources(): Promise<void> {
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

    const clock = new SystemClock()
    const sanitizer = new SafeMessageSanitizerAdapter()
    const historyService = new ResearchHistoryService({
      repository: this.historyRepository,
      clock,
      idGenerator: new UuidGenerator(),
      sanitizer
    })

    const workspace = new PlaywrightAgentWorkspaceAdapter(
      this.browserService,
      sessionService,
      queueFilterController,
      {
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
      }
    )

    this.agentCoordinator = new ContinuousAgentCoordinator({
      state: new AgentStateMachine(),
      workspace,
      history: historyService,
      clock,
      sanitizer
    })

    const pdfFileService = new PdfFileService(shell, {
      stat
    })

    registerBrowserIpcHandlers(this.electronBoundary.ipcMain, this.browserService)

    registerSessionIpcHandlers(this.electronBoundary.ipcMain, sessionService)

    this.disposeAgentIpc = registerContinuousAgentIpcHandlers(
      this.electronBoundary.ipcMain,
      new ContinuousAgentIpcAdapter(this.agentCoordinator),
      this.electronBoundary.eventSender
    )

    this.disposeHistoryIpc = registerHistoryIpcHandlers(
      this.electronBoundary.ipcMain,
      historyService,
      this.electronBoundary.eventSender
    )

    registerPdfIpcHandlers(this.electronBoundary.ipcMain, pdfFileService)
  }

  shutdown(): Promise<void> {
    return this.applicationLifecycle.shutdown()
  }
}
