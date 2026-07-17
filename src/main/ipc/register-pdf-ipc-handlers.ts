import { z } from 'zod'
import { PDF_IPC_CHANNELS, type PdfActionResult } from '../../shared/types/pdf-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface PdfIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void

  removeHandler(channel: string): void
}

export interface PdfActionService {
  open(path: string): Promise<PdfActionResult>

  reveal(path: string): Promise<PdfActionResult>
}

const pdfPathSchema = z.string().trim().min(1, 'Caminho de PDF não informado')

export function registerPdfIpcHandlers(
  ipcMain: PdfIpcMainRegistrar,
  pdfService: PdfActionService
): void {
  Object.values(PDF_IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(PDF_IPC_CHANNELS.open, (_event, rawPath) => {
    const path = pdfPathSchema.parse(rawPath)

    return pdfService.open(path)
  })

  ipcMain.handle(PDF_IPC_CHANNELS.reveal, (_event, rawPath) => {
    const path = pdfPathSchema.parse(rawPath)

    return pdfService.reveal(path)
  })
}
