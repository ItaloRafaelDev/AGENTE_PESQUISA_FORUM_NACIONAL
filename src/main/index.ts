import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
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

let browserService: BrowserWorkspaceService | null = null

let agentRuntimeService: ContinuousAgentRuntimeService | null = null

let historyRepository: ResearchHistoryRepository | null = null

let disposeAgentIpc: (() => void) | null = null

let disposeHistoryIpc: (() => void) | null = null

let isQuitting = false

const eventSender = {
  send(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)

    return {
      action: 'deny'
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0]

    if (!mainWindow) {
      return
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })

  app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.cpicentral.agent')

      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
      })

      const runtimePaths = resolveRuntimePaths(join(app.getPath('appData'), 'AgenteCPI'))

      await ensureRuntimeDirectories(runtimePaths)

      const browserManager = new BrowserManager(
        new PlaywrightBrowserLauncher(),
        runtimePaths.browserProfileDir
      )

      browserService = new BrowserWorkspaceService(browserManager, new PlatformPageManager())

      const sessionService = new PlatformSessionService(browserManager)

      const queueFilterController = new CpiQueueFilterController()

      historyRepository = ResearchHistoryRepository.open(
        join(app.getPath('userData'), 'agente-cpi.sqlite')
      )

      historyRepository.markUnfinishedAsInterrupted(new Date().toISOString())

      const historyService = new ResearchHistoryService(historyRepository)

      const stateStore = new AgentPublicStateStore()

      agentRuntimeService = new ContinuousAgentRuntimeService({
        stateStore,
        browser: browserService,
        sessions: sessionService,
        filter: queueFilterController,
        runner: new ContinuousResearchRunner(),
        history: historyService
      })

      const pdfFileService = new PdfFileService(shell, {
        stat
      })

      registerBrowserIpcHandlers(ipcMain, browserService)

      registerSessionIpcHandlers(ipcMain, sessionService)

      disposeAgentIpc = registerContinuousAgentIpcHandlers(
        ipcMain,
        agentRuntimeService,
        eventSender
      )

      disposeHistoryIpc = registerHistoryIpcHandlers(ipcMain, historyService, eventSender)

      registerPdfIpcHandlers(ipcMain, pdfFileService)

      createWindow()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow()
        }
      })
    })
    .catch((error: unknown) => {
      console.error('Falha ao inicializar o Agente CPI:', error)

      app.quit()
    })

  app.on('before-quit', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    isQuitting = true

    void (async () => {
      try {
        await agentRuntimeService?.shutdown()
      } catch (error: unknown) {
        console.error('Falha ao encerrar o agente:', error)
      }

      try {
        if (browserService?.getSnapshot().state === 'RUNNING') {
          await browserService?.stop()
        }
      } catch (error: unknown) {
        console.error('Falha ao encerrar o navegador:', error)
      }

      disposeAgentIpc?.()
      disposeHistoryIpc?.()

      historyRepository?.close()

      disposeAgentIpc = null
      disposeHistoryIpc = null
      historyRepository = null
      agentRuntimeService = null
      browserService = null

      app.quit()
    })()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
