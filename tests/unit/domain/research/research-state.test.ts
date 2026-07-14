import { describe, expect, it } from 'vitest'
import { RESEARCH_STATES } from '@/domain/research/research-state'

describe('RESEARCH_STATES', () => {
  it('deve definir todos os checkpoints aprovados para uma pesquisa', () => {
    expect(RESEARCH_STATES).toEqual([
      'PENDENTE',
      'ABERTA_NA_CPI',
      'DADOS_COLETADOS',
      'CONSULTA_INICIADA',
      'RESULTADO_VALIDADO',
      'PDF_BAIXADO',
      'CPI_PREENCHIDA',
      'CONCLUIDA',
      'ERRO'
    ])
  })
})
