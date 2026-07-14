import { setTimeout as wait } from 'node:timers/promises'
import type { Page } from 'playwright'
import type { CpiQueueAvailabilityState } from './cpi-queue-availability'

export interface CpiQueueRefresher {
  refreshQueue(page: Page): Promise<void>
}

export interface CpiQueueAvailabilitySource {
  read(page: Page): Promise<CpiQueueAvailabilityState>
}

export interface CpiQueueDelay {
  wait(milliseconds: number, signal?: AbortSignal): Promise<void>
}

export interface CpiQueueMonitorOptions {
  isPauseRequested?: () => boolean
  signal?: AbortSignal
  onState?: (state: CpiQueueAvailabilityState, checks: number) => void
}

export interface CpiQueueMonitorResult {
  status: 'RESEARCH_AVAILABLE' | 'PAUSED'
  checks: number
}

class NodeQueueDelay implements CpiQueueDelay {
  async wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
    await wait(milliseconds, undefined, {
      signal
    })
  }
}

export class CpiQueueMonitor {
  constructor(
    private readonly refresher: CpiQueueRefresher,
    private readonly availabilitySource: CpiQueueAvailabilitySource,
    private readonly delay: CpiQueueDelay = new NodeQueueDelay(),
    private readonly intervalMs = 60_000
  ) {
    if (intervalMs < 30_000) {
      throw new Error('Intervalo da fila deve ser de pelo menos 30000 ms')
    }
  }

  async waitForResearch(
    page: Page,
    options: CpiQueueMonitorOptions = {}
  ): Promise<CpiQueueMonitorResult> {
    let checks = 0

    while (true) {
      if (options.signal?.aborted || options.isPauseRequested?.()) {
        return {
          status: 'PAUSED',
          checks
        }
      }

      await this.refresher.refreshQueue(page)

      checks += 1

      const state = await this.availabilitySource.read(page)

      options.onState?.(state, checks)

      if (state === 'HAS_RESEARCH') {
        return {
          status: 'RESEARCH_AVAILABLE',
          checks
        }
      }

      if (state === 'INDETERMINATE') {
        throw new Error('Não foi possível determinar o estado da fila da CPI')
      }

      if (options.signal?.aborted || options.isPauseRequested?.()) {
        return {
          status: 'PAUSED',
          checks
        }
      }

      try {
        await this.delay.wait(this.intervalMs, options.signal)
      } catch (error: unknown) {
        if (options.signal?.aborted) {
          return {
            status: 'PAUSED',
            checks
          }
        }

        throw error
      }
    }
  }
}
