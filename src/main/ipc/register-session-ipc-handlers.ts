import { SESSION_IPC_CHANNELS, type PlatformSessionsSnapshot } from '../../shared/types/session-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface SessionIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}

export interface SessionReadService {
  getSnapshot(): Promise<PlatformSessionsSnapshot>
}

export function registerSessionIpcHandlers(
  ipcMain: SessionIpcMainRegistrar,
  sessionService: SessionReadService
): void {
  ipcMain.removeHandler(SESSION_IPC_CHANNELS.status)

  ipcMain.handle(SESSION_IPC_CHANNELS.status, async () => sessionService.getSnapshot())
}
