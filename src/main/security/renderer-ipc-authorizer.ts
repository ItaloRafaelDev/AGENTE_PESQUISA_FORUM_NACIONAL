import { isApprovedRendererUrl } from './renderer-location'

export const UNAUTHORIZED_IPC_MESSAGE = 'Origem IPC não autorizada.'

export interface RendererFrameLike {
  readonly url: string
}

export interface RendererWebContentsLike {
  readonly mainFrame: RendererFrameLike
}

export interface RendererWindowLike {
  readonly webContents: RendererWebContentsLike
  isDestroyed(): boolean
}

export interface IpcInvokeEventLike {
  readonly sender: RendererWebContentsLike
  readonly senderFrame: RendererFrameLike | null
}

export interface IpcEventAuthorizer {
  assertAuthorized(event: unknown): void
}

export class RendererIpcAuthorizer implements IpcEventAuthorizer {
  constructor(
    private readonly getMainWindow: () => RendererWindowLike | null,
    private readonly approvedRendererUrl: URL
  ) {}

  assertAuthorized(rawEvent: unknown): void {
    const event = rawEvent as Partial<IpcInvokeEventLike>
    const mainWindow = this.getMainWindow()

    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      !event.senderFrame ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !isApprovedRendererUrl(event.senderFrame.url, this.approvedRendererUrl)
    ) {
      throw new Error(UNAUTHORIZED_IPC_MESSAGE)
    }
  }
}
