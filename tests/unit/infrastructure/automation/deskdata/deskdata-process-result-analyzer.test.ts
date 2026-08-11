import { describe, expect, it } from 'vitest'
import { DeskDataProcessResultAnalyzer } from '@/infrastructure/automation/deskdata/deskdata-process-result-analyzer'
import type { DeskDataProcessInspection } from '@/infrastructure/automation/deskdata/deskdata-process-result-inspector'

function createInspection(
  overrides: Partial<DeskDataProcessInspection>
): DeskDataProcessInspection {
  return {
    schemaVersion: 1,
    scenario: 'caso-a-criminal',
    capturedAt: '2026-07-14T12:00:00.000Z',
    sourcePath: '/pessoas/resultado/',
    pageTitle: 'Resultado',
    relevantBodyLines: [],
    headings: [],
    tables: [],
    candidates: [],
    ...overrides
  }
}

describe('DeskDataProcessResultAnalyzer', () => {
  it('deve identificar resultado com processo criminal', () => {
    const inspection = createInspection({
      relevantBodyLines: ['Processo 0001234-56.2024.8.26.0001', 'Classe: Ação Penal']
    })

    const result = new DeskDataProcessResultAnalyzer().analyze(inspection)

    expect(result).toEqual({
      hasProcesses: true,
      hasCriminalProcesses: true,
      isProcessNatureIdentifiable: true,
      isResultValid: true
    })
  })

  it('deve identificar resultado com somente processo não criminal', () => {
    const inspection = createInspection({
      scenario: 'caso-c-nao-criminal',
      relevantBodyLines: ['Processo 0001234-56.2024.8.26.0001', 'Classe: Procedimento Comum Cível']
    })

    const result = new DeskDataProcessResultAnalyzer().analyze(inspection)

    expect(result).toEqual({
      hasProcesses: true,
      hasCriminalProcesses: false,
      isProcessNatureIdentifiable: true,
      isResultValid: true
    })
  })

  it('deve identificar resultado válido sem processos', () => {
    const inspection = createInspection({
      scenario: 'caso-b-sem-processos',
      relevantBodyLines: ['Nenhum processo encontrado']
    })

    const result = new DeskDataProcessResultAnalyzer().analyze(inspection)

    expect(result).toEqual({
      hasProcesses: false,
      hasCriminalProcesses: false,
      isProcessNatureIdentifiable: true,
      isResultValid: true
    })
  })

  it('deve manter a natureza como não identificável quando houver processo sem indicador de matéria', () => {
    const inspection = createInspection({
      relevantBodyLines: ['Processo 0001234-56.2024.8.26.0001']
    })

    const result = new DeskDataProcessResultAnalyzer().analyze(inspection)

    expect(result).toEqual({
      hasProcesses: true,
      hasCriminalProcesses: false,
      isProcessNatureIdentifiable: false,
      isResultValid: true
    })
  })

  it('deve marcar como inválida uma captura fora da página de resultado', () => {
    const inspection = createInspection({
      sourcePath: '/pessoas/',
      relevantBodyLines: []
    })

    const result = new DeskDataProcessResultAnalyzer().analyze(inspection)

    expect(result).toEqual({
      hasProcesses: false,
      hasCriminalProcesses: false,
      isProcessNatureIdentifiable: false,
      isResultValid: false
    })
  })
})
