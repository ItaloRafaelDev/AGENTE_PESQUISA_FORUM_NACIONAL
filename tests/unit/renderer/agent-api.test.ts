// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { AgentApi } from '@/shared/types/agent-api'
import type { AgentPublicState } from '@/shared/types/agent-runtime-api'

function createAgentApiFake(label: string): AgentApi {
  return {
    browser: {
      start: () => Promise.resolve({ state: 'STOPPED', profilePath: label, startedAt: null }),
      stop: () => Promise.resolve({ state: 'STOPPED', profilePath: label, startedAt: null }),
      getStatus: () => Promise.resolve({ state: 'STOPPED', profilePath: label, startedAt: null })
    },
    control: {
      getState: () => Promise.resolve(createInitialAgentState()),
      start: () => Promise.resolve(createInitialAgentState()),
      pause: () => Promise.resolve(createInitialAgentState()),
      resume: () => Promise.resolve(createInitialAgentState()),
      stop: () => Promise.resolve(createInitialAgentState()),
      loginCompleted: () => Promise.resolve(createInitialAgentState()),
      onStateChanged: () => () => undefined
    },
    sessions: {
      getStatus: () =>
        Promise.resolve({
          cpi: { state: 'INDETERMINATE', url: null },
          deskData: { state: 'INDETERMINATE', url: null },
          allAuthenticated: false,
          checkedAt: null
        })
    },
    history: {
      list: () => Promise.resolve({ items: [], page: 1, pageSize: 1, total: 0, totalPages: 0 }),
      clear: () => Promise.resolve(),
      onRecordCreated: () => () => undefined,
      onRecordUpdated: () => () => undefined,
      onCleared: () => () => undefined
    },
    pdf: {
      open: () => Promise.resolve({ status: 'NOT_FOUND' }),
      reveal: () => Promise.resolve({ status: 'NOT_FOUND' })
    }
  }
}

function createInitialAgentState(): AgentPublicState {
  return {
    status: 'PARADO' as const,
    currentStage: null,
    completedCycles: 0,
    queueStatus: 'DESCONHECIDA' as const,
    nextCheckAt: null,
    remainingSeconds: null,
    currentMaskedCpf: null,
    lastError: null
  }
}

describe('getAgentApi', () => {
  it('retorna a referência atual sem cache ou transformação', async () => {
    const first = createAgentApiFake('first')
    const second = createAgentApiFake('second')

    Object.defineProperty(window, 'agent', { configurable: true, value: first })
    vi.resetModules()
    const { getAgentApi } = await import('@/renderer/src/api/agent-api')

    expect(getAgentApi()).toBe(first)

    Object.defineProperty(window, 'agent', { configurable: true, value: second })
    expect(getAgentApi()).toBe(second)
  })
})
