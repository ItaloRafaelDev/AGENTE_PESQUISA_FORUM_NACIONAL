import { describe, expect, it } from 'vitest'
import { ExecutionControl, type ExecutionToken } from '@/application/agent/execution-control'
import type { ContinuousResearchStage } from '@/application/agent/continuous-research-stage'
import { ApplicationError } from '@/application/errors/application-error'
import type {
  RunResearchCycleDependencies,
  ResearchPreparationPort
} from '@/application/ports/research-cycle-ports'
import { PrepareResearch, type PreparedResearch } from '@/application/research/prepare-research'
import { RunResearchCycle } from '@/application/research/run-research-cycle'

const SYNTHETIC_CPF = '00000000000'
const MASKED_SYNTHETIC_CPF = '***.***.***-00'

const preparedResearch: PreparedResearch = {
  maskedCpf: MASKED_SYNTHETIC_CPF,
  selectedDatasetCount: 6,
  classification: {
    classification: 'HA_INFORMACOES',
    evidence: {
      result: 'NAO_CONSTA_RESTRICAO',
      reason: 'NO_CRIMINAL_SPHERE',
      totalProcesses: 0,
      normalizedSpheres: []
    }
  },
  report: {
    reference: 'synthetic-report-reference',
    compatibilityPath: 'opaque-synthetic-compatibility-reference',
    sizeBytes: 128
  },
  attachmentConfirmed: true,
  requiredFieldsConfirmed: true
}

function createDependencies(
  calls: string[] = [],
  preparation: ResearchPreparationPort = {
    async execute(identity) {
      calls.push('preparation.execute')
      expect(identity).toEqual({
        cpf: SYNTHETIC_CPF,
        maskedCpf: MASKED_SYNTHETIC_CPF
      })
      return preparedResearch
    }
  }
): RunResearchCycleDependencies {
  return {
    cpi: {
      async openNext() {
        calls.push('cpi.openNext')
      },
      async readIdentity() {
        calls.push('cpi.readIdentity')
        return {
          cpf: SYNTHETIC_CPF,
          maskedCpf: MASKED_SYNTHETIC_CPF
        }
      },
      async bindCurrentResearch() {
        calls.push('cpi.bindCurrentResearch')
      },
      async saveOnce() {
        calls.push('cpi.saveOnce')
        return {
          saved: true,
          confirmationAccepted: true
        }
      },
      async returnToQueue() {
        calls.push('cpi.returnToQueue')
      }
    },
    deskData: {
      async prepareNextSearch() {
        calls.push('deskdata.prepareNextSearch')
      },
      async closeHistoricalResult() {
        calls.push('deskdata.closeHistoricalResult')
      }
    },
    preparation
  }
}

function createToken(): ExecutionToken {
  return new ExecutionControl().token
}

