import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APPLICATION_IDENTITY } from '@/shared/config/application-identity'

const electron = vi.hoisted(() => ({
  appOn: vi.fn(),
  quit: vi.fn(),
  requestSingleInstanceLock: vi.fn(),
  setAppUserModelId: vi.fn(),
  whenReady: vi.fn(),
  initialize: vi.fn(),
  shutdown: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    on: electron.appOn,
    quit: electron.quit,
    requestSingleInstanceLock: electron.requestSingleInstanceLock,
    whenReady: electron.whenReady
  },
  BrowserWindow: class {},
  ipcMain: {},
  shell: {}
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: {
    setAppUserModelId: electron.setAppUserModelId
  },
  is: { dev: false },
  optimizer: {
    watchWindowShortcuts: vi.fn()
  }
}))

vi.mock('@/main/main-application-runtime', () => ({
  MainApplicationRuntime: class {
    initialize = electron.initialize
    shutdown = electron.shutdown
  }
}))

vi.mock('@/main/startup/application-startup-options', () => ({
  parseApplicationStartupOptions: vi.fn(() => ({ mode: 'production' }))
}))

vi.mock('@/main/startup/configure-application-paths', () => ({
  configureApplicationPaths: vi.fn(() => ({
    appDataDirectory: 'C:\\AppData',
    userDataDirectory: 'C:\\AppData\\agente-cpi'
  }))
}))

vi.mock('@/main/security/install-window-security', () => ({
  installWindowSecurity: vi.fn()
}))

vi.mock('@/main/security/main-window-event-sender', () => ({
  MainWindowEventSender: class {}
}))

vi.mock('@/main/security/navigation-security-policy', () => ({
  NavigationSecurityPolicy: class {}
}))

vi.mock('@/main/security/renderer-ipc-authorizer', () => ({
  RendererIpcAuthorizer: class {}
}))

vi.mock('@/main/security/renderer-location', () => ({
  resolveApprovedRendererUrl: vi.fn(() => 'file:///renderer/index.html')
}))

vi.mock('@/main/security/secure-ipc-main-registrar', () => ({
  SecureIpcMainRegistrar: class {}
}))

describe('main application identity', () => {
  beforeEach(() => {
    vi.resetModules()
    electron.appOn.mockReset()
    electron.quit.mockReset()
    electron.requestSingleInstanceLock.mockReset()
    electron.setAppUserModelId.mockReset()
    electron.whenReady.mockReset()
    electron.initialize.mockReset()
    electron.shutdown.mockReset()
    electron.requestSingleInstanceLock.mockReturnValue(true)
    electron.whenReady.mockResolvedValue(undefined)
    electron.initialize.mockReturnValue(new Promise<void>(() => undefined))
    electron.shutdown.mockResolvedValue(undefined)
  })

  it('registra o App User Model ID canônico na fronteira Electron ao iniciar', async () => {
    await import('@/main/index')
    await Promise.resolve()

    expect(electron.setAppUserModelId).toHaveBeenCalledExactlyOnceWith(APPLICATION_IDENTITY.appId)
  })
})
