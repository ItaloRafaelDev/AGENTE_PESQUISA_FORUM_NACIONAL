// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAgentApi } from '@/renderer/src/api/agent-api'
import { useResearchHistory } from '@/renderer/src/features/history/use-research-history'
import type { AgentApi } from '@/shared/types/agent-api'
import { createInitialAgentPublicState } from '@/shared/types/agent-runtime-api'
import type { ResearchHistoryPage, ResearchHistoryRecord } from '@/shared/types/history-api'

vi.mock('@/renderer/src/api/agent-api', () => ({ getAgentApi: vi.fn() }))

const firstRecord: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-44',
  classification: 'HA_INFORMACOES',
  cpiResult: 'Há Informações',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:00.000Z',
  durationMs: 60_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado-1.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

const newerRecord: ResearchHistoryRecord = {
  ...firstRecord,
  id: 'history-2',
  maskedCpf: '***.***.***-88',
  startedAt: '2026-07-14T11:00:00.000Z',
  createdAt: '2026-07-14T11:00:00.000Z'
}

function page(items: ResearchHistoryRecord[]): ResearchHistoryPage {
  return {
    items,
    page: 1,
    pageSize: 50,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

interface AgentApiFake extends AgentApi {
  history: {
    list: ReturnType<typeof vi.fn<AgentApi['history']['list']>>
    clear: ReturnType<typeof vi.fn<AgentApi['history']['clear']>>
    onRecordCreated: ReturnType<typeof vi.fn<AgentApi['history']['onRecordCreated']>>
    onRecordUpdated: ReturnType<typeof vi.fn<AgentApi['history']['onRecordUpdated']>>
    onCleared: ReturnType<typeof vi.fn<AgentApi['history']['onCleared']>>
  }
  pdf: {
    open: ReturnType<typeof vi.fn<AgentApi['pdf']['open']>>
    reveal: ReturnType<typeof vi.fn<AgentApi['pdf']['reveal']>>
  }
}

function createApiFake(initialPage = page([newerRecord, firstRecord])): {
  api: AgentApiFake
  createdListeners: Array<(record: ResearchHistoryRecord) => void>
  updatedListeners: Array<(record: ResearchHistoryRecord) => void>
  clearedListeners: Array<() => void>
  unsubscribeCreated: ReturnType<typeof vi.fn>
  unsubscribeUpdated: ReturnType<typeof vi.fn>
  unsubscribeCleared: ReturnType<typeof vi.fn>
} {
  const createdListeners: Array<(record: ResearchHistoryRecord) => void> = []
  const updatedListeners: Array<(record: ResearchHistoryRecord) => void> = []
  const clearedListeners: Array<() => void> = []
  const unsubscribeCreated = vi.fn()
  const unsubscribeUpdated = vi.fn()
  const unsubscribeCleared = vi.fn()
  const api: AgentApiFake = {
    browser: {
      start: vi.fn().mockResolvedValue({ state: 'RUNNING', profilePath: '', startedAt: null }),
      stop: vi.fn().mockResolvedValue({ state: 'STOPPED', profilePath: '', startedAt: null }),
      getStatus: vi.fn().mockResolvedValue({ state: 'STOPPED', profilePath: '', startedAt: null })
    },
    control: {
      getState: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      start: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      pause: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      resume: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      stop: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      loginCompleted: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      onStateChanged: vi.fn(() => vi.fn())
    },
    sessions: {
      getStatus: vi.fn().mockResolvedValue({
        cpi: { state: 'INDETERMINATE', url: null },
        deskData: { state: 'INDETERMINATE', url: null },
        allAuthenticated: false,
        checkedAt: null
      })
    },
    history: {
      list: vi.fn().mockResolvedValue(initialPage),
      clear: vi.fn().mockResolvedValue(undefined),
      onRecordCreated: vi.fn((listener) => {
        createdListeners.push(listener)
        return unsubscribeCreated
      }),
      onRecordUpdated: vi.fn((listener) => {
        updatedListeners.push(listener)
        return unsubscribeUpdated
      }),
      onCleared: vi.fn((listener) => {
        clearedListeners.push(listener)
        return unsubscribeCleared
      })
    },
    pdf: {
      open: vi.fn().mockResolvedValue({ status: 'OPENED' }),
      reveal: vi.fn().mockResolvedValue({ status: 'REVEALED' })
    }
  }

  return {
    api,
    createdListeners,
    updatedListeners,
    clearedListeners,
    unsubscribeCreated,
    unsubscribeUpdated,
    unsubscribeCleared
  }
}

beforeEach(() => {
  vi.mocked(getAgentApi).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useResearchHistory', () => {
  it('starts loading, uses the injected API and hydrates the exact fixed page', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const { api } = createApiFake()
    api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(api))

    expect(result.current).toMatchObject({
      records: [],
      loading: true,
      busy: false,
      feedback: null
    })
    expect(api.history.list).toHaveBeenCalledTimes(1)
    expect(api.history.list).toHaveBeenCalledWith({ page: 1, pageSize: 50 })
    expect(getAgentApi).not.toHaveBeenCalled()

    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([newerRecord, firstRecord])
    expect(result.current.loading).toBe(false)
  })

  it('defaults to getAgentApi exactly once', async () => {
    const { api } = createApiFake(page([]))
    vi.mocked(getAgentApi).mockReturnValue(api)
    const { result, rerender } = renderHook(() => useResearchHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender()

    expect(getAgentApi).toHaveBeenCalledTimes(1)
    expect(api.history.list).toHaveBeenCalledTimes(1)
  })

  it.each([
    [new Error('Lista indisponível.'), 'Lista indisponível.'],
    [{ reason: 'not-an-error' }, 'Falha ao carregar o histórico.']
  ])('reports list failures and always finishes loading', async (failure, message) => {
    const { api } = createApiFake()
    api.history.list.mockRejectedValue(failure)
    const { result } = renderHook(() => useResearchHistory(api))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.records).toEqual([])
    expect(result.current.feedback).toBe(message)
  })

  it('applies created, updated and cleared events with canonical ordering and deduplication', async () => {
    const { api, createdListeners, updatedListeners, clearedListeners } = createApiFake(page([]))
    const { result } = renderHook(() => useResearchHistory(api))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => createdListeners[0](firstRecord))
    act(() => createdListeners[0](newerRecord))
    act(() =>
      updatedListeners[0]({
        ...firstRecord,
        status: 'INTERROMPIDO',
        errorMessage: 'Interrompido com segurança.'
      })
    )

    expect(result.current.records.map(({ id }) => id)).toEqual(['history-2', 'history-1'])
    expect(result.current.records).toHaveLength(2)
    expect(result.current.records[1]).toMatchObject({
      status: 'INTERROMPIDO',
      errorMessage: 'Interrompido com segurança.'
    })

    act(() => clearedListeners[0]())
    expect(result.current.records).toEqual([])
  })

  it('replays a pending update over the complete late list without losing unrelated records', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))
    const updatedFirstRecord = {
      ...firstRecord,
      status: 'INTERROMPIDO' as const,
      errorMessage: 'Interrompido durante a hidratação.'
    }

    act(() => fake.updatedListeners[0](updatedFirstRecord))
    expect(result.current.records).toEqual([updatedFirstRecord])

    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([newerRecord, updatedFirstRecord])
  })

  it('replays a pending created record over the late list in canonical order', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))
    const createdRecord = {
      ...firstRecord,
      id: 'history-3',
      maskedCpf: '***.***.***-22',
      startedAt: '2026-07-14T12:00:00.000Z',
      createdAt: '2026-07-14T12:00:00.000Z'
    }

    act(() => fake.createdListeners[0](createdRecord))
    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([createdRecord, newerRecord, firstRecord])
  })

  it('replays pending events in arrival order across a clear boundary', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))
    const updatedRecord = { ...firstRecord, status: 'INTERROMPIDO' as const }
    const postClearRecord = {
      ...newerRecord,
      id: 'history-after-clear',
      maskedCpf: '***.***.***-22',
      startedAt: '2026-07-14T12:00:00.000Z'
    }

    act(() => fake.updatedListeners[0](updatedRecord))
    act(() => fake.clearedListeners[0]())
    act(() => fake.createdListeners[0](postClearRecord))
    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([postClearRecord])
  })

  it('deduplicates repeated pending updates by id and preserves final ordering', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))
    const promotedFirstRecord = {
      ...firstRecord,
      startedAt: '2026-07-14T12:00:00.000Z',
      status: 'EM_ANDAMENTO' as const
    }
    const completedFirstRecord = {
      ...promotedFirstRecord,
      status: 'CONCLUIDO' as const,
      errorMessage: null
    }

    act(() => fake.updatedListeners[0](promotedFirstRecord))
    act(() => fake.updatedListeners[0](completedFirstRecord))
    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([completedFirstRecord, newerRecord])
    expect(result.current.records.map(({ id }) => id)).toEqual(['history-1', 'history-2'])
  })

  it('keeps history empty when clear succeeds before the list without a cleared event', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))

    await act(async () => {
      await result.current.clearHistory()
    })
    expect(result.current.records).toEqual([])
    expect(result.current.feedback).toBe('Histórico limpo. Os PDFs foram preservados.')

    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([])
    expect(result.current.feedback).toBe('Histórico limpo. Os PDFs foram preservados.')
  })

  it('orders realtime updates around a successful pending clear command', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const { result } = renderHook(() => useResearchHistory(fake.api))
    const updatedRecord = { ...firstRecord, status: 'INTERROMPIDO' as const }
    const postClearRecord = {
      ...newerRecord,
      id: 'history-after-command-clear',
      maskedCpf: '***.***.***-22',
      startedAt: '2026-07-14T12:00:00.000Z'
    }

    act(() => fake.updatedListeners[0](updatedRecord))
    await act(async () => {
      await result.current.clearHistory()
    })
    act(() => fake.clearedListeners[0]())
    act(() => fake.createdListeners[0](postClearRecord))
    await act(async () => {
      listing.resolve(page([newerRecord, firstRecord]))
      await listing.promise
    })

    expect(result.current.records).toEqual([postClearRecord])
  })

  it('ignores pending list work after unmount and calls all three unsubscribes exactly once', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list.mockReturnValue(listing.promise)
    const view = renderHook(() => useResearchHistory(fake.api))
    view.unmount()

    await act(async () => {
      listing.resolve(page([firstRecord]))
      await listing.promise
      fake.createdListeners[0](newerRecord)
      fake.updatedListeners[0](newerRecord)
      fake.clearedListeners[0]()
    })

    expect(view.result.current).toMatchObject({ records: [], loading: true, feedback: null })
    expect(fake.unsubscribeCreated).toHaveBeenCalledTimes(1)
    expect(fake.unsubscribeUpdated).toHaveBeenCalledTimes(1)
    expect(fake.unsubscribeCleared).toHaveBeenCalledTimes(1)
  })

  it('keeps the replayed StrictMode setup active and rejects listeners retained from cleanup', async () => {
    const fake = createApiFake(page([]))
    const view = renderHook(() => useResearchHistory(fake.api), { reactStrictMode: true })
    await waitFor(() => expect(fake.api.history.onRecordCreated).toHaveBeenCalledTimes(2))

    act(() => fake.createdListeners[0](firstRecord))
    expect(view.result.current.records).toEqual([])

    act(() => fake.createdListeners[1](newerRecord))
    expect(view.result.current.records).toEqual([newerRecord])

    await act(async () => {
      await view.result.current.openPdf(newerRecord.pdfPath as string)
    })
    expect(fake.api.pdf.open).toHaveBeenCalledTimes(1)
    expect(view.result.current.feedback).toBe('PDF aberto.')

    view.unmount()
    expect(fake.unsubscribeCreated).toHaveBeenCalledTimes(2)
    expect(fake.unsubscribeUpdated).toHaveBeenCalledTimes(2)
    expect(fake.unsubscribeCleared).toHaveBeenCalledTimes(2)
  })

  it('isolates a pending StrictMode generation from retained listeners and late list work', async () => {
    const staleListing = deferred<ResearchHistoryPage>()
    const activeListing = deferred<ResearchHistoryPage>()
    const fake = createApiFake()
    fake.api.history.list
      .mockReturnValueOnce(staleListing.promise)
      .mockReturnValueOnce(activeListing.promise)
    const view = renderHook(() => useResearchHistory(fake.api), { reactStrictMode: true })
    await waitFor(() => expect(fake.api.history.list).toHaveBeenCalledTimes(2))
    const activeRecord = {
      ...firstRecord,
      id: 'active-generation',
      maskedCpf: '***.***.***-22',
      startedAt: '2026-07-14T12:00:00.000Z'
    }

    act(() => fake.createdListeners[0](firstRecord))
    act(() => fake.createdListeners[1](activeRecord))
    await act(async () => {
      staleListing.resolve(page([firstRecord]))
      await staleListing.promise
    })
    expect(view.result.current.records).toEqual([activeRecord])

    await act(async () => {
      activeListing.resolve(page([newerRecord]))
      await activeListing.promise
    })
    expect(view.result.current.records).toEqual([activeRecord, newerRecord])
  })

  it.each([
    ['openPdf', 'open', { status: 'OPENED' }, 'PDF aberto.'],
    ['revealPdf', 'reveal', { status: 'REVEALED' }, 'PDF localizado na pasta.']
  ] as const)(
    'reports exact %s success and not-found feedback',
    async (action, command, success, message) => {
      const { api } = createApiFake(page([]))
      const { result } = renderHook(() => useResearchHistory(api))
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current[action](firstRecord.pdfPath as string)
      })
      expect(api.pdf[command]).toHaveBeenCalledWith(firstRecord.pdfPath)
      expect(result.current.feedback).toBe(message)

      api.pdf[command].mockResolvedValueOnce({ status: 'NOT_FOUND' })
      await act(async () => {
        await result.current[action](firstRecord.pdfPath as string)
      })
      expect(result.current.feedback).toBe('PDF não encontrado.')
      expect(result.current.busy).toBe(false)
    }
  )

  it.each([
    [new Error('Acesso indisponível.'), 'Acesso indisponível.'],
    [{ reason: 'not-an-error' }, 'Falha ao acessar o PDF.']
  ])('reports PDF rejection feedback and releases busy', async (failure, message) => {
    const { api } = createApiFake(page([]))
    api.pdf.open.mockRejectedValue(failure)
    const { result } = renderHook(() => useResearchHistory(api))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.openPdf(firstRecord.pdfPath as string)
    })

    expect(result.current.feedback).toBe(message)
    expect(result.current.busy).toBe(false)
  })

  it('uses one synchronous busy lock for every history action', async () => {
    const opening = deferred<{ status: 'OPENED' }>()
    const { api } = createApiFake(page([firstRecord]))
    api.pdf.open.mockReturnValue(opening.promise)
    const { result } = renderHook(() => useResearchHistory(api))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let firstAction!: Promise<void>
    act(() => {
      firstAction = result.current.openPdf(firstRecord.pdfPath as string)
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      await Promise.all([
        result.current.revealPdf(firstRecord.pdfPath as string),
        result.current.clearHistory()
      ])
    })
    expect(api.pdf.reveal).not.toHaveBeenCalled()
    expect(api.history.clear).not.toHaveBeenCalled()
    expect(result.current.records).toEqual([firstRecord])

    await act(async () => {
      opening.resolve({ status: 'OPENED' })
      await firstAction
    })
    expect(result.current.feedback).toBe('PDF aberto.')
    expect(result.current.busy).toBe(false)
  })

  it('clears records only after command success and preserves them on rejection', async () => {
    const clearing = deferred<void>()
    const { api } = createApiFake(page([firstRecord]))
    api.history.clear.mockReturnValue(clearing.promise)
    const { result } = renderHook(() => useResearchHistory(api))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let clearAction!: Promise<void>
    act(() => {
      clearAction = result.current.clearHistory()
    })
    expect(result.current.busy).toBe(true)
    expect(result.current.feedback).toBeNull()
    expect(result.current.records).toEqual([firstRecord])

    await act(async () => {
      clearing.resolve()
      await clearAction
    })
    expect(result.current.records).toEqual([])
    expect(result.current.feedback).toBe('Histórico limpo. Os PDFs foram preservados.')
    expect(result.current.busy).toBe(false)

    const rejectedFake = createApiFake(page([newerRecord]))
    rejectedFake.api.history.clear.mockRejectedValue(new Error('Limpeza indisponível.'))
    const rejectedView = renderHook(() => useResearchHistory(rejectedFake.api))
    await waitFor(() => expect(rejectedView.result.current.loading).toBe(false))
    await act(async () => {
      await rejectedView.result.current.clearHistory()
    })
    expect(rejectedView.result.current.records).toEqual([newerRecord])
    expect(rejectedView.result.current.feedback).toBe('Limpeza indisponível.')
    expect(rejectedView.result.current.busy).toBe(false)
  })

  it('uses the generic clear rejection feedback for non-Error failures', async () => {
    const { api } = createApiFake(page([firstRecord]))
    api.history.clear.mockRejectedValue({ reason: 'not-an-error' })
    const { result } = renderHook(() => useResearchHistory(api))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.clearHistory()
    })

    expect(result.current.records).toEqual([firstRecord])
    expect(result.current.feedback).toBe('Falha ao limpar o histórico.')
  })
})
