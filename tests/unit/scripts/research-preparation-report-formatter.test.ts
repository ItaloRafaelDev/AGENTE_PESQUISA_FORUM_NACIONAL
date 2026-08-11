import { describe, expect, it } from 'vitest'
import { formatResearchPreparationReport } from '../../../scripts/support/research-preparation-report-formatter'

describe('formatResearchPreparationReport', () => {
  it('formata somente as evidências reais da classificação por esfera', () => {
    expect(
      formatResearchPreparationReport({
        classification: {
          classification: 'CONSTA_RESTRICAO',
          evidence: {
            result: 'SIM_CONSTA_RESTRICAO',
            reason: 'CRIMINAL_SPHERE_FOUND',
            totalProcesses: 2,
            normalizedSpheres: ['CRIMINAL', 'CÍVEL']
          }
        }
      })
    ).toEqual([
      'Classificação técnica: SIM_CONSTA_RESTRICAO',
      'Resultado destinado à CPI: Sim, Consta Restrições',
      'Motivo técnico: CRIMINAL_SPHERE_FOUND',
      'Total de processos: 2',
      'Esferas normalizadas: CRIMINAL, CÍVEL'
    ])
  })

  it('informa quando nenhuma esfera foi identificada', () => {
    expect(
      formatResearchPreparationReport({
        classification: {
          classification: 'HA_INFORMACOES',
          evidence: {
            result: 'HA_INFORMACOES',
            reason: 'NO_CRIMINAL_SPHERE',
            totalProcesses: 0,
            normalizedSpheres: []
          }
        }
      })
    ).toEqual([
      'Classificação técnica: HA_INFORMACOES',
      'Resultado destinado à CPI: Há Informações',
      'Motivo técnico: NO_CRIMINAL_SPHERE',
      'Total de processos: 0',
      'Esferas normalizadas: Nenhuma identificada'
    ])
  })
})
