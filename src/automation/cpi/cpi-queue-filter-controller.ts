import type { Frame, Locator, Page } from 'playwright'

export const CPI_QUEUE_SELECTORS = {
  advancedFilterButton: 'a.link:has(i[title="Filtros Avançados"])',

  showAllButton: 'a.link:has(i[title="Mostrar Tudo"])',

  targetFilterCheckbox: 'input#id_tipo_pesq_29[name="id_tipo_pesq"]',

  allFilterCheckboxes: 'input[type="checkbox"][name="id_tipo_pesq"]',

  selectButton: 'div.pa.ac > a.button:has-text("Selecionar")'
} as const

export interface CpiQueueFilterControllerOptions {
  frameSearchAttempts?: number
  frameSearchIntervalMs?: number
}

export class CpiQueueFilterController {
  private readonly frameSearchAttempts: number
  private readonly frameSearchIntervalMs: number

  constructor(options: CpiQueueFilterControllerOptions = {}) {
    this.frameSearchAttempts = options.frameSearchAttempts ?? 40

    this.frameSearchIntervalMs = options.frameSearchIntervalMs ?? 250
  }

  async applyCriminalForumFilter(page: Page): Promise<void> {
    const advancedFilterButton = await this.requirePageControl(
      page,
      CPI_QUEUE_SELECTORS.advancedFilterButton,
      'Botão Filtros Avançados da CPI não encontrado'
    )

    await advancedFilterButton.click({
      timeout: 10_000
    })

    const filterFrame = await this.findAdvancedFilterFrame(page)

    await this.selectOnlyTargetFilter(filterFrame)

    const selectButton = await this.requireFrameControl(
      filterFrame,
      CPI_QUEUE_SELECTORS.selectButton,
      'Botão Selecionar do filtro da CPI não encontrado'
    )

    await selectButton.click({
      timeout: 10_000
    })

    await page.waitForTimeout(700)
  }

  async refreshQueue(page: Page): Promise<void> {
    const showAllButton = await this.requirePageControl(
      page,
      CPI_QUEUE_SELECTORS.showAllButton,
      'Botão Mostrar Tudo da CPI não encontrado'
    )

    await showAllButton.click({
      timeout: 10_000
    })

    await page
      .waitForLoadState('domcontentloaded', {
        timeout: 10_000
      })
      .catch(() => undefined)

    await page.waitForTimeout(700)
  }

  private async selectOnlyTargetFilter(frame: Frame): Promise<void> {
    const checkboxes = frame.locator(CPI_QUEUE_SELECTORS.allFilterCheckboxes)

    const checkboxCount = await checkboxes.count()

    if (checkboxCount === 0) {
      throw new Error('Nenhum filtro de pesquisa foi encontrado na CPI')
    }

    let targetFound = false

    for (let index = 0; index < checkboxCount; index += 1) {
      const checkbox = checkboxes.nth(index)
      const checkboxId = await checkbox.getAttribute('id')

      const isTarget = checkboxId === 'id_tipo_pesq_29'

      if (isTarget) {
        targetFound = true
      }

      await checkbox.evaluate((element, shouldBeChecked) => {
        const input = element as HTMLInputElement

        if (input.checked === shouldBeChecked) {
          return
        }

        input.checked = shouldBeChecked

        input.dispatchEvent(
          new Event('input', {
            bubbles: true
          })
        )

        input.dispatchEvent(
          new Event('change', {
            bubbles: true
          })
        )
      }, isTarget)
    }

    if (!targetFound) {
      throw new Error('Filtro PROCESSOS JUDICIAIS CRIMINAL FÓRUM NACIONAL CPF não encontrado')
    }
  }

  private async findAdvancedFilterFrame(page: Page): Promise<Frame> {
    for (let attempt = 0; attempt < this.frameSearchAttempts; attempt += 1) {
      for (const frame of page.frames()) {
        const targetCount = await frame
          .locator(CPI_QUEUE_SELECTORS.targetFilterCheckbox)
          .count()
          .catch(() => 0)

        if (targetCount > 0) {
          return frame
        }
      }

      await page.waitForTimeout(this.frameSearchIntervalMs)
    }

    throw new Error('Frame do filtro avançado da CPI não encontrado')
  }

  private async requirePageControl(
    page: Page,
    selector: string,
    errorMessage: string
  ): Promise<Locator> {
    const control = page.locator(selector)

    if ((await control.count()) === 0) {
      throw new Error(errorMessage)
    }

    return control
  }

  private async requireFrameControl(
    frame: Frame,
    selector: string,
    errorMessage: string
  ): Promise<Locator> {
    const control = frame.locator(selector)

    if ((await control.count()) === 0) {
      throw new Error(errorMessage)
    }

    return control
  }
}
