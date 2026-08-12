import { describe, expect, it } from 'vitest'
import {
  registerPdfIpcHandlers,
  type PdfActionService,
  type PdfIpcMainRegistrar
} from '@/main/ipc/register-pdf-ipc-handlers'
import { INVALID_IPC_ARGUMENTS_MESSAGE } from '@/main/ipc/ipc-argument-contracts'
import { PDF_IPC_CHANNELS, type PdfActionResult } from '@/shared/types/pdf-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

class FakeIpcMain implements PdfIpcMainRegistrar {
  public readonly handlers = new Map<string, IpcHandler>()

  public readonly removedChannels: string[] = []

  handle(channel: string, listener: IpcHandler): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.removedChannels.push(channel)
    this.handlers.delete(channel)
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)

    if (!handler) {
      throw new Error(`Handler não registrado: ${channel}`)
    }

    return handler({}, ...args)
  }
}

class FakePdfService implements PdfActionService {
  public readonly openedPaths: string[] = []
  public readonly revealedPaths: string[] = []

  async open(path: string): Promise<PdfActionResult> {
    this.openedPaths.push(path)

    return {
      status: 'OPENED'
    }
  }

  async reveal(path: string): Promise<PdfActionResult> {
    this.revealedPaths.push(path)

    return {
      status: 'REVEALED'
    }
  }
}

const pdfPath = 'E:\\PDF-AGENTE-CPI\\resultado.pdf'

describe('registerPdfIpcHandlers', () => {
  it('registra somente os dois canais permitidos', () => {
    const ipcMain = new FakeIpcMain()

    registerPdfIpcHandlers(ipcMain, new FakePdfService())

    expect([...ipcMain.handlers.keys()]).toEqual([PDF_IPC_CHANNELS.open, PDF_IPC_CHANNELS.reveal])
  })

  it('remove handlers antigos antes de registrar', () => {
    const ipcMain = new FakeIpcMain()

    registerPdfIpcHandlers(ipcMain, new FakePdfService())

    expect(ipcMain.removedChannels).toEqual([PDF_IPC_CHANNELS.open, PDF_IPC_CHANNELS.reveal])
  })

  it('encaminha abertura com caminho validado', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakePdfService()

    registerPdfIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(PDF_IPC_CHANNELS.open, `  ${pdfPath}  `)).resolves.toEqual({
      status: 'OPENED'
    })

    expect(service.openedPaths).toEqual([pdfPath])
  })

  it('encaminha revelação com caminho validado', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakePdfService()

    registerPdfIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(PDF_IPC_CHANNELS.reveal, pdfPath)).resolves.toEqual({
      status: 'REVEALED'
    })

    expect(service.revealedPaths).toEqual([pdfPath])
  })

  it('rejeita caminho vazio antes de alcançar o serviço', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakePdfService()

    registerPdfIpcHandlers(ipcMain, service)

    await expect(ipcMain.invoke(PDF_IPC_CHANNELS.open, '   ')).rejects.toThrow()

    expect(service.openedPaths).toEqual([])
  })

  it('rejeita argumento que não seja texto', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakePdfService()

    registerPdfIpcHandlers(ipcMain, service)

    await expect(
      ipcMain.invoke(PDF_IPC_CHANNELS.open, {
        command: 'arbitrário'
      })
    ).rejects.toThrow()

    expect(service.openedPaths).toEqual([])
  })

  it('rejeita argumentos extras antes de abrir o PDF', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakePdfService()

    registerPdfIpcHandlers(ipcMain, service)

    const listener = ipcMain.handlers.get(PDF_IPC_CHANNELS.open)

    await expect(
      Promise.resolve().then(() => listener?.({}, pdfPath, 'unexpected'))
    ).rejects.toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)
    expect(service.openedPaths).toEqual([])
  })
})
