import { describe, expect, it } from 'vitest'
import { RESEARCH_CLASSIFICATIONS } from '@/domain/research/research-classification'

describe('RESEARCH_CLASSIFICATIONS', () => {
  it('deve definir todas as classificações permitidas para uma pesquisa', () => {
    expect(RESEARCH_CLASSIFICATIONS).toEqual([
      'CONSTA_RESTRICAO',
      'HA_INFORMACOES',
      'NADA_CONSTA',
      'INDEFINIDO'
    ])
  })
})
