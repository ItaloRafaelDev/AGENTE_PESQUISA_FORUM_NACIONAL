import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { BrowserManager } from '../automation/browser/browser-manager'
import { BrowserWorkspaceService } from '../automation/browser/browser-workspace-service'
import { PlatformPageManager } from '../automation/browser/platform-page-manager'
import { PlaywrightBrowserLauncher } from '../automation/browser/playwright-browser-launcher'
import { CpiQueueAvailabilityReader } from '../automation/cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../automation/cpi/cpi-queue-monitor'
import { PlatformSessionService } from '../automation/session/platform-session-service'
import { AgentController } from '../automation/workflow/agent-controller'
import { AgentRuntimeService } from '../automation/workflow/agent-runtime-service'
import {
  ensureRuntimeDirectories,
  resolveRuntimePaths
} from '../infrastructure/filesystem/runtime-paths'
import { registerAgentIpcHandlers } from './ipc/register-agent-ipc-handlers'
import { registerBrowserIpcHandlers } from './ipc/register-browser-ipc-handlers'
import { registerSessionIpcHandlers } from './ipc/register-session-ipc-handlers'

let browserService: BrowserWorkspaceService | null = null
let agentRuntimeService: AgentRuntimeService | null = null

const agentController = new AgentController()

let isQuitting = false

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

      const queueMonitor = new CpiQueueMonitor(
        queueFilterController,
        new CpiQueueAvailabilityReader()
      )

      agentRuntimeService = new AgentRuntimeService(
        agentController,
        browserManager,
        sessionService,
        queueFilterController,
        queueMonitor
      )

      registerBrowserIpcHandlers(ipcMain, browserService)
      registerAgentIpcHandlers(ipcMain, agentRuntimeService)
      registerSessionIpcHandlers(ipcMain, sessionService)

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

    const browserRunning = browserService?.getSnapshot().state === 'RUNNING'

    const agentRunning =
      agentRuntimeService !== null && agentRuntimeService.getSnapshot().state !== 'PARADO'

    if (!browserRunning && !agentRunning) {
      return
    }

    event.preventDefault()
    isQuitting = true

    void (async () => {
      try {
        await agentRuntimeService?.stop()
      } catch (error: unknown) {
        console.error('Falha ao encerrar o agente:', error)
      }

      try {
        if (browserRunning) {
          await browserService?.stop()
        }
      } catch (error: unknown) {
        console.error('Falha ao encerrar o navegador:', error)
      }

      app.quit()
    })()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
