import type { Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  CpiQueueMonitor,
  type CpiQueueAvailabilitySource,
  type CpiQueueDelay,
  type CpiQueueRefresher
} from '@/automation/cpi/cpi-queue-monitor'

class FakeRefresher implements CpiQueueRefresher {
  public calls = 0

  async refreshQueue(): Promise<void> {
    this.calls += 1
  }
}

class FakeAvailabilitySource implements CpiQueueAvailabilitySource {
  constructor(private readonly states: Array<'EMPTY' | 'HAS_RESEARCH' | 'INDETERMINATE'>) {}

  async read(): Promise<'EMPTY' | 'HAS_RESEARCH' | 'INDETERMINATE'> {
    const state = this.states.shift()

    if (!state) {
      throw new Error('Nenhum estado configurado para o teste')
    }

    return state
  }
}

class FakeDelay implements CpiQueueDelay {
  public readonly waits: number[] = []

  async wait(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds)
  }
}

describe('CpiQueueMonitor', () => {
  it('deve aguardar 60 segundos quando a fila estiver vazia', async () => {
    const refresher = new FakeRefresher()
    const source = new FakeAvailabilitySource(['EMPTY', 'HAS_RESEARCH'])
    const delay = new FakeDelay()

    const monitor = new CpiQueueMonitor(refresher, source, delay)

    const result = await monitor.waitForResearch({} as Page)

    expect(result).toEqual({
      status: 'RESEARCH_AVAILABLE',
      checks: 2
    })

    expect(refresher.calls).toBe(2)
    expect(delay.waits).toEqual([60_000])
  })

  it('não deve aguardar quando já houver pesquisa', async () => {
    const refresher = new FakeRefresher()
    const source = new FakeAvailabilitySource(['HAS_RESEARCH'])
    const delay = new FakeDelay()

    const monitor = new CpiQueueMonitor(refresher, source, delay)

    await expect(monitor.waitForResearch({} as Page)).resolves.toEqual({
      status: 'RESEARCH_AVAILABLE',
      checks: 1
    })

    expect(delay.waits).toEqual([])
  })

  it('deve pausar sem clicar quando a pausa já estiver solicitada', async () => {
    const refresher = new FakeRefresher()
    const source = new FakeAvailabilitySource(['HAS_RESEARCH'])
    const delay = new FakeDelay()

    const monitor = new CpiQueueMonitor(refresher, source, delay)

    await expect(
      monitor.waitForResearch({} as Page, {
        isPauseRequested: () => true
      })
    ).resolves.toEqual({
      status: 'PAUSED',
      checks: 0
    })

    expect(refresher.calls).toBe(0)
  })

  it('deve continuar monitorando quando o estado estiver temporariamente indeterminado', async () => {
    const refresher = new FakeRefresher()
    const source = new FakeAvailabilitySource(['INDETERMINATE', 'EMPTY', 'HAS_RESEARCH'])
    const delay = new FakeDelay()
    const reportedStates: string[] = []

    const monitor = new CpiQueueMonitor(refresher, source, delay)

    await expect(
      monitor.waitForResearch({} as Page, {
        onState: (state) => {
          reportedStates.push(state)
        }
      })
    ).resolves.toEqual({
      status: 'RESEARCH_AVAILABLE',
      checks: 3
    })

    expect(refresher.calls).toBe(3)
    expect(delay.waits).toEqual([60_000, 60_000])
    expect(reportedStates).toEqual(['INDETERMINATE', 'EMPTY', 'HAS_RESEARCH'])
  })

  it('deve impedir intervalo agressivo', () => {
    expect(
      () =>
        new CpiQueueMonitor(
          new FakeRefresher(),
          new FakeAvailabilitySource(['EMPTY']),
          new FakeDelay(),
          10_000
        )
    ).toThrow('Intervalo da fila deve ser de pelo menos 30000 ms')
  })
})
