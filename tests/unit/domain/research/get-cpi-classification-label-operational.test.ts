import { describe, expect, it } from 'vitest'
import { getCpiClassificationLabel } from '@/domain/research/get-cpi-classification-label'

describe('getCpiClassificationLabel - regra operacional', () => {
  it('deve enviar INDEFINIDO para a CPI como Há Informações', () => {
    expect(getCpiClassificationLabel('INDEFINIDO')).toBe('Há Informações')
  })
})
