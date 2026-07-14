import { describe, expect, it } from 'vitest'
import { getCpiClassificationLabel } from '@/domain/research/get-cpi-classification-label'

describe('getCpiClassificationLabel', () => {
  it('deve converter CONSTA_RESTRICAO para o texto da CPI', () => {
    expect(getCpiClassificationLabel('CONSTA_RESTRICAO')).toBe('Sim, Consta Restrições')
  })

  it('deve converter HA_INFORMACOES para o texto da CPI', () => {
    expect(getCpiClassificationLabel('HA_INFORMACOES')).toBe('Há Informações')
  })

  it('deve converter NADA_CONSTA para o texto da CPI', () => {
    expect(getCpiClassificationLabel('NADA_CONSTA')).toBe('Nada Consta')
  })

  it('deve converter INDEFINIDO para o texto da CPI', () => {
    expect(getCpiClassificationLabel('INDEFINIDO')).toBe('Há Informações')
  })
})
