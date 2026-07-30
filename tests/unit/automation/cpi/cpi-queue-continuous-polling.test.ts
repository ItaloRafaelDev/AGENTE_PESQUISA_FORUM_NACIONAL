import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiQueueAvailabilityState } from '@/automation/cpi/cpi-queue-availability'
import {
  CPI_QUEUE_SELECTORS,
  CpiQueueFilterController
} from '@/automation/cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  type CpiQueueAvailabilitySource,
  type CpiQueueDelay,
  type CpiQueueRefresher
} from '@/automation/cpi/cpi-queue-monitor'

describe('CpiQueueMonitor polling contínuo', () => {
  it('deve verificar imediatamente e não aguardar quando houver pesquisa', async () => {
    const page = {} as Page

    const refreshQueue = vi.fn(async (): Promise<void> => undefined)

    const read = vi.fn(async (): Promise<CpiQueueAvailabilityState> => 'HAS_RESEARCH')

    const wait = vi.fn(async (): Promise<void> => undefined)

    const refresher: CpiQueueRefresher = {
      refreshQueue
    }

    const availabilitySource: CpiQueueAvailabilitySource = {
      read
    }

    const delay: CpiQueueDelay = {
      wait
    }

    const result = await new CpiQueueMonitor(
      refresher,
      availabilitySource,
      delay,
      60_000
    ).waitForResearch(page)

    expect(refreshQueue).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()

    expect(result).toEqual({
      status: 'RESEARCH_AVAILABLE',
      checks: 1
    })
  })

  it('deve aguardar 60000 ms e atualizar novamente quando a fila estiver vazia', async () => {
    const page = {} as Page
    const callOrder: string[] = []

    const states: CpiQueueAvailabilityState[] = ['EMPTY', 'HAS_RESEARCH']

    const refreshQueue = vi.fn(async (): Promise<void> => {
      callOrder.push('REFRESH')
    })

    const read = vi.fn(async (): Promise<CpiQueueAvailabilityState> => {
      const state = states.shift()

      if (!state) {
        throw new Error('Estado de teste não disponível.')
      }

      callOrder.push('READ_' + state)

      return state
    })

    const wait = vi.fn(async (milliseconds: number): Promise<void> => {
      callOrder.push('WAIT_' + milliseconds)
    })

    const monitor = new CpiQueueMonitor(
      {
        refreshQueue
      },
      {
        read
      },
      {
        wait
      },
      60_000
    )

    const result = await monitor.waitForResearch(page)

    expect(callOrder).toEqual([
      'REFRESH',
      'READ_EMPTY',
      'WAIT_60000',
      'REFRESH',
      'READ_HAS_RESEARCH'
    ])

    expect(refreshQueue).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenCalledTimes(2)

    expect(wait).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledWith(60_000, undefined)

    expect(result).toEqual({
      status: 'RESEARCH_AVAILABLE',
      checks: 2
    })
  })

  it('deve informar EMPTY antes de retomar com HAS_RESEARCH', async () => {
    const page = {} as Page

    const states: CpiQueueAvailabilityState[] = ['EMPTY', 'HAS_RESEARCH']

    const reportedStates: Array<{
      state: CpiQueueAvailabilityState
      checks: number
    }> = []

    const monitor = new CpiQueueMonitor(
      {
        refreshQueue: vi.fn(async (): Promise<void> => undefined)
      },
      {
        read: vi.fn(async (): Promise<CpiQueueAvailabilityState> => {
          const state = states.shift()

          if (!state) {
            throw new Error('Estado de teste não disponível.')
          }

          return state
        })
      },
      {
        wait: vi.fn(async (): Promise<void> => undefined)
      },
      60_000
    )

    await monitor.waitForResearch(page, {
      onState: (state, checks): void => {
        reportedStates.push({
          state,
          checks
        })
      }
    })

    expect(reportedStates).toEqual([
      {
        state: 'EMPTY',
        checks: 1
      },
      {
        state: 'HAS_RESEARCH',
        checks: 2
      }
    ])
  })

  it('deve interromper a espera quando o sinal for cancelado', async () => {
    const page = {} as Page
    const abortController = new AbortController()

    const refreshQueue = vi.fn(async (): Promise<void> => undefined)

    const wait = vi.fn(async (milliseconds: number, signal?: AbortSignal): Promise<void> => {
      expect(milliseconds).toBe(60_000)
      expect(signal).toBe(abortController.signal)

      abortController.abort()

      throw new Error('Espera interrompida')
    })

    const monitor = new CpiQueueMonitor(
      {
        refreshQueue
      },
      {
        read: vi.fn(async (): Promise<CpiQueueAvailabilityState> => 'EMPTY')
      },
      {
        wait
      },
      60_000
    )

    const result = await monitor.waitForResearch(page, {
      signal: abortController.signal
    })

    expect(refreshQueue).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledTimes(1)

    expect(result).toEqual({
      status: 'PAUSED',
      checks: 1
    })
  })

  it('deve rejeitar intervalo inferior a 30000 ms', () => {
    expect(
      () =>
        new CpiQueueMonitor(
          {
            refreshQueue: vi.fn()
          },
          {
            read: vi.fn()
          },
          {
            wait: vi.fn()
          },
          29_999
        )
    ).toThrow('Intervalo da fila deve ser de pelo menos 30000 ms')
  })
})

describe('CpiQueueFilterController Mostrar Tudo', () => {
  it('deve clicar no botão Mostrar Tudo ao atualizar a fila', async () => {
    const click = vi.fn(async (): Promise<void> => undefined)

    const count = vi.fn(async (): Promise<number> => 1)

    const locator = vi.fn(() => ({
      count,
      click
    }))

    const waitForLoadState = vi.fn(async (): Promise<void> => undefined)

    const waitForTimeout = vi.fn(async (): Promise<void> => undefined)

    const page = {
      locator,
      waitForLoadState,
      waitForTimeout
    } as unknown as Page

    await new CpiQueueFilterController().refreshQueue(page)

    expect(locator).toHaveBeenCalledWith(CPI_QUEUE_SELECTORS.showAllButton)

    expect(click).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledWith({
      timeout: 10_000
    })

    expect(waitForLoadState).toHaveBeenCalledWith('domcontentloaded', {
      timeout: 10_000
    })

    expect(waitForTimeout).toHaveBeenCalledWith(700)
  })
})
