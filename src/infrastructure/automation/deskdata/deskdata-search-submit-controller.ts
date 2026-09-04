import {
  DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE,
  DESKDATA_PROCESSES_UPDATED_MESSAGE,
  DESKDATA_SUBMIT_SELECTORS
} from './deskdata-selectors'

interface DeskDataInitScriptRegistration {
  dispose(): Promise<void>
}

const DESKDATA_PROCESSES_UPDATE_OBSERVER_SCRIPT = `
(() => {
  const markerAttribute = ${JSON.stringify(DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE)}
  const completionMessage = ${JSON.stringify(DESKDATA_PROCESSES_UPDATED_MESSAGE)}
  const normalize = (value) => value
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
    .toLowerCase()
  const expectedMessage = normalize(completionMessage)
  let intervalId = 0
  const checkNotice = () => {
    const notice = [...document.querySelectorAll('.toast-message')].find(
      (element) =>
        element.getClientRects().length > 0 &&
        normalize(element.textContent ?? '') === expectedMessage
    )

    if (!notice || !document.documentElement) {
      return
    }

    document.documentElement.setAttribute(markerAttribute, 'true')
    window.clearInterval(intervalId)
  }

  intervalId = window.setInterval(checkNotice, 50)
  window.addEventListener('pagehide', () => window.clearInterval(intervalId), { once: true })
  checkNotice()
})()
`

export interface DeskDataSubmitLocator {
  count(): Promise<number>
  isEnabled(): Promise<boolean>

  click(options?: { timeout?: number }): Promise<void>
}

export interface DeskDataSubmitPage {
  locator(selector: string): DeskDataSubmitLocator
  url(): string

  addInitScript(script: { content: string }): Promise<DeskDataInitScriptRegistration>

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
    this.submitSettleDelayMs = options.submitSettleDelayMs ?? 15_000
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
    let observerRegistration: DeskDataInitScriptRegistration | undefined

    try {
      observerRegistration = await page.addInitScript({
        content: DESKDATA_PROCESSES_UPDATE_OBSERVER_SCRIPT
      })

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
    } finally {
      await observerRegistration?.dispose().catch(() => undefined)
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
