import type { Frame, Locator, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { CpiQueueFilterController } from '@/infrastructure/automation/cpi/cpi-queue-filter-controller'
import { CPI_QUEUE_SELECTORS } from '@/infrastructure/automation/cpi/cpi-selectors'

interface CheckboxState {
  id: string
  checked: boolean
}

function createCheckbox(state: CheckboxState): Locator {
  return {
    getAttribute: vi.fn(async (name: string) => (name === 'id' ? state.id : null)),

    isChecked: vi.fn(async () => state.checked),

    check: vi.fn(async () => {
      throw new Error('Interação por clique bloqueada para este teste')
    }),

    uncheck: vi.fn(async () => {
      throw new Error('Interação por clique bloqueada para este teste')
    }),

    evaluate: vi.fn(async (_callback: unknown, shouldBeChecked: boolean) => {
      state.checked = shouldBeChecked
    })
  } as unknown as Locator
}

function createActionLocator(): Locator {
  const locator = {
    count: vi.fn(async () => 1),
    click: vi.fn(async () => undefined)
  }

  return locator as unknown as Locator
}

describe('CpiQueueFilterController', () => {
  it('deve selecionar somente o filtro criminal nacional CPF', async () => {
    const targetState: CheckboxState = {
      id: 'id_tipo_pesq_29',
      checked: false
    }

    const otherState: CheckboxState = {
      id: 'id_tipo_pesq_6',
      checked: true
    }

    const targetCheckbox = createCheckbox(targetState)
    const otherCheckbox = createCheckbox(otherState)

    const checkboxCollection = {
      count: vi.fn(async () => 2),

      nth: vi.fn((index: number) => (index === 0 ? targetCheckbox : otherCheckbox))
    } as unknown as Locator

    const targetProbe = {
      count: vi.fn(async () => 1)
    } as unknown as Locator

    const selectButton = createActionLocator()
    const advancedFilterButton = createActionLocator()

    const filterFrame = {
      locator: vi.fn((selector: string) => {
        if (selector === CPI_QUEUE_SELECTORS.targetFilterCheckbox) {
          return targetProbe
        }

        if (selector === CPI_QUEUE_SELECTORS.allFilterCheckboxes) {
          return checkboxCollection
        }

        if (selector === CPI_QUEUE_SELECTORS.selectButton) {
          return selectButton
        }

        throw new Error(`Seletor inesperado no frame: ${selector}`)
      })
    } as unknown as Frame

    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === CPI_QUEUE_SELECTORS.advancedFilterButton) {
          return advancedFilterButton
        }

        throw new Error(`Seletor inesperado na página: ${selector}`)
      }),

      frames: vi.fn(() => [filterFrame]),

      waitForTimeout: vi.fn(async () => undefined)
    } as unknown as Page

    const controller = new CpiQueueFilterController({
      actionTimeoutMs: 12_345,
      settleDelayMs: 876
    })

    await controller.applyCriminalForumFilter(page)

    expect(targetState.checked).toBe(true)
    expect(otherState.checked).toBe(false)

    expect(advancedFilterButton.click).toHaveBeenCalledWith({
      timeout: 12_345
    })
    expect(selectButton.click).toHaveBeenCalledWith({
      timeout: 12_345
    })
    expect(page.waitForTimeout).toHaveBeenCalledWith(876)
  })

  it('deve clicar em Mostrar Tudo para consultar novamente a fila', async () => {
    const showAllButton = createActionLocator()

    const page = {
      locator: vi.fn((selector: string) => {
        if (selector === CPI_QUEUE_SELECTORS.showAllButton) {
          return showAllButton
        }

        throw new Error(`Seletor inesperado: ${selector}`)
      }),

      waitForLoadState: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined)
    } as unknown as Page

    const controller = new CpiQueueFilterController({
      actionTimeoutMs: 23_456,
      settleDelayMs: 987
    })

    await controller.refreshQueue(page)

    expect(showAllButton.click).toHaveBeenCalledWith({
      timeout: 23_456
    })
    expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', {
      timeout: 23_456
    })
    expect(page.waitForTimeout).toHaveBeenCalledWith(987)
  })

  it('deve falhar quando o frame do filtro não for encontrado', async () => {
    const advancedFilterButton = createActionLocator()

    const emptyProbe = {
      count: vi.fn(async () => 0)
    } as unknown as Locator

    const emptyFrame = {
      locator: vi.fn(() => emptyProbe)
    } as unknown as Frame

    const page = {
      locator: vi.fn(() => advancedFilterButton),
      frames: vi.fn(() => [emptyFrame]),
      waitForTimeout: vi.fn(async () => undefined)
    } as unknown as Page

    const controller = new CpiQueueFilterController({
      frameSearchAttempts: 2,
      frameSearchIntervalMs: 1
    })

    await expect(controller.applyCriminalForumFilter(page)).rejects.toThrow(
      'Frame do filtro avançado da CPI não encontrado'
    )
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2)
    expect(page.waitForTimeout).toHaveBeenNthCalledWith(1, 1)
    expect(page.waitForTimeout).toHaveBeenNthCalledWith(2, 1)
  })
})
