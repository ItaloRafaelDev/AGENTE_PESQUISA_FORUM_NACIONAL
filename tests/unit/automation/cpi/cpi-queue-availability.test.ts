import type { Frame, Locator, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  CpiQueueAvailabilityReader,
  classifyCpiQueueText,
  parseCpiQueueTotal
} from '@/automation/cpi/cpi-queue-availability'

describe('parseCpiQueueTotal', () => {
  it('deve extrair zero quando a fila estiver vazia', () => {
    expect(parseCpiQueueTotal('Mostrando: 0 à 0 ( de 0 registro )')).toBe(0)
  })

  it('deve extrair o total quando houver pesquisas', () => {
    expect(parseCpiQueueTotal('Mostrando: 1 à 10 ( de 24 registros )')).toBe(24)
  })

  it('deve retornar null quando o rodapé não for reconhecido', () => {
    expect(parseCpiQueueTotal('Página desconhecida')).toBeNull()
  })
})

describe('classifyCpiQueueText', () => {
  it('deve classificar fila vazia', () => {
    expect(classifyCpiQueueText('Mostrando: 0 à 0 ( de 0 registro )')).toBe('EMPTY')
  })

  it('deve classificar fila com pesquisa', () => {
    expect(classifyCpiQueueText('Mostrando: 1 à 1 ( de 1 registro )')).toBe('HAS_RESEARCH')
  })

  it('deve classificar texto desconhecido como indeterminado', () => {
    expect(classifyCpiQueueText('Conteúdo inesperado')).toBe('INDETERMINATE')
  })
})

describe('CpiQueueAvailabilityReader', () => {
  it('deve procurar o rodapé em todos os frames', async () => {
    const firstInnerText = vi.fn(async () => 'Sem informações')
    const firstFrame = {
      locator: vi.fn(
        () =>
          ({
            innerText: firstInnerText
          }) as unknown as Locator
      )
    } as unknown as Frame

    const secondInnerText = vi.fn(async () => 'Mostrando: 0 à 0 ( de 0 registro )')
    const secondFrame = {
      locator: vi.fn(
        () =>
          ({
            innerText: secondInnerText
          }) as unknown as Locator
      )
    } as unknown as Frame

    const page = {
      frames: vi.fn(() => [firstFrame, secondFrame])
    } as unknown as Page

    const reader = new CpiQueueAvailabilityReader(4_321)

    await expect(reader.read(page)).resolves.toBe('EMPTY')

    expect(firstInnerText).toHaveBeenCalledWith({
      timeout: 4_321
    })
    expect(secondInnerText).toHaveBeenCalledWith({
      timeout: 4_321
    })
  })
})
