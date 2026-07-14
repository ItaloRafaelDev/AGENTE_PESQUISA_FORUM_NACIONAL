import { describe, expect, it } from 'vitest'
import { DeskDataSafeClassificationReportBuilder } from '@/automation/deskdata/deskdata-safe-classification-report-builder'
import type { DeskDataProcessInspection } from '@/automation/deskdata/deskdata-process-result-inspector'

function createInspection(): DeskDataProcessInspection {
  return {
    schemaVersion: 1,
    scenario: 'caso-a-criminal',
    capturedAt: '2026-07-14T12:00:00.000Z',
    sourcePath: '/pessoas/resultado/',
    pageTitle: 'Resultado',
    relevantBodyLines: [
      'NOME_SIGILOSO_TESTE',
      'Processo 0000000-00.0000.0.00.0000',
      'Classe: Ação Penal'
    ],
    headings: ['Processos'],
    tables: [],
    candidates: []
  }
}

describe('DeskDataSafeClassificationReportBuilder', () => {
  it('deve classificar a inspeção e retornar somente o relatório técnico seguro', () => {
    const lines = new DeskDataSafeClassificationReportBuilder().build(createInspection())

    expect(lines).toEqual([
      'Classificação técnica: CONSTA_RESTRICAO',
      'Resultado destinado à CPI: Sim, Consta Restrições',
      'Possui processos: Sim',
      'Possui processos criminais: Sim',
      'Natureza identificável: Sim',
      'Resultado válido: Sim'
    ])

    const output = lines.join('\n')

    expect(output).not.toContain('NOME_SIGILOSO_TESTE')
    expect(output).not.toContain('0000000-00.0000.0.00.0000')
  })
})
