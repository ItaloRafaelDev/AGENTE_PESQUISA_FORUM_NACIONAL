import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { MainApplicationRuntime } from './main-application-runtime'

const mainRuntime = new MainApplicationRuntime()

let isQuitting = false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
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

      await mainRuntime.initialize()

      createWindow()
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
      await mainRuntime.shutdown()

      app.quit()
    })()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