describe('RunResearchCycle', () => {
  it('coordinates the complete CPI to DeskData to CPI cycle in the compatible order', async () => {
    const calls: string[] = []
    const stages: ContinuousResearchStage[] = []
    const identities: string[] = []

    const result = await new RunResearchCycle(createDependencies(calls)).execute({
      token: createToken(),
      hooks: {
        onStage(stage) {
          stages.push(stage)
        },
        onIdentity(maskedCpf) {
          identities.push(maskedCpf)
        }
      }
    })

    expect(calls).toEqual([
      'cpi.openNext',
      'cpi.readIdentity',
      'cpi.bindCurrentResearch',
      'deskdata.prepareNextSearch',
      'preparation.execute',
      'cpi.saveOnce',
      'deskdata.closeHistoricalResult',
      'deskdata.prepareNextSearch',
      'cpi.returnToQueue'
    ])
    expect(stages).toEqual([
      'OPENING_CPI_RESEARCH',
      'READING_CPI_IDENTITY',
      'READING_CPI_IDENTITY',
      'PREPARING_DESKDATA',
      'PREPARING_CPI_RESULT',
      'SAVING_CPI',
      'PREPARING_NEXT_SEARCH',
      'RETURNING_TO_QUEUE'
    ])
    expect(identities).toEqual([MASKED_SYNTHETIC_CPF])
    expect(result).toEqual({
      maskedCpf: MASKED_SYNTHETIC_CPF,
      selectedDatasetCount: 6,
      classification: 'HA_INFORMACOES',
      pdfPath: 'opaque-synthetic-compatibility-reference',
      pdfSizeBytes: 128,
      saved: true,
      confirmationAccepted: true
    })
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_CPF)
  })

  it('cancels at OPENING_CPI_RESEARCH when STOP was requested before start', async () => {
    const calls: string[] = []
    const control = new ExecutionControl()
    control.requestPause()
    control.requestStop()

    await expect(
      new RunResearchCycle(createDependencies(calls)).execute({ token: control.token })
    ).rejects.toMatchObject({
      code: 'CANCELLED',
      stage: 'OPENING_CPI_RESEARCH',
      message: 'A execução foi interrompida antes do início da pesquisa.'
    })
    expect(calls).toEqual([])
  })

  it('stops at SAVING_CPI when save is not confirmed', async () => {
    const calls: string[] = []
    const dependencies = createDependencies(calls)
    dependencies.cpi.saveOnce = async () => {
      calls.push('cpi.saveOnce')
      return {
        saved: false,
        confirmationAccepted: false
      }
    }

    await expect(
      new RunResearchCycle(dependencies).execute({ token: createToken() })
    ).rejects.toMatchObject({
      code: 'INTEGRATION',
      stage: 'SAVING_CPI'
    })
    expect(calls).toEqual([
      'cpi.openNext',
      'cpi.readIdentity',
      'cpi.bindCurrentResearch',
      'deskdata.prepareNextSearch',
      'preparation.execute',
      'cpi.saveOnce'
    ])
  })

  it('preserves both identity stage notifications when binding the current research fails', async () => {
    const calls: string[] = []
    const stages: ContinuousResearchStage[] = []
    const bindingFailure = new Error('synthetic detail frame binding failure')
    const dependencies = createDependencies(calls)
    dependencies.cpi.bindCurrentResearch = async () => {
      calls.push('cpi.bindCurrentResearch')
      throw bindingFailure
    }

    await expect(
      new RunResearchCycle(dependencies).execute({
        token: createToken(),
        hooks: { onStage: (stage) => stages.push(stage) }
      })
    ).rejects.toMatchObject({
      code: 'INTEGRATION',
      stage: 'READING_CPI_IDENTITY',
      cause: bindingFailure
    })
    expect(stages).toEqual(['OPENING_CPI_RESEARCH', 'READING_CPI_IDENTITY', 'READING_CPI_IDENTITY'])
    expect(calls).toEqual(['cpi.openNext', 'cpi.readIdentity', 'cpi.bindCurrentResearch'])
  })

  it('owns historical-result cleanup failures at PREPARING_NEXT_SEARCH', async () => {
    const calls: string[] = []
    const failure = new Error('synthetic cleanup failure')
    const dependencies = createDependencies(calls)
    dependencies.deskData.closeHistoricalResult = async () => {
      calls.push('deskdata.closeHistoricalResult')
      throw failure
    }

    const execution = new RunResearchCycle(dependencies).execute({ token: createToken() })

    await expect(execution).rejects.toMatchObject({
      code: 'INTEGRATION',
      stage: 'PREPARING_NEXT_SEARCH',
      cause: failure
    })
    expect(calls).toEqual([
      'cpi.openNext',
      'cpi.readIdentity',
      'cpi.bindCurrentResearch',
      'deskdata.prepareNextSearch',
      'preparation.execute',
      'cpi.saveOnce',
      'deskdata.closeHistoricalResult'
    ])
  })

  it('wraps an adapter failure once with the owning stage', async () => {
    const failure = new Error('synthetic adapter failure')
    const dependencies = createDependencies()
    dependencies.cpi.openNext = async () => {
      throw failure
    }

    const execution = new RunResearchCycle(dependencies).execute({ token: createToken() })

    await expect(execution).rejects.toBeInstanceOf(ApplicationError)
    await expect(execution).rejects.toMatchObject({
      code: 'INTEGRATION',
      stage: 'OPENING_CPI_RESEARCH',
      cause: failure
    })
  })

  it('preserves an existing ApplicationError without double wrapping it', async () => {
    const failure = new ApplicationError({
      code: 'PREPARATION',
      message: 'synthetic safe failure',
      stage: 'DOWNLOADING_PDF'
    })
    const dependencies = createDependencies()
    dependencies.preparation.execute = async () => {
      throw failure
    }

    await expect(new RunResearchCycle(dependencies).execute({ token: createToken() })).rejects.toBe(
      failure
    )
  })

  it.each([
    [false, true, 'ATTACHING_PDF'],
    [true, false, 'PREPARING_CPI_RESULT']
  ] as const)(
    'does not save when preparation returns attachment=%s and required fields=%s',
    async (attached, requiredFieldsConfirmed, expectedStage) => {
      const calls: string[] = []
      const preparation = new PrepareResearch({
        deskData: {
          fillCpf: async () => undefined,
          async applyApprovedDatasets() {
            return { selectedCount: 6 }
          },
          submitOnce: async () => undefined,
          waitUntilResultReady: async () => undefined
        },
        report: {
          async create() {
            return preparedResearch.report
          },
          async readProcesses() {
            return []
          }
        },
        cpi: {
          async prepareAndAttach() {
            return { attached, requiredFieldsConfirmed }
          }
        }
      })
      const dependencies = createDependencies(calls, preparation)

      await expect(
        new RunResearchCycle(dependencies).execute({ token: createToken() })
      ).rejects.toMatchObject({
        code: 'PREPARATION',
        stage: expectedStage
      })
      expect(calls).not.toContain('cpi.saveOnce')
    }
  )

  it('does not notify or retain an invalid masked identity', async () => {
    const identities: string[] = []
    const dependencies = createDependencies()
    dependencies.preparation.execute = async () => ({
      ...preparedResearch,
      maskedCpf: SYNTHETIC_CPF
    })

    await expect(
      new RunResearchCycle(dependencies).execute({
        token: createToken(),
        hooks: {
          onIdentity(maskedCpf) {
            identities.push(maskedCpf)
          }
        }
      })
    ).rejects.toMatchObject({
      code: 'PREPARATION',
      stage: 'PREPARING_CPI_RESULT'
    })
    expect(identities).toEqual([])
  })
})
