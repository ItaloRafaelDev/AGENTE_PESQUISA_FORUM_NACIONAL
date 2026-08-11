import { describe, expect, it } from 'vitest'
import { CPI_RESEARCH_DATA_SELECTORS } from '@/infrastructure/automation/cpi/cpi-selectors'

describe('CPI_RESEARCH_DATA_SELECTORS', () => {
  it('deve localizar o valor do CPF pela célula irmã do rótulo CPF', () => {
    expect(CPI_RESEARCH_DATA_SELECTORS.cpfValue).toBe(
      'xpath=//div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " txt ") and normalize-space(.)="CPF:"]/following-sibling::div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " field ")][1]'
    )
  })
})
