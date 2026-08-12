import { PDF_IPC_CHANNELS, type PdfActionResult } from '../../shared/types/pdf-api'
import { parsePdfPathIpcArguments } from './ipc-argument-contracts'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface PdfIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void

  removeHandler(channel: string): void
}

export interface PdfActionService {
  open(path: string): Promise<PdfActionResult>

  reveal(path: string): Promise<PdfActionResult>
}

export function registerPdfIpcHandlers(
  ipcMain: PdfIpcMainRegistrar,
  pdfService: PdfActionService
): void {
  Object.values(PDF_IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(PDF_IPC_CHANNELS.open, (_event, ...rawArguments) => {
    const path = parsePdfPathIpcArguments(rawArguments)

    return pdfService.open(path)
  })

  ipcMain.handle(PDF_IPC_CHANNELS.reveal, (_event, ...rawArguments) => {
    const path = parsePdfPathIpcArguments(rawArguments)

    return pdfService.reveal(path)
  })
}
