import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_RUNTIME_IPC_CHANNELS,
  createInitialAgentPublicState
} from '@/shared/types/agent-runtime-api'
import { BROWSER_IPC_CHANNELS } from '@/shared/types/browser-api'
import { HISTORY_IPC_CHANNELS } from '@/shared/types/history-api'
import { PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'
import { SESSION_IPC_CHANNELS } from '@/shared/types/session-api'
import type { AgentApi } from '@/shared/types/agent-api'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

const contextIsolatedDescriptor = Object.getOwnPropertyDescriptor(process, 'contextIsolated')

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electron.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {}
}))

async function loadAgentApi(): Promise<AgentApi> {
  Object.defineProperty(process, 'contextIsolated', {
    configurable: true,
    value: true
  })
  vi.resetModules()
  await import('@/preload/index')

  const call = electron.exposeInMainWorld.mock.calls.find(([name]) => name === 'agent')
  if (!call) {
    throw new Error('API agent não exposta pelo preload')
  }

  return call[1] as AgentApi
}

beforeEach(() => {
  electron.exposeInMainWorld.mockReset()
  electron.invoke.mockReset()
  electron.on.mockReset()
  electron.removeListener.mockReset()
  electron.invoke.mockResolvedValue(undefined)
})

afterEach(() => {
  if (contextIsolatedDescriptor) {
    Object.defineProperty(process, 'contextIsolated', contextIsolatedDescriptor)
    return
  }

  delete (process as NodeJS.Process & { contextIsolated?: boolean }).contextIsolated
})

describe('preload agent API', () => {
  it('mapeia comandos tipados para os canais IPC aprovados', async () => {
    const api = await loadAgentApi()
    const expectedCalls = [
      [BROWSER_IPC_CHANNELS.start],
      [BROWSER_IPC_CHANNELS.stop],
      [BROWSER_IPC_CHANNELS.status],
      [AGENT_RUNTIME_IPC_CHANNELS.getState],
      [AGENT_RUNTIME_IPC_CHANNELS.start],
      [AGENT_RUNTIME_IPC_CHANNELS.pause],
      [AGENT_RUNTIME_IPC_CHANNELS.resume],
      [AGENT_RUNTIME_IPC_CHANNELS.stop],
      [AGENT_RUNTIME_IPC_CHANNELS.loginCompleted],
      [SESSION_IPC_CHANNELS.status],
      [HISTORY_IPC_CHANNELS.list, { page: 1, pageSize: 50 }],
      [HISTORY_IPC_CHANNELS.clear],
      [PDF_IPC_CHANNELS.open, 'E:\\PDF-AGENTE-CPI\\resultado.pdf'],
      [PDF_IPC_CHANNELS.reveal, 'E:\\PDF-AGENTE-CPI\\resultado.pdf']
    ]
    const sentinels = expectedCalls.map(([channel], index) => ({
      channel,
      invocation: index + 1
    }))

    sentinels.forEach((sentinel) => electron.invoke.mockResolvedValueOnce(sentinel))

    const results = [
      await api.browser.start(),
      await api.browser.stop(),
      await api.browser.getStatus(),
      await api.control.getState(),
      await api.control.start(),
      await api.control.pause(),
      await api.control.resume(),
      await api.control.stop(),
      await api.control.loginCompleted(),
      await api.sessions.getStatus(),
      await api.history.list({ page: 1, pageSize: 50 }),
      await api.history.clear(),
      await api.pdf.open('E:\\PDF-AGENTE-CPI\\resultado.pdf'),
      await api.pdf.reveal('E:\\PDF-AGENTE-CPI\\resultado.pdf')
    ]

    expect(results).toEqual(sentinels)
    expect(electron.invoke.mock.calls).toEqual(expectedCalls)

    expect(electron.exposeInMainWorld.mock.calls.map(([name]) => name)).toEqual(['agent'])
    expect(Object.keys(api)).toEqual(['browser', 'control', 'sessions', 'history', 'pdf'])
    expect(Object.keys(api.browser)).toEqual(['start', 'stop', 'getStatus'])
    expect(Object.keys(api.control)).toEqual([
      'getState',
      'start',
      'pause',
      'resume',
      'stop',
      'loginCompleted',
      'onStateChanged'
    ])
    expect(Object.keys(api.sessions)).toEqual(['getStatus'])
    expect(Object.keys(api.history)).toEqual([
      'list',
      'clear',
      'onRecordCreated',
      'onRecordUpdated',
      'onCleared'
    ])
    expect(Object.keys(api.pdf)).toEqual(['open', 'reveal'])
  })

  it('encaminha eventos e remove exatamente os listeners registrados', async () => {
    const api = await loadAgentApi()
    const stateListener = vi.fn()
    const recordCreatedListener = vi.fn()
    const recordUpdatedListener = vi.fn()
    const clearedListener = vi.fn()
    const unsubscribers = [
      api.control.onStateChanged(stateListener),
      api.history.onRecordCreated(recordCreatedListener),
      api.history.onRecordUpdated(recordUpdatedListener),
      api.history.onCleared(clearedListener)
    ]
    const [stateHandler, createdHandler, updatedHandler, clearedHandler] =
      electron.on.mock.calls.map(([, handler]) => handler) as [
        (event: unknown, payload: unknown) => void,
        (event: unknown, payload: unknown) => void,
        (event: unknown, payload: unknown) => void,
        (event: unknown) => void
      ]
    const state = createInitialAgentPublicState()
    const record = {
      id: 'history-1',
      maskedCpf: '***.***.***-**',
      classification: null,
      cpiResult: null,
      status: 'CONCLUIDO' as const,
      startedAt: '2026-07-27T00:00:00.000Z',
      finishedAt: '2026-07-27T00:01:00.000Z',
      durationMs: 60_000,
      pdfPath: null,
      errorStage: null,
      errorMessage: null,
      createdAt: '2026-07-27T00:00:00.000Z'
    }

    expect(electron.on.mock.calls).toEqual([
      [AGENT_RUNTIME_IPC_CHANNELS.stateChanged, expect.any(Function)],
      [HISTORY_IPC_CHANNELS.recordCreated, expect.any(Function)],
      [HISTORY_IPC_CHANNELS.recordUpdated, expect.any(Function)],
      [HISTORY_IPC_CHANNELS.cleared, expect.any(Function)]
    ])
    stateHandler({}, state)
    createdHandler({}, record)
    updatedHandler({}, record)
    clearedHandler({})
    expect(stateListener).toHaveBeenCalledWith(state)
    expect(recordCreatedListener).toHaveBeenCalledWith(record)
    expect(recordUpdatedListener).toHaveBeenCalledWith(record)
    expect(clearedListener).toHaveBeenCalledWith()

    unsubscribers.forEach((unsubscribe) => unsubscribe())
    expect(electron.removeListener.mock.calls).toEqual([
      [AGENT_RUNTIME_IPC_CHANNELS.stateChanged, stateHandler],
      [HISTORY_IPC_CHANNELS.recordCreated, createdHandler],
      [HISTORY_IPC_CHANNELS.recordUpdated, updatedHandler],
      [HISTORY_IPC_CHANNELS.cleared, clearedHandler]
    ])
  })

  it('recusa inicialização fora de context isolation', async () => {
    Object.defineProperty(process, 'contextIsolated', {
      configurable: true,
      value: false
    })
    vi.resetModules()

    await expect(import('@/preload/index')).rejects.toThrow(
      'O Agente CPI exige contextIsolation habilitado.'
    )
    expect(electron.exposeInMainWorld).not.toHaveBeenCalled()
  })
})
