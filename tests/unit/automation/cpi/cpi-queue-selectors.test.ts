import { describe, expect, it } from 'vitest'
import { CPI_QUEUE_SELECTORS } from '@/automation/cpi/cpi-queue-filter-controller'

describe('CPI_QUEUE_SELECTORS', () => {
  it('deve localizar o botão Selecionar fora do formulário', () => {
    expect(CPI_QUEUE_SELECTORS.selectButton).toBe('div.pa.ac > a.button:has-text("Selecionar")')
  })
})
