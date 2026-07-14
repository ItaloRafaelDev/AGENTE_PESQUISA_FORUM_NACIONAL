import { describe, expect, it } from 'vitest'
import { isCpiResearchSaveConfirmed } from '@/automation/cpi/cpi-research-save-confirmation'

describe('isCpiResearchSaveConfirmed', () => {
  it('deve aceitar somente a palavra GRAVAR', () => {
    expect(isCpiResearchSaveConfirmed('GRAVAR')).toBe(true)
    expect(isCpiResearchSaveConfirmed('  gravar  ')).toBe(true)
  })

  it('deve rejeitar confirmação vazia', () => {
    expect(isCpiResearchSaveConfirmed('')).toBe(false)
    expect(isCpiResearchSaveConfirmed('   ')).toBe(false)
  })

  it('deve rejeitar qualquer outro texto', () => {
    expect(isCpiResearchSaveConfirmed('CONFIRMAR')).toBe(false)
    expect(isCpiResearchSaveConfirmed('SIM')).toBe(false)
  })
})
