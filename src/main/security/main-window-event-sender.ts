export interface MainWindowEventTarget {
  readonly webContents: {
    send(channel: string, payload: unknown): void
  }
  isDestroyed(): boolean
}

export class MainWindowEventSender {
  constructor(private readonly getMainWindow: () => MainWindowEventTarget | null) {}

  send(channel: string, payload: unknown): void {
    const mainWindow = this.getMainWindow()

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(channel, payload)
  }
}
