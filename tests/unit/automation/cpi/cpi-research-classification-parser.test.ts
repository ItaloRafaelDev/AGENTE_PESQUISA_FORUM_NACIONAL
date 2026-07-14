import { describe, expect, it } from 'vitest'
import { parseCpiResearchClassification } from '@/automation/cpi/cpi-research-classification-parser'

describe('parseCpiResearchClassification', () => {
  it('deve aceitar uma classificação técnica válida', () => {
    expect(parseCpiResearchClassification(['CONSTA_RESTRICAO'])).toBe('CONSTA_RESTRICAO')
  })

  it('deve aceitar HA_INFORMACOES', () => {
    expect(parseCpiResearchClassification(['HA_INFORMACOES'])).toBe('HA_INFORMACOES')
  })

  it('deve rejeitar classificação ausente', () => {
    expect(() => parseCpiResearchClassification([])).toThrow('Classificação técnica não informada.')
  })

  it('deve rejeitar classificação desconhecida', () => {
    expect(() => parseCpiResearchClassification(['INVALIDA'])).toThrow(
      'Classificação técnica inválida.'
    )
  })
})
