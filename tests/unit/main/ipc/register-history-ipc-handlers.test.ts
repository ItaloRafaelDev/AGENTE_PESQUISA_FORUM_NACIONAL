import { describe, expect, it } from 'vitest'
import {
  registerHistoryIpcHandlers,
  type HistoryEventSender,
  type HistoryIpcMainRegistrar,
  type HistoryReadWriteService
} from '@/main/ipc/register-history-ipc-handlers'
import { INVALID_IPC_ARGUMENTS_MESSAGE } from '@/main/ipc/ipc-argument-contracts'
import type {
  ResearchHistoryEvent,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '@/application/history/research-history-model'
import { HISTORY_IPC_CHANNELS } from '@/shared/types/history-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

const record: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-44',
  classification: 'HA_INFORMACOES',
  cpiResult: 'Há Informações',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:00.000Z',
  durationMs: 60_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

const page: ResearchHistoryPage = {
  items: [record],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1
}

class FakeIpcMain implements HistoryIpcMainRegistrar {
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

class FakeHistoryService implements HistoryReadWriteService {
  public readonly listInputs: unknown[] = []
  public clearCalls = 0
  public unsubscribeCalls = 0

  private listener: ((event: ResearchHistoryEvent) => void) | null = null

  list(input: { page: number; pageSize: number }): ResearchHistoryPage {
    this.listInputs.push(input)

    return page
  }

  clear(): void {
    this.clearCalls += 1
  }

  subscribe(listener: (event: ResearchHistoryEvent) => void): () => void {
    this.listener = listener

    return () => {
      this.unsubscribeCalls += 1
      this.listener = null
    }
  }

  emit(event: ResearchHistoryEvent): void {
    this.listener?.(event)
  }
}

class FakeEventSender implements HistoryEventSender {
  public readonly events: Array<{
    channel: string
    payload: unknown
  }> = []

  send(channel: string, payload: unknown): void {
    this.events.push({
      channel,
      payload
    })
  }
}

describe('registerHistoryIpcHandlers', () => {
  it('registra somente listagem e limpeza', () => {
    const ipcMain = new FakeIpcMain()

    registerHistoryIpcHandlers(ipcMain, new FakeHistoryService(), new FakeEventSender())

    expect([...ipcMain.handlers.keys()]).toEqual([
      HISTORY_IPC_CHANNELS.list,
      HISTORY_IPC_CHANNELS.clear
    ])
  })

  it('remove handlers antigos antes de registrar', () => {
    const ipcMain = new FakeIpcMain()

    registerHistoryIpcHandlers(ipcMain, new FakeHistoryService(), new FakeEventSender())

    expect(ipcMain.removedChannels).toEqual([HISTORY_IPC_CHANNELS.list, HISTORY_IPC_CHANNELS.clear])
  })

  it('lista uma página válida', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    const result = await ipcMain.invoke(HISTORY_IPC_CHANNELS.list, {
      page: 1,
      pageSize: 50
    })

    expect(result).toEqual(page)
    expect(result).not.toBe(page)

    expect(service.listInputs).toEqual([
      {
        page: 1,
        pageSize: 50
      }
    ])
  })

  it('rejeita página menor que 1', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    await expect(
      ipcMain.invoke(HISTORY_IPC_CHANNELS.list, {
        page: 0,
        pageSize: 50
      })
    ).rejects.toThrow()

    expect(service.listInputs).toEqual([])
  })

  it('rejeita página com mais de 100 registros', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    await expect(
      ipcMain.invoke(HISTORY_IPC_CHANNELS.list, {
        page: 1,
        pageSize: 101
      })
    ).rejects.toThrow()

    expect(service.listInputs).toEqual([])
  })

  it('rejeita campos arbitrários como SQL', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    await expect(
      ipcMain.invoke(HISTORY_IPC_CHANNELS.list, {
        page: 1,
        pageSize: 50,
        sql: 'DELETE FROM research_history'
      })
    ).rejects.toThrow()

    expect(service.listInputs).toEqual([])
  })

  it('rejeita argumentos extras antes de listar o histórico', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    const listener = ipcMain.handlers.get(HISTORY_IPC_CHANNELS.list)

    await expect(
      Promise.resolve().then(() => listener?.({}, { page: 1, pageSize: 50 }, 'unexpected'))
    ).rejects.toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)
    expect(service.listInputs).toEqual([])
  })

  it('limpa o histórico pelo serviço controlado', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    await expect(ipcMain.invoke(HISTORY_IPC_CHANNELS.clear)).resolves.toBeUndefined()

    expect(service.clearCalls).toBe(1)
  })

  it('encaminha eventos CREATED, UPDATED e CLEARED', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()
    const sender = new FakeEventSender()

    registerHistoryIpcHandlers(ipcMain, service, sender)

    service.emit({
      type: 'CREATED',
      record
    })

    service.emit({
      type: 'UPDATED',
      record
    })

    service.emit({
      type: 'CLEARED'
    })

    expect(sender.events).toEqual([
      {
        channel: HISTORY_IPC_CHANNELS.recordCreated,
        payload: record
      },
      {
        channel: HISTORY_IPC_CHANNELS.recordUpdated,
        payload: record
      },
      {
        channel: HISTORY_IPC_CHANNELS.cleared,
        payload: undefined
      }
    ])
    expect(sender.events[0]?.payload).not.toBe(record)
    expect(sender.events[1]?.payload).not.toBe(record)
  })

  it('descarta inscrição e handlers ao finalizar', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeHistoryService()

    const dispose = registerHistoryIpcHandlers(ipcMain, service, new FakeEventSender())

    dispose()

    expect(service.unsubscribeCalls).toBe(1)
    expect(ipcMain.handlers.size).toBe(0)
  })
})
