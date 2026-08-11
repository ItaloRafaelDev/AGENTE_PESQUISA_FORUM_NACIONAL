import { describe, expect, it } from 'vitest'
import { DeskDataClassificationReportFormatter } from '@/infrastructure/automation/deskdata/deskdata-classification-report-formatter'
import type { DeskDataInspectionClassification } from '@/infrastructure/automation/deskdata/deskdata-inspection-classifier'

describe('DeskDataClassificationReportFormatter', () => {
  it('deve gerar exatamente seis linhas técnicas seguras', () => {
    const result: DeskDataInspectionClassification = {
      summary: {
        hasProcesses: true,
        hasCriminalProcesses: true,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'CONSTA_RESTRICAO'
    }

    const lines = new DeskDataClassificationReportFormatter().format(result)

    expect(lines).toEqual([
      'Classificação técnica: CONSTA_RESTRICAO',
      'Resultado destinado à CPI: Sim, Consta Restrições',
      'Possui processos: Sim',
      'Possui processos criminais: Sim',
      'Natureza identificável: Sim',
      'Resultado válido: Sim'
    ])
  })
})
