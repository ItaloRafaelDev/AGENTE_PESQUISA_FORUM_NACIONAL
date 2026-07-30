import { readFileSync } from 'node:fs'
import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiQueueMonitorOptions } from '@/automation/cpi/cpi-queue-monitor'
import {
  ContinuousResearchRunner,
  createContinuousResearchRunner,
  type ContinuousResearchRunnerDependencies,
  type ContinuousResearchRunnerInput,
  type ContinuousResearchRunnerState
} from '@/automation/flow/continuous-research-runner'
import type { SingleResearchCycleResult } from '@/automation/flow/single-research-cycle'

const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')

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
  it('resolve uma vez o diretório PDF preferido ou operacional antes de compor o runner', () => {
    expect(runtimeSource).toContain('resolvePdfOutputDirectory')
    expect(runtimeSource).toMatch(
      /const pdfOutputDirectory = await resolvePdfOutputDirectory\(\{\s*preferredDirectory: runtimePaths\.preferredPdfDirectory,\s*fallbackDirectory: runtimePaths\.downloadsDir\s*\}\)/
    )
    expect(runtimeSource).toMatch(
      /createContinuousResearchRunner\(\{[\s\S]*?pdfOutputDirectory[\s\S]*?\}\)/
    )
  })

  it('deve propagar a configuração explícita para as dependências produtivas', async () => {
    const config = {
      queueCheckIntervalMs: 61_111,
      cpiSearchPollingIntervalMs: 321,
      actionTimeoutMs: 12_345,
      readTimeoutMs: 4_321,
      queueFilterSettleDelayMs: 876,
      cpiFrameSearchAttempts: 17,
      deskDataPeopleUrl: 'https://config.deskdata.com.br/pessoas/',
      navigationTimeoutMs: 31_234,
      downloadStartTimeoutMs: 32_345,
      deskDataFormPollingIntervalMs: 432,
      deskDataResultPollingIntervalMs: 543,
      deskDataHistoryNavigationIntervalMs: 654,
      submitSettleDelayMs: 1_234,
      queueReturnDelayMs: 3_210,
      cpiIdentitySearchAttempts: 18,
      cpiAttachmentSearchAttempts: 19,
      cpiResultSearchAttempts: 20,
      cpiResultStabilizationAttempts: 4,
      deskDataFormReadyAttempts: 21,
      deskDataResultSearchAttempts: 22,
      deskDataHistoryNavigationAttempts: 23,
      pdfOutputDirectory: 'E:\\resolved-runner-output'
    }

    const captured: {
      filterOptions?: unknown
      availabilityTimeoutMs?: number
      monitor?: {
        refresher: unknown
        availabilitySource: unknown
        intervalMs: number
      }
      cycleConfig?: unknown
    } = {}

    const filterController = {
      refreshQueue: vi.fn(async () => undefined)
    }

    const availabilityReader = {
      read: vi.fn(async () => 'HAS_RESEARCH' as const)
    }

    const abortController = new AbortController()
    const states: ContinuousResearchRunnerState[] = []

    const runner = createContinuousResearchRunner(config, {
      createFilterController: (options) => {
        captured.filterOptions = options

        return filterController
      },

      createAvailabilityReader: (readTimeoutMs) => {
        captured.availabilityTimeoutMs = readTimeoutMs

        return availabilityReader
      },

      createQueueMonitor: (refresher, availabilitySource, _delay, intervalMs) => {
        captured.monitor = {
          refresher,
          availabilitySource,
          intervalMs
        }

        return {
          waitForResearch: async (_page, options) => {
            options?.onState?.('EMPTY', 1)

            return {
              status: 'RESEARCH_AVAILABLE',
              checks: 2
            }
          }
        }
      },

      createSingleResearchCycle: (cycleConfig) => {
        captured.cycleConfig = cycleConfig

        return {
          run: async () => {
            abortController.abort()

            return createCycleResult(1)
          }
        }
      }
    })

    await runner.run(
      createRunnerInput(abortController.signal, (state) => {
        states.push(state)
      })
    )

    expect(captured.filterOptions).toEqual({
      frameSearchAttempts: 17,
      frameSearchIntervalMs: 321,
      actionTimeoutMs: 12_345,
      settleDelayMs: 876
    })
    expect(captured.availabilityTimeoutMs).toBe(4_321)
    expect(captured.monitor).toEqual({
      refresher: filterController,
      availabilitySource: availabilityReader,
      intervalMs: 61_111
    })
    expect(captured.cycleConfig).toEqual({
      cpiFrameSearchAttempts: 17,
      cpiSearchPollingIntervalMs: 321,
      actionTimeoutMs: 12_345,
      deskDataPeopleUrl: 'https://config.deskdata.com.br/pessoas/',
      navigationTimeoutMs: 31_234,
      readTimeoutMs: 4_321,
      downloadStartTimeoutMs: 32_345,
      deskDataFormPollingIntervalMs: 432,
      deskDataResultPollingIntervalMs: 543,
      deskDataHistoryNavigationIntervalMs: 654,
      submitSettleDelayMs: 1_234,
      queueReturnDelayMs: 3_210,
      cpiIdentitySearchAttempts: 18,
      cpiAttachmentSearchAttempts: 19,
      cpiResultSearchAttempts: 20,
      cpiResultStabilizationAttempts: 4,
      deskDataFormReadyAttempts: 21,
      deskDataResultSearchAttempts: 22,
      deskDataHistoryNavigationAttempts: 23,
      pdfOutputDirectory: 'E:\\resolved-runner-output'
    })
    expect(states).toContainEqual({
      type: 'IDLE',
      nextCheckInMs: 61_111
    })
  })

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

    expect(states).toContainEqual(
      expect.objectContaining({
        type: 'CYCLE_COMPLETED',
        cycle: 1
      })
    )

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
