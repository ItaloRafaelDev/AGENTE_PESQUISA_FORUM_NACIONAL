import { z } from 'zod'
import type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener
} from '../../automation/history/research-history-service'
import {
  HISTORY_IPC_CHANNELS,
  type ResearchHistoryListInput,
  type ResearchHistoryPage
} from '../../shared/types/history-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface HistoryIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void

  removeHandler(channel: string): void
}

export interface HistoryEventSender {
  send(channel: string, payload: unknown): void
}

export interface HistoryReadWriteService {
  list(input: ResearchHistoryListInput): ResearchHistoryPage

  clear(): void

  subscribe(listener: ResearchHistoryEventListener): () => void
}

const listInputSchema = z
  .object({
    page: z.number().int().min(1),

    pageSize: z.number().int().min(1).max(100)
  })
  .strict()

function sendHistoryEvent(sender: HistoryEventSender, event: ResearchHistoryEvent): void {
  switch (event.type) {
    case 'CREATED':
      sender.send(HISTORY_IPC_CHANNELS.recordCreated, event.record)
      return

    case 'UPDATED':
      sender.send(HISTORY_IPC_CHANNELS.recordUpdated, event.record)
      return

    case 'CLEARED':
      sender.send(HISTORY_IPC_CHANNELS.cleared, undefined)
  }
}

export function registerHistoryIpcHandlers(
  ipcMain: HistoryIpcMainRegistrar,
  historyService: HistoryReadWriteService,
  eventSender: HistoryEventSender
): () => void {
  const commandChannels = [HISTORY_IPC_CHANNELS.list, HISTORY_IPC_CHANNELS.clear] as const

  commandChannels.forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(HISTORY_IPC_CHANNELS.list, (_event, rawInput) => {
    const input = listInputSchema.parse(rawInput)

    return historyService.list(input)
  })

  ipcMain.handle(HISTORY_IPC_CHANNELS.clear, () => {
    historyService.clear()
  })

  const unsubscribe = historyService.subscribe((event) => {
    sendHistoryEvent(eventSender, event)
  })

  return () => {
    unsubscribe()

    commandChannels.forEach((channel) => {
      ipcMain.removeHandler(channel)
    })
  }
}
