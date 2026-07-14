import { describe, expect, it } from 'vitest'
import { mapResearchClassificationToCpiResult } from '@/automation/cpi/cpi-research-result-mapper'

describe('mapResearchClassificationToCpiResult', () => {
  it('deve mapear CONSTA_RESTRICAO para Sim, Consta Restrições', () => {
    expect(mapResearchClassificationToCpiResult('CONSTA_RESTRICAO')).toEqual({
      selector: '#consta3',
      label: 'Sim, Consta Restrições'
    })
  })

  it('deve mapear HA_INFORMACOES para Há Informações', () => {
    expect(mapResearchClassificationToCpiResult('HA_INFORMACOES')).toEqual({
      selector: '#consta2',
      label: 'Há Informações'
    })
  })

  it('deve manter NADA_CONSTA disponível para compatibilidade', () => {
    expect(mapResearchClassificationToCpiResult('NADA_CONSTA')).toEqual({
      selector: '#consta1',
      label: 'Nada Consta'
    })
  })

  it('deve tratar INDEFINIDO como Há Informações na CPI', () => {
    expect(mapResearchClassificationToCpiResult('INDEFINIDO')).toEqual({
      selector: '#consta2',
      label: 'Há Informações'
    })
  })
})
