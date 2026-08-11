import { DESKDATA_SUBMIT_SELECTORS } from './deskdata-selectors'

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

export interface DeskDataSearchSubmitControllerOptions {
  actionTimeoutMs?: number
  navigationTimeoutMs?: number
  submitSettleDelayMs?: number
}

type SubmissionState = 'IDLE' | 'SUBMITTING' | 'SUBMITTED'

export class DeskDataSearchSubmitController {
  private state: SubmissionState = 'IDLE'
  private readonly actionTimeoutMs: number
  private readonly navigationTimeoutMs: number
  private readonly submitSettleDelayMs: number

  constructor(options: DeskDataSearchSubmitControllerOptions = {}) {
    this.actionTimeoutMs = options.actionTimeoutMs ?? 10_000
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000
    this.submitSettleDelayMs = options.submitSettleDelayMs ?? 1_000
  }

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
        timeout: this.actionTimeoutMs
      })

      await page
        .waitForLoadState('domcontentloaded', {
          timeout: this.navigationTimeoutMs
        })
        .catch(() => undefined)

      await page.waitForTimeout(this.submitSettleDelayMs)

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
