export const DESKDATA_SUBMIT_SELECTORS = {
  searchButton: 'form#form input#search[name="submit"][type="submit"]'
} as const

export interface DeskDataSubmitLocator {
  count(): Promise<number>
  isEnabled(): Promise<boolean>

  click(options?: { timeout?: number }): Promise<void>
}

export interface DeskDataSubmitPage {
  locator(selector: string): DeskDataSubmitLocator
  url(): string

  waitForLoadState(
    state: 'domcontentloaded',
    options?: {
      timeout?: number
    }
  ): Promise<void>

  waitForTimeout(milliseconds: number): Promise<void>
}

export interface DeskDataSubmitSnapshot {
  status: 'SUBMITTED'
  resultPath: string
}

type SubmissionState = 'IDLE' | 'SUBMITTING' | 'SUBMITTED'

export class DeskDataSearchSubmitController {
  private state: SubmissionState = 'IDLE'

  async submitOnce(page: DeskDataSubmitPage): Promise<DeskDataSubmitSnapshot> {
    if (this.state !== 'IDLE') {
      throw new Error('A consulta da DeskData já foi enviada')
    }

    const searchButton = page.locator(DESKDATA_SUBMIT_SELECTORS.searchButton)

    if ((await searchButton.count()) !== 1) {
      throw new Error('Botão Consultar da DeskData não encontrado')
    }

    if (!(await searchButton.isEnabled())) {
      throw new Error('Botão Consultar da DeskData está desabilitado')
    }

    this.state = 'SUBMITTING'

    try {
      await searchButton.click({
        timeout: 10_000
      })

      await page
        .waitForLoadState('domcontentloaded', {
          timeout: 30_000
        })
        .catch(() => undefined)

      await page.waitForTimeout(1_000)

      this.state = 'SUBMITTED'

      return {
        status: 'SUBMITTED',
        resultPath: this.extractPath(page.url())
      }
    } catch (error) {
      this.state = 'IDLE'
      throw error
    }
  }

  private extractPath(pageUrl: string): string {
    try {
      return new URL(pageUrl).pathname
    } catch {
      return ''
    }
  }
}
