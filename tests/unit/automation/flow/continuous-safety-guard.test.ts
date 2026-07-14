import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiQueueMonitorResult } from '@/automation/cpi/cpi-queue-monitor'
import {
  ContinuousResearchRunner,
  type ContinuousResearchRunnerDependencies,
  type ContinuousResearchRunnerInput
} from '@/automation/flow/continuous-research-runner'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '@/automation/flow/continuous-research-stage'
import type { SingleResearchCycleResult } from '@/automation/flow/single-research-cycle'
import { SafeResearchLogger } from '@/automation/logging/safe-research-logger'

const CRITICAL_STAGES: readonly ContinuousResearchStage[] = [
  'WAITING_QUEUE',
  'OPENING_CPI_RESEARCH',
  'READING_CPI_IDENTITY',
  'PREPARING_DESKDATA',
  'SUBMITTING_DESKDATA',
  'WAITING_DESKDATA_RESULT',
  'CLASSIFYING_RESULT',
  'DOWNLOADING_PDF',
  'PREPARING_CPI_RESULT',
  'ATTACHING_PDF',
  'SAVING_CPI',
  'PREPARING_NEXT_SEARCH',
  'RETURNING_TO_QUEUE'
]

function createRunnerInput(
  signal: AbortSignal = new AbortController().signal
): ContinuousResearchRunnerInput {
  return {
    context: {} as BrowserContext,
    cpiPage: {} as Page,
    deskDataPage: {} as Page,
    signal
  }
}

function createSuccessfulResult(): SingleResearchCycleResult {
  return {
    maskedCpf: '***.***.***-01',
    selectedDatasetCount: 6,
    classification: 'HA_INFORMACOES',
    pdfPath: 'E:\\PDF-AGENTE-CPI\\deskdata-seguro.pdf',
    pdfSizeBytes: 1500,
    saved: true,
    confirmationAccepted: true
  }
}

describe('política E1 do modo contínuo', () => {
  it.each(CRITICAL_STAGES)('deve interromper imediatamente quando falhar em %s', async (stage) => {
    const stageError = new ContinuousResearchStageError(
      stage,
      new Error('Falha operacional controlada')
    )

    const waitForResearch = vi.fn(async (): Promise<CpiQueueMonitorResult> => ({
      status: 'RESEARCH_AVAILABLE',
      checks: 1
    }))

    const runCycle = vi.fn(async (): Promise<never> => {
      throw stageError
    })

    const cycleFactory = vi.fn(() => ({
      run: runCycle
    }))

    const dependencies: ContinuousResearchRunnerDependencies = {
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    }

    await expect(new ContinuousResearchRunner(dependencies).run(createRunnerInput())).rejects.toBe(
      stageError
    )

    expect(waitForResearch).toHaveBeenCalledTimes(1)
    expect(cycleFactory).toHaveBeenCalledTimes(1)
    expect(runCycle).toHaveBeenCalledTimes(1)
  })

  it('não deve iniciar um terceiro ciclo depois de falha no segundo', async () => {
    const secondCycleError = new ContinuousResearchStageError(
      'DOWNLOADING_PDF',
      new Error('Falha no segundo ciclo')
    )

    const waitForResearch = vi.fn(async (): Promise<CpiQueueMonitorResult> => ({
      status: 'RESEARCH_AVAILABLE',
      checks: 1
    }))

    const firstRun = vi.fn(async (): Promise<SingleResearchCycleResult> => createSuccessfulResult())

    const secondRun = vi.fn(async (): Promise<never> => {
      throw secondCycleError
    })

    let createdCycles = 0

    const cycleFactory = vi.fn(() => {
      createdCycles += 1

      if (createdCycles === 1) {
        return {
          run: firstRun
        }
      }

      return {
        run: secondRun
      }
    })

    const dependencies: ContinuousResearchRunnerDependencies = {
      queueMonitor: {
        waitForResearch
      },
      cycleFactory
    }

    await expect(new ContinuousResearchRunner(dependencies).run(createRunnerInput())).rejects.toBe(
      secondCycleError
    )

    expect(waitForResearch).toHaveBeenCalledTimes(2)
    expect(cycleFactory).toHaveBeenCalledTimes(2)
    expect(firstRun).toHaveBeenCalledTimes(1)
    expect(secondRun).toHaveBeenCalledTimes(1)
    expect(createdCycles).toBe(2)
  })

  it('não deve repetir automaticamente um ciclo que falhou', async () => {
    const failure = new ContinuousResearchStageError(
      'SAVING_CPI',
      new Error('Gravação não confirmada')
    )

    const runCycle = vi.fn(async (): Promise<never> => {
      throw failure
    })

    const cycleFactory = vi.fn(() => ({
      run: runCycle
    }))

    const runner = new ContinuousResearchRunner({
      queueMonitor: {
        waitForResearch: vi.fn(async (): Promise<CpiQueueMonitorResult> => ({
          status: 'RESEARCH_AVAILABLE',
          checks: 1
        }))
      },
      cycleFactory
    })

    await expect(runner.run(createRunnerInput())).rejects.toBe(failure)

    expect(cycleFactory).toHaveBeenCalledTimes(1)
    expect(runCycle).toHaveBeenCalledTimes(1)
  })
})

describe('proteção de dados nos logs', () => {
  it('deve mascarar CPF sem pontuação em mensagens comuns', () => {
    const writer = vi.fn()
    const logger = new SafeResearchLogger(writer)

    logger.info('Documento processado: 12345678901')

    expect(writer).toHaveBeenCalledTimes(1)

    expect(writer).toHaveBeenCalledWith('Documento processado: ***.***.***-01')

    expect(writer).not.toHaveBeenCalledWith(expect.stringContaining('12345678901'))
  })

  it('deve mascarar CPF formatado em mensagens de erro', () => {
    const writer = vi.fn()
    const logger = new SafeResearchLogger(writer)

    logger.error('SAVING_CPI', new Error('Falha para 987.654.321-00'))

    expect(writer).toHaveBeenCalledTimes(1)

    expect(writer).toHaveBeenCalledWith('[SAVING_CPI] Falha para ***.***.***-00')

    expect(writer).not.toHaveBeenCalledWith(expect.stringContaining('987.654.321-00'))
  })

  it('deve mascarar mais de um CPF na mesma mensagem', () => {
    const writer = vi.fn()
    const logger = new SafeResearchLogger(writer)

    logger.info('Documentos 11122233344 e 555.666.777-88')

    expect(writer).toHaveBeenCalledWith('Documentos ***.***.***-44 e ***.***.***-88')
  })

  it('deve manter apenas os dois últimos dígitos do CPF', () => {
    const logger = new SafeResearchLogger((): void => undefined)

    expect(logger.maskCpf('12345678901')).toBe('***.***.***-01')

    expect(logger.maskCpf('987.654.321-00')).toBe('***.***.***-00')
  })
})
