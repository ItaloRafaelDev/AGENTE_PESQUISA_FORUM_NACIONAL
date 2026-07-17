import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  ContinuousResearchRunner,
  type ContinuousQueueMonitorPort,
  type ContinuousResearchRunnerState,
  type SingleResearchCycleFactory,
  type SingleResearchCyclePort
} from '@/automation/flow/continuous-research-runner'
import type {
  SingleResearchCycleInput,
  SingleResearchCycleResult
} from '@/automation/flow/single-research-cycle'
import type { ContinuousResearchStage } from '@/automation/flow/continuous-research-stage'

const context = {} as BrowserContext
const cpiPage = {} as Page
const deskDataPage = {} as Page

function createResult(maskedCpf = '***.***.***-44'): SingleResearchCycleResult {
  return {
    maskedCpf,
    selectedDatasetCount: 6,
    classification: 'HA_INFORMACOES',
    pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
    pdfSizeBytes: 2048,
    saved: true,
    confirmationAccepted: true
  }
}

class AvailableQueueMonitor implements ContinuousQueueMonitorPort {
  public calls = 0

  async waitForResearch(): Promise<{
    status: 'RESEARCH_AVAILABLE'
    checks: number
  }> {
    this.calls += 1

    return {
      status: 'RESEARCH_AVAILABLE',
      checks: this.calls
    }
  }
}

class HookedCycle implements SingleResearchCyclePort {
  public calls = 0

  constructor(
    private readonly onRun: (input: SingleResearchCycleInput) => void = () => undefined,
    private readonly result: SingleResearchCycleResult = createResult()
  ) {}

  async run(input: SingleResearchCycleInput): Promise<SingleResearchCycleResult> {
    this.calls += 1
    this.onRun(input)

    return this.result
  }
}

function createFactory(cycle: SingleResearchCyclePort): SingleResearchCycleFactory {
  return () => cycle
}

describe('ContinuousResearchRunner boundary control', () => {
  it('conclui o ciclo atual e para antes de monitorar a próxima pesquisa', async () => {
    const controller = new AbortController()
    const queueMonitor = new AvailableQueueMonitor()

    let stopRequested = false

    const cycle = new HookedCycle(() => {
      stopRequested = true

      // Faz a implementação antiga sair do while.
      // Na implementação nova, a parada continua classificada
      // como STOPPED_BY_REQUEST pela verificação de fronteira.
      controller.abort()
    })

    const runner = new ContinuousResearchRunner({
      queueMonitor,
      cycleFactory: createFactory(cycle)
    })

    const result = await runner.run({
      context,
      cpiPage,
      deskDataPage,
      signal: controller.signal,
      shouldStopBeforeNextCycle: () => stopRequested
    })

    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    })

    expect(queueMonitor.calls).toBe(1)
    expect(cycle.calls).toBe(1)
  })

  it('para antes do primeiro monitoramento quando já existe solicitação', async () => {
    const queueMonitor = {
      calls: 0,

      async waitForResearch(): Promise<never> {
        this.calls += 1

        throw new Error('O monitor não deveria iniciar')
      }
    } satisfies ContinuousQueueMonitorPort

    const cycle = new HookedCycle()

    const runner = new ContinuousResearchRunner({
      queueMonitor,
      cycleFactory: createFactory(cycle)
    })

    const result = await runner.run({
      context,
      cpiPage,
      deskDataPage,
      signal: new AbortController().signal,
      shouldStopBeforeNextCycle: () => true
    })

    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 0
    })

    expect(queueMonitor.calls).toBe(0)
    expect(cycle.calls).toBe(0)
  })

  it('encaminha etapa e CPF mascarado do ciclo para o runtime', async () => {
    const controller = new AbortController()
    const queueMonitor = new AvailableQueueMonitor()

    let stopRequested = false

    const stages: Array<{
      cycle: number
      stage: ContinuousResearchStage
    }> = []

    const identities: Array<{
      cycle: number
      maskedCpf: string
    }> = []

    const cycle = new HookedCycle((input) => {
      input.hooks?.onStage?.('PREPARING_DESKDATA')

      input.hooks?.onIdentity?.('***.***.***-44')

      stopRequested = true
      controller.abort()
    })

    const runner = new ContinuousResearchRunner({
      queueMonitor,
      cycleFactory: createFactory(cycle)
    })

    await runner.run({
      context,
      cpiPage,
      deskDataPage,
      signal: controller.signal,
      shouldStopBeforeNextCycle: () => stopRequested,
      onCycleStage: (cycleNumber, stage) => {
        stages.push({
          cycle: cycleNumber,
          stage
        })
      },
      onCycleIdentity: (cycleNumber, maskedCpf) => {
        identities.push({
          cycle: cycleNumber,
          maskedCpf
        })
      }
    })

    expect(stages).toEqual([
      {
        cycle: 1,
        stage: 'PREPARING_DESKDATA'
      }
    ])

    expect(identities).toEqual([
      {
        cycle: 1,
        maskedCpf: '***.***.***-44'
      }
    ])
  })

  it('inclui o resultado completo no evento CYCLE_COMPLETED', async () => {
    const controller = new AbortController()
    const queueMonitor = new AvailableQueueMonitor()

    let stopRequested = false

    const expectedResult = createResult('***.***.***-88')

    const cycle = new HookedCycle(() => {
      stopRequested = true
      controller.abort()
    }, expectedResult)

    const states: ContinuousResearchRunnerState[] = []

    const runner = new ContinuousResearchRunner({
      queueMonitor,
      cycleFactory: createFactory(cycle)
    })

    await runner.run({
      context,
      cpiPage,
      deskDataPage,
      signal: controller.signal,
      shouldStopBeforeNextCycle: () => stopRequested,
      onState: (state) => {
        states.push(state)
      }
    })

    expect(states.find((state) => state.type === 'CYCLE_COMPLETED')).toEqual({
      type: 'CYCLE_COMPLETED',
      cycle: 1,
      result: expectedResult
    })
  })
})
