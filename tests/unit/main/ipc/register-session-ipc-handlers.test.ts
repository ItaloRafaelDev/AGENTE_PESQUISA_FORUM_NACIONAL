import { describe, expect, it, vi } from 'vitest'
import {
  registerSessionIpcHandlers,
  type SessionIpcMainRegistrar,
  type SessionReadService
} from '@/main/ipc/register-session-ipc-handlers'
import { SESSION_IPC_CHANNELS } from '@/shared/types/session-api'

describe('registerSessionIpcHandlers', () => {
  it('substitui o handler anterior e delega a leitura da sessão', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain: SessionIpcMainRegistrar = {
      removeHandler: vi.fn((channel) => {
        handlers.delete(channel)
      }),
      handle: vi.fn((channel, listener) => {
        handlers.set(channel, listener)
      })
    }
    const snapshot = {
      cpi: {
        state: 'AUTHENTICATED' as const,
        url: 'https://adm.cpicentral.com.br/fila'
      },
      deskData: {
        state: 'AUTHENTICATED' as const,
        url: 'https://app.deskdata.com.br/pessoas/'
      },
      allAuthenticated: true,
      checkedAt: '2026-07-27T20:00:00.000Z'
    }
    const sessionService: SessionReadService = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot)
    }

    registerSessionIpcHandlers(ipcMain, sessionService)

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(SESSION_IPC_CHANNELS.status)
    expect(ipcMain.handle).toHaveBeenCalledWith(SESSION_IPC_CHANNELS.status, expect.any(Function))

    const handler = handlers.get(SESSION_IPC_CHANNELS.status)
    await expect(handler?.({})).resolves.toEqual(snapshot)
    expect(sessionService.getSnapshot).toHaveBeenCalledOnce()
  })
})
