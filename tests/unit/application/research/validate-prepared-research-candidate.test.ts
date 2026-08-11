import { describe, expect, it } from 'vitest'
import {
  validatePreparedResearchCandidate,
  type PreparedResearchCandidate
} from '@/application/research/validate-prepared-research-candidate'

const validCandidate: PreparedResearchCandidate = {
  maskedCpf: '***.***.***-00',
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
  requiredFields: {
    researcherLabel: 'Desk Data',
    primaryResearcherLabel: 'Desk Data',
    statusLabel: 'Respondida'
  }
}

describe('validatePreparedResearchCandidate', () => {
  it('returns a prepared research only after application validates the semantic candidate', () => {
    expect(validatePreparedResearchCandidate(validCandidate)).toEqual({
      maskedCpf: '***.***.***-00',
      selectedDatasetCount: 6,
      classification: validCandidate.classification,
      report: validCandidate.report,
      attachmentConfirmed: true,
      requiredFieldsConfirmed: true
    })
  })

  it.each([
    {
      name: 'unconfirmed attachment',
      candidate: { ...validCandidate, attachmentConfirmed: false },
      stage: 'ATTACHING_PDF',
      message: 'O PDF não foi confirmado no campo de anexo da CPI.'
    },
    {
      name: 'empty PDF',
      candidate: {
        ...validCandidate,
        report: { ...validCandidate.report, sizeBytes: 0 }
      },
      stage: 'DOWNLOADING_PDF',
      message: 'O PDF da DeskData possui tamanho inválido.'
    },
    {
      name: 'unexpected researcher',
      candidate: {
        ...validCandidate,
        requiredFields: { ...validCandidate.requiredFields, researcherLabel: 'Outro' }
      },
      stage: 'PREPARING_CPI_RESULT',
      message: 'Os campos obrigatórios da CPI não foram confirmados.'
    },
    {
      name: 'unexpected primary researcher',
      candidate: {
        ...validCandidate,
        requiredFields: { ...validCandidate.requiredFields, primaryResearcherLabel: 'Outro' }
      },
      stage: 'PREPARING_CPI_RESULT',
      message: 'Os campos obrigatórios da CPI não foram confirmados.'
    },
    {
      name: 'unexpected status',
      candidate: {
        ...validCandidate,
        requiredFields: { ...validCandidate.requiredFields, statusLabel: 'Pendente' }
      },
      stage: 'PREPARING_CPI_RESULT',
      message: 'Os campos obrigatórios da CPI não foram confirmados.'
    }
  ] as const)('rejects $name with the application-owned stage', ({ candidate, stage, message }) => {
    expect(() => validatePreparedResearchCandidate(candidate)).toThrowError(
      expect.objectContaining({
        name: 'ApplicationError',
        code: 'PREPARATION',
        stage,
        message
      })
    )
  })
})
