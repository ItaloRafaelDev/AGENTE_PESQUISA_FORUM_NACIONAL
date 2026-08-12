import type { IpcEventAuthorizer } from './renderer-ipc-authorizer'

export type IpcHandler = (event: unknown, ...arguments_: unknown[]) => unknown

export interface IpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}

export class SecureIpcMainRegistrar {
  constructor(
    private readonly ipcMain: IpcMainRegistrar,
    private readonly authorizer: IpcEventAuthorizer
  ) {}

  handle(channel: string, listener: IpcHandler): void {
    this.ipcMain.handle(channel, (event, ...arguments_) => {
      this.authorizer.assertAuthorized(event)
      return listener(event, ...arguments_)
    })
  }

  removeHandler(channel: string): void {
    this.ipcMain.removeHandler(channel)
  }
}
