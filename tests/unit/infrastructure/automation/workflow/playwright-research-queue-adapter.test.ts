import type { ExecutionToken } from '@/application/agent/execution-control'
import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  PlaywrightResearchQueueAdapter,
  type CpiQueueMonitorPort
} from '@/infrastructure/automation/workflow/playwright-research-queue-adapter'

const token: ExecutionToken = {
  get directive() {
    return 'NONE'
  },
  get isCancellationRequested() {
    return false
  },
  subscribe: () => () => undefined
}

describe('PlaywrightResearchQueueAdapter', () => {
  it.each([
    ['HAS_RESEARCH', 'AVAILABLE'],
    ['EMPTY', 'EMPTY'],
    ['INDETERMINATE', 'CHECKING']
  ] as const)('maps %s to %s', async (legacyState, expectedState) => {
    const observed: string[] = []
    const queueMonitor: CpiQueueMonitorPort = {
      waitForResearch: vi.fn(async (_page, options) => {
        options?.onState?.(legacyState, 1)

        return { status: 'RESEARCH_AVAILABLE', checks: 1 }
      })
    }
    const adapter = new PlaywrightResearchQueueAdapter(
      queueMonitor,
      {} as Page,
      new AbortController().signal
    )

    const result = await adapter.waitForResearch({
      token,
      onState: (state) => observed.push(state)
    })

    expect(observed).toEqual([expectedState])
    expect(result).toEqual({ status: 'AVAILABLE', checks: 1 })
  })

  it('maps a paused queue monitor result to cancelled', async () => {
    const queueMonitor: CpiQueueMonitorPort = {
      waitForResearch: vi.fn(async () => ({ status: 'PAUSED', checks: 3 }))
    }
    const adapter = new PlaywrightResearchQueueAdapter(
      queueMonitor,
      {} as Page,
      new AbortController().signal
    )

    await expect(
      adapter.waitForResearch({
        token,
        onState: () => undefined
      })
    ).resolves.toEqual({ status: 'CANCELLED', checks: 3 })
  })

  it.each(['PAUSE', 'STOP'] as const)(
    'preserva Page, AbortSignal, checks e a predicate dinâmica após %s',
    async (directive) => {
      let currentDirective: ExecutionToken['directive'] = 'NONE'
      const dynamicToken: ExecutionToken = {
        get directive() {
          return currentDirective
        },
        get isCancellationRequested() {
          return currentDirective === 'STOP'
        },
        subscribe: () => () => undefined
      }
      const page = {} as Page
      const abortController = new AbortController()
      const observed: Array<{ state: string; checks: number }> = []
      const queueMonitor: CpiQueueMonitorPort = {
        waitForResearch: vi.fn(async (receivedPage, options) => {
          expect(receivedPage).toBe(page)
          expect(options?.signal).toBe(abortController.signal)
          expect(options?.isPauseRequested?.()).toBe(false)

          options?.onState?.('EMPTY', 5)
          currentDirective = directive

          expect(options?.isPauseRequested?.()).toBe(true)

          return { status: 'PAUSED', checks: 7 }
        })
      }
      const adapter = new PlaywrightResearchQueueAdapter(queueMonitor, page, abortController.signal)

      await expect(
        adapter.waitForResearch({
          token: dynamicToken,
          onState: (state, checks) => observed.push({ state, checks })
        })
      ).resolves.toEqual({ status: 'CANCELLED', checks: 7 })

      expect(observed).toEqual([{ state: 'EMPTY', checks: 5 }])
    }
  )
})
