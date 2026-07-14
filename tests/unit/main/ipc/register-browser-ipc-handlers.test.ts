import { describe, expect, it } from 'vitest'
import {
  registerBrowserIpcHandlers,
  type BrowserControlService,
  type IpcMainRegistrar
} from '@/main/ipc/register-browser-ipc-handlers'
import { BROWSER_IPC_CHANNELS, type BrowserManagerSnapshot } from '@/shared/types/browser-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

class FakeIpcMain implements IpcMainRegistrar {
  public readonly handlers = new Map<string, IpcHandler>()
  public readonly removedChannels: string[] = []

  handle(channel: string, listener: IpcHandler): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.removedChannels.push(channel)
    this.handlers.delete(channel)
  }

  async invoke(channel: string): Promise<unknown> {
    const handler = this.handlers.get(channel)

    if (!handler) {
      throw new Error(`Handler não registrado: ${channel}`)
    }

    return handler({})
  }
}

function createSnapshot(state: BrowserManagerSnapshot['state']): BrowserManagerSnapshot {
  return {
    state,
    profilePath: 'E:\\AgenteCPI\\browser-profile',
    startedAt: state === 'RUNNING' ? '2026-07-13T22:00:00.000Z' : null
  }
}

class FakeBrowserService implements BrowserControlService {
  public startCalls = 0
  public stopCalls = 0
  public statusCalls = 0

  async start(): Promise<BrowserManagerSnapshot> {
    this.startCalls += 1
    return createSnapshot('RUNNING')
  }

  async stop(): Promise<BrowserManagerSnapshot> {
    this.stopCalls += 1
    return createSnapshot('STOPPED')
  }

  getSnapshot(): BrowserManagerSnapshot {
    this.statusCalls += 1
    return createSnapshot('STOPPED')
  }
}

describe('registerBrowserIpcHandlers', () => {
  it('deve registrar os três canais permitidos', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeBrowserService()

    registerBrowserIpcHandlers(ipcMain, service)

    expect([...ipcMain.handlers.keys()]).toEqual([
      BROWSER_IPC_CHANNELS.start,
      BROWSER_IPC_CHANNELS.stop,
      BROWSER_IPC_CHANNELS.status
    ])
  })

  it('deve iniciar o navegador pelo canal browser:start', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeBrowserService()

    registerBrowserIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(BROWSER_IPC_CHANNELS.start)).resolves.toEqual(
      createSnapshot('RUNNING')
    )

    expect(service.startCalls).toBe(1)
  })

  it('deve parar o navegador pelo canal browser:stop', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeBrowserService()

    registerBrowserIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(BROWSER_IPC_CHANNELS.stop)).resolves.toEqual(
      createSnapshot('STOPPED')
    )

    expect(service.stopCalls).toBe(1)
  })

  it('deve consultar o estado sem alterar o navegador', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeBrowserService()

    registerBrowserIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(BROWSER_IPC_CHANNELS.status)).resolves.toEqual(
      createSnapshot('STOPPED')
    )

    expect(service.statusCalls).toBe(1)
  })

  it('deve remover handlers antigos antes de registrar novamente', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeBrowserService()

    registerBrowserIpcHandlers(ipcMain, service)

    expect(ipcMain.removedChannels).toEqual([
      BROWSER_IPC_CHANNELS.start,
      BROWSER_IPC_CHANNELS.stop,
      BROWSER_IPC_CHANNELS.status
    ])
  })
})
