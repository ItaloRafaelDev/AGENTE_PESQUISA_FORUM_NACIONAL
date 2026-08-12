import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { MainApplicationRuntime } from './main-application-runtime'
import { installWindowSecurity } from './security/install-window-security'
import { MainWindowEventSender } from './security/main-window-event-sender'
import { NavigationSecurityPolicy } from './security/navigation-security-policy'
import { RendererIpcAuthorizer } from './security/renderer-ipc-authorizer'
import { resolveApprovedRendererUrl } from './security/renderer-location'
import { SecureIpcMainRegistrar } from './security/secure-ipc-main-registrar'

const rendererHtmlPath = join(__dirname, '../renderer/index.html')
const approvedRendererUrl = resolveApprovedRendererUrl({
  developmentUrl: is.dev ? process.env.ELECTRON_RENDERER_URL : undefined,
  productionHtmlPath: rendererHtmlPath
})
const navigationSecurityPolicy = new NavigationSecurityPolicy(approvedRendererUrl)

let mainWindow: BrowserWindow | null = null

const getMainWindow = (): BrowserWindow | null => mainWindow
const rendererIpcAuthorizer = new RendererIpcAuthorizer(getMainWindow, approvedRendererUrl)
const secureIpcMain = new SecureIpcMainRegistrar(ipcMain, rendererIpcAuthorizer)
const eventSender = new MainWindowEventSender(getMainWindow)
const mainRuntime = new MainApplicationRuntime({
  ipcMain: secureIpcMain,
  eventSender
})

let isQuitting = false

function createWindow(): void {
  const createdWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = createdWindow

  installWindowSecurity(createdWindow, navigationSecurityPolicy, shell)

  createdWindow.on('ready-to-show', () => {
    createdWindow.show()
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void createdWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void createdWindow.loadFile(rendererHtmlPath)
  }
}

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
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

      await mainRuntime.initialize()

      if (isQuitting) {
        return
      }

      createWindow()
    })
    .catch(() => {
      console.error('Falha ao inicializar o Agente CPI.')

      if (!isQuitting) {
        app.quit()
      }
    })

  app.on('before-quit', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    isQuitting = true

    void mainRuntime.shutdown().finally(() => {
      app.quit()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
