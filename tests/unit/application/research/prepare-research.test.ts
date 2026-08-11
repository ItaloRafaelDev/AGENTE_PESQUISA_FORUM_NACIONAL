import { describe, expect, it } from 'vitest'
import { ApplicationError } from '@/application/errors/application-error'
import { PrepareResearch, type PreparedResearch } from '@/application/research/prepare-research'
import type {
  PrepareResearchDependencies,
  ReportArtifact
} from '@/application/ports/research-preparation-ports'
import type { CpiDeskDataClassification } from '@/application/research/research-preparation-model'

const identity = {
  cpf: '00000000000',
  maskedCpf: '***.***.***-**'
}

const report: ReportArtifact = {
  reference: 'report-reference',
  compatibilityPath: 'opaque-compatibility-reference',
  sizeBytes: 128
}

function createDependencies(calls: string[] = []): PrepareResearchDependencies {
  return {
    deskData: {
      async fillCpf(cpf) {
        calls.push('deskdata.fillCpf')
        expect(cpf).toBe(identity.cpf)
      },
      async applyApprovedDatasets() {
        calls.push('deskdata.applyApprovedDatasets')
        return { selectedCount: 6 }
      },
      async submitOnce() {
        calls.push('deskdata.submitOnce')
      },
      async waitUntilResultReady() {
        calls.push('deskdata.waitUntilResultReady')
      }
    },
    report: {
      async create() {
        calls.push('report.create')
        return report
      },
      async readProcesses(reference) {
        calls.push('report.readProcesses')
        expect(reference).toBe(report.reference)
        return [
          {
            processKey: 'synthetic-criminal-process',
            processNumber: null,
            sphereRaw: 'Especial criminal',
            sourcePage: 1
          }
        ]
      }
    },
    cpi: {
      async prepareAndAttach(classification, reportReference) {
        calls.push('cpi.prepareAndAttach')
        expect(classification).toBe<CpiDeskDataClassification>('CONSTA_RESTRICAO')
        expect(reportReference).toBe(report.reference)
        return {
          attached: true,
          requiredFieldsConfirmed: true
        }
      }
    }
  }
}

describe('PrepareResearch', () => {
  it('coordinates the DeskData report and CPI preparation in the required order', async () => {
    const calls: string[] = []

    const result = await new PrepareResearch(createDependencies(calls)).execute(identity)

    expect(calls).toEqual([
      'deskdata.fillCpf',
      'deskdata.applyApprovedDatasets',
      'deskdata.submitOnce',
      'deskdata.waitUntilResultReady',
      'report.create',
      'report.readProcesses',
      'cpi.prepareAndAttach'
    ])
    expect(result).toEqual<PreparedResearch>({
      maskedCpf: '***.***.***-**',
      selectedDatasetCount: 6,
      classification: {
        classification: 'CONSTA_RESTRICAO',
        evidence: {
          result: 'SIM_CONSTA_RESTRICAO',
          reason: 'CRIMINAL_SPHERE_FOUND',
          totalProcesses: 1,
          normalizedSpheres: ['especial criminal']
        }
      },
      report,
      attachmentConfirmed: true,
      requiredFieldsConfirmed: true
    })
  })

  it('rejects an empty report before interpretation', async () => {
    const dependencies = createDependencies()
    dependencies.report.create = async () => ({ ...report, sizeBytes: 0 })

    await expect(new PrepareResearch(dependencies).execute(identity)).rejects.toMatchObject({
      code: 'PREPARATION',
      stage: 'DOWNLOADING_PDF'
    })
  })

  it('rejects an unconfirmed CPI attachment', async () => {
    const dependencies = createDependencies()
    dependencies.cpi.prepareAndAttach = async () => ({
      attached: false,
      requiredFieldsConfirmed: true
    })

    await expect(new PrepareResearch(dependencies).execute(identity)).rejects.toMatchObject({
      code: 'PREPARATION',
      stage: 'ATTACHING_PDF'
    })
  })

  it('rejects unconfirmed CPI required fields', async () => {
    const dependencies = createDependencies()
    dependencies.cpi.prepareAndAttach = async () => ({
      attached: true,
      requiredFieldsConfirmed: false
    })

    await expect(new PrepareResearch(dependencies).execute(identity)).rejects.toMatchObject({
      code: 'PREPARATION',
      stage: 'PREPARING_CPI_RESULT'
    })
  })

  it.each([
    ['deskdata.fillCpf', 'PREPARING_DESKDATA'],
    ['deskdata.applyApprovedDatasets', 'PREPARING_DESKDATA'],
    ['deskdata.submitOnce', 'SUBMITTING_DESKDATA'],
    ['deskdata.waitUntilResultReady', 'WAITING_DESKDATA_RESULT'],
    ['report.create', 'DOWNLOADING_PDF'],
    ['report.readProcesses', 'CLASSIFYING_RESULT'],
    ['cpi.prepareAndAttach', 'PREPARING_CPI_RESULT']
  ] as const)('wraps a %s port failure with its owner stage', async (operation, stage) => {
    const cause = new Error('synthetic port failure')
    const dependencies = createDependencies()

    if (operation === 'deskdata.fillCpf') {
      dependencies.deskData.fillCpf = async () => {
        throw cause
      }
    } else if (operation === 'deskdata.applyApprovedDatasets') {
      dependencies.deskData.applyApprovedDatasets = async () => {
        throw cause
      }
    } else if (operation === 'deskdata.submitOnce') {
      dependencies.deskData.submitOnce = async () => {
        throw cause
      }
    } else if (operation === 'deskdata.waitUntilResultReady') {
      dependencies.deskData.waitUntilResultReady = async () => {
        throw cause
      }
    } else if (operation === 'report.create') {
      dependencies.report.create = async () => {
        throw cause
      }
    } else if (operation === 'report.readProcesses') {
      dependencies.report.readProcesses = async () => {
        throw cause
      }
    } else {
      dependencies.cpi.prepareAndAttach = async () => {
        throw cause
      }
    }

    const execution = new PrepareResearch(dependencies).execute(identity)

    await expect(execution).rejects.toBeInstanceOf(ApplicationError)
    await expect(execution).rejects.toMatchObject({
      code: 'INTEGRATION',
      stage,
      cause
    })
  })

  it('preserves an existing application error from a port', async () => {
    const cause = new ApplicationError({
      code: 'PREPARATION',
      message: 'safe application failure',
      stage: 'DOWNLOADING_PDF'
    })
    const dependencies = createDependencies()
    dependencies.report.create = async () => {
      throw cause
    }

    await expect(new PrepareResearch(dependencies).execute(identity)).rejects.toBe(cause)
  })
})
