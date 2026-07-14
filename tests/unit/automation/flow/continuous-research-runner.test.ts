import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiQueueMonitorOptions } from '@/automation/cpi/cpi-queue-monitor'
import {
  ContinuousResearchRunner,
  type ContinuousResearchRunnerDependencies,
  type ContinuousResearchRunnerInput,
  type ContinuousResearchRunnerState
} from '@/automation/flow/continuous-research-runner'
import type { SingleResearchCycleResult } from '@/automation/flow/single-research-cycle'

function createCycleResult(cycle: number): SingleResearchCycleResult {
  return {
    maskedCpf: '***.***.***-' + String(cycle).padStart(2, '0'),
    selectedDatasetCount: 6,
    classification: 'HA_INFORMACOES',
    pdfPath: 'E:\\PDF-AGENTE-CPI\\deskdata-ciclo-' + cycle + '.pdf',
    pdfSizeBytes: 1000 + cycle,
    saved: true,
    confirmationAccepted: true
  }
}

function createRunnerInput(
  signal: AbortSignal,
  onState?: (state: ContinuousResearchRunnerState) => void
): ContinuousResearchRunnerInput {
  return {
    context: {} as BrowserContext,
    cpiPage: {} as Page,
    deskDataPage: {} as Page,
    signal,
    onState
  }
}

describe('ContinuousResearchRunner', () => {
  it('deve executar duas pesquisas estritamente em sequência', async () => {
    const abortController = new AbortController()
    const callOrder: string[] = []
    let queueCheck = 0
    let cycleNumber = 0

    const waitForResearch = vi.fn(async () => {
      queueCheck += 1
      callOrder.push('QUEUE_' + queueCheck)

      return {
        status: 'RESEARCH_AVAILABLE' as const,
        checks: 1
      }
    })

    const cycleFactory = vi.fn(() => {
      cycleNumber += 1
      const currentCycle = cycleNumber

      return {
        run: vi.fn(async () => {
          callOrder.push('CYCLE_' + currentCycle + '_START')

          await Promise.resolve()

          callOrder.push('CYCLE_' + currentCycle + '_END')

          if (currentCycle === 2) {
            abortController.abort()
          }

          return createCycleResult(currentCycle)
        })
      }
    })

    const dependencies: ContinuousResearchRunnerDependencies = {
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    }

    const result = await new ContinuousResearchRunner(dependencies).run(
      createRunnerInput(abortController.signal)
    )

    expect(callOrder).toEqual([
      'QUEUE_1',
      'CYCLE_1_START',
      'CYCLE_1_END',
      'QUEUE_2',
      'CYCLE_2_START',
      'CYCLE_2_END'
    ])

    expect(waitForResearch).toHaveBeenCalledTimes(2)
    expect(cycleFactory).toHaveBeenCalledTimes(2)

    expect(result).toEqual({
      status: 'STOPPED_BY_SIGNAL',
      completedCycles: 2
    })
  })

  it('deve permanecer ocioso e retomar quando surgir pesquisa', async () => {
    const abortController = new AbortController()
    const states: ContinuousResearchRunnerState[] = []
    let cycleNumber = 0

    const waitForResearch = vi.fn(async (_page: Page, options?: CpiQueueMonitorOptions) => {
      options?.onState?.('EMPTY', 1)
      options?.onState?.('HAS_RESEARCH', 2)

      return {
        status: 'RESEARCH_AVAILABLE' as const,
        checks: 2
      }
    })

    const cycleFactory = vi.fn(() => {
      cycleNumber += 1

      return {
        run: vi.fn(async () => {
          abortController.abort()
          return createCycleResult(cycleNumber)
        })
      }
    })

    const runner = new ContinuousResearchRunner({
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    })

    const result = await runner.run(
      createRunnerInput(abortController.signal, (state) => states.push(state))
    )

    expect(states).toContainEqual({
      type: 'IDLE',
      nextCheckInMs: 60_000
    })

    expect(states).toContainEqual({
      type: 'RESEARCH_AVAILABLE',
      cycle: 1,
      checks: 2
    })

    expect(states).toContainEqual({
      type: 'CYCLE_COMPLETED',
      cycle: 1
    })

    expect(result.completedCycles).toBe(1)
  })

  it('deve aplicar E1 e interromper no primeiro erro', async () => {
    const abortController = new AbortController()
    const cycleError = new Error('Falha crítica durante a pesquisa')

    const waitForResearch = vi.fn(async () => ({
      status: 'RESEARCH_AVAILABLE' as const,
      checks: 1
    }))

    const runCycle = vi.fn(async () => {
      throw cycleError
    })

    const cycleFactory = vi.fn(() => ({
      run: runCycle
    }))

    const runner = new ContinuousResearchRunner({
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    })

    await expect(runner.run(createRunnerInput(abortController.signal))).rejects.toBe(cycleError)

    expect(waitForResearch).toHaveBeenCalledTimes(1)
    expect(cycleFactory).toHaveBeenCalledTimes(1)
    expect(runCycle).toHaveBeenCalledTimes(1)
  })

  it('não deve iniciar monitoramento quando o sinal já estiver cancelado', async () => {
    const abortController = new AbortController()
    abortController.abort()

    const waitForResearch = vi.fn()
    const cycleFactory = vi.fn()

    const states: ContinuousResearchRunnerState[] = []

    const result = await new ContinuousResearchRunner({
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    }).run(createRunnerInput(abortController.signal, (state) => states.push(state)))

    expect(waitForResearch).not.toHaveBeenCalled()
    expect(cycleFactory).not.toHaveBeenCalled()

    expect(states).toEqual([
      {
        type: 'STOPPED',
        cycles: 0
      }
    ])

    expect(result).toEqual({
      status: 'STOPPED_BY_SIGNAL',
      completedCycles: 0
    })
  })

  it('deve parar quando o monitor retornar PAUSED', async () => {
    const abortController = new AbortController()

    const waitForResearch = vi.fn(async () => ({
      status: 'PAUSED' as const,
      checks: 3
    }))

    const cycleFactory = vi.fn()

    const result = await new ContinuousResearchRunner({
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    }).run(createRunnerInput(abortController.signal))

    expect(cycleFactory).not.toHaveBeenCalled()

    expect(result).toEqual({
      status: 'STOPPED_BY_SIGNAL',
      completedCycles: 0
    })
  })
})
