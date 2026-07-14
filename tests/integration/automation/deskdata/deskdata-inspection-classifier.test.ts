import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeskDataInspectionClassifier } from '@/automation/deskdata/deskdata-inspection-classifier'
import type { DeskDataProcessInspection } from '@/automation/deskdata/deskdata-process-result-inspector'

function loadInspection(
  scenario: DeskDataProcessInspection['scenario']
): DeskDataProcessInspection {
  const filePath = resolve(process.cwd(), 'artifacts', 'deskdata-inspection', `${scenario}.json`)

  return JSON.parse(readFileSync(filePath, 'utf8')) as DeskDataProcessInspection
}

describe('DeskDataInspectionClassifier com capturas reais', () => {
  it('deve classificar o caso A como CONSTA_RESTRICAO', () => {
    const inspection = loadInspection('caso-a-criminal')

    const result = new DeskDataInspectionClassifier().classify(inspection)

    expect(result).toEqual({
      summary: {
        hasProcesses: true,
        hasCriminalProcesses: true,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'CONSTA_RESTRICAO'
    })
  })

  it('deve classificar o caso B como HA_INFORMACOES sem processos', () => {
    const inspection = loadInspection('caso-b-sem-processos')

    const result = new DeskDataInspectionClassifier().classify(inspection)

    expect(result).toEqual({
      summary: {
        hasProcesses: false,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'HA_INFORMACOES'
    })
  })

  it('deve classificar o caso C como HA_INFORMACOES com processos não criminais', () => {
    const inspection = loadInspection('caso-c-nao-criminal')

    const result = new DeskDataInspectionClassifier().classify(inspection)

    expect(result).toEqual({
      summary: {
        hasProcesses: true,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'HA_INFORMACOES'
    })
  })
})
