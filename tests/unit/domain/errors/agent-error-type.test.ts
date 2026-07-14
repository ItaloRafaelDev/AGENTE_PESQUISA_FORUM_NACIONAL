import { describe, expect, it } from 'vitest'
import { AGENT_ERROR_TYPES } from '@/domain/errors/agent-error-type'

describe('AGENT_ERROR_TYPES', () => {
  it('deve definir todas as categorias de erro aprovadas', () => {
    expect(AGENT_ERROR_TYPES).toEqual([
      'ERRO_TEMPORARIO',
      'ERRO_DE_SESSAO',
      'ERRO_DE_DADOS',
      'ERRO_DE_PLATAFORMA',
      'ERRO_CRITICO'
    ])
  })
})
