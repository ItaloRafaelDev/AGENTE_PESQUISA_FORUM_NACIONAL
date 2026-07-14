import { BROWSER_IPC_CHANNELS, type BrowserManagerSnapshot } from '../../shared/types/browser-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface IpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}

export interface BrowserControlService {
  start(): Promise<BrowserManagerSnapshot>
  stop(): Promise<BrowserManagerSnapshot>
  getSnapshot(): BrowserManagerSnapshot
}

export function registerBrowserIpcHandlers(
  ipcMain: IpcMainRegistrar,
  browserService: BrowserControlService
): void {
  const channels = Object.values(BROWSER_IPC_CHANNELS)

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(BROWSER_IPC_CHANNELS.start, async () => {
    return browserService.start()
  })

  ipcMain.handle(BROWSER_IPC_CHANNELS.stop, async () => {
    return browserService.stop()
  })

  ipcMain.handle(BROWSER_IPC_CHANNELS.status, () => {
    return browserService.getSnapshot()
  })
}
