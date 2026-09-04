import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { DESKDATA_SUBMIT_SELECTORS } from '@/infrastructure/automation/deskdata/deskdata-selectors'
import { DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE } from '@/infrastructure/automation/deskdata/deskdata-selectors'
import {
  DeskDataSearchSubmitController,
  type DeskDataSubmitLocator,
  type DeskDataSubmitPage
} from '@/infrastructure/automation/deskdata/deskdata-search-submit-controller'

interface MutablePageState {
  url: string
}

class FakeLocator implements DeskDataSubmitLocator {
  public clickCalls = 0
  public clickTimeoutMs: number | undefined

  constructor(
    private readonly elementCount: number,
    private readonly enabled: boolean,
    private readonly onClick?: () => void
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.elementCount)
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(this.enabled)
  }

  async click(options?: { timeout?: number }): Promise<void> {
    this.clickCalls += 1
    this.clickTimeoutMs = options?.timeout
    this.onClick?.()
  }
}

class FakePage implements DeskDataSubmitPage {
  public loadStateCalls = 0
  public timeoutCalls = 0
  public initScriptCalls = 0
  public initScriptDisposeCalls = 0
  public initScriptKind = ''
  public initScriptContent = ''
  public loadTimeoutMs: number | undefined
  public settleDelayMs: number | undefined

  constructor(
    private readonly state: MutablePageState,
    private readonly searchButton: DeskDataSubmitLocator,
    private readonly onInitScript?: () => void
  ) {}

  async addInitScript(script: unknown): Promise<{ dispose(): Promise<void> }> {
    this.initScriptCalls += 1
    this.initScriptKind =
      typeof script === 'object' && script !== null && 'content' in script
        ? 'self-contained-content'
        : typeof script
    this.initScriptContent =
      typeof script === 'object' && script !== null && 'content' in script
        ? String(script.content)
        : ''
    this.onInitScript?.()

    return {
      dispose: async () => {
        this.initScriptDisposeCalls += 1
      }
    }
  }

  locator(selector: string): DeskDataSubmitLocator {
    if (selector === DESKDATA_SUBMIT_SELECTORS.searchButton) {
      return this.searchButton
    }

    return new FakeLocator(0, false)
  }

  url(): string {
    return this.state.url
  }

  async waitForLoadState(
    _state: 'domcontentloaded',
    options?: {
      timeout?: number
    }
  ): Promise<void> {
    this.loadStateCalls += 1
    this.loadTimeoutMs = options?.timeout
  }

  async waitForTimeout(milliseconds: number): Promise<void> {
    this.timeoutCalls += 1
    this.settleDelayMs = milliseconds
  }
}

describe('DeskDataSearchSubmitController', () => {
  it('aguarda quinze segundos após clicar em Consultar', async () => {
    const state: MutablePageState = {
      url: 'https://app.deskdata.com.br/pessoas/'
    }
    const page = new FakePage(
      state,
      new FakeLocator(1, true, () => {
        state.url = 'https://app.deskdata.com.br/pessoas/resultado/'
      })
    )

    await new DeskDataSearchSubmitController().submitOnce(page)

    expect(page.settleDelayMs).toBe(15_000)
  })

  it('não confirma um toast que apenas contém a mensagem esperada', async () => {
    const page = new FakePage(
      { url: 'https://app.deskdata.com.br/pessoas/' },
      new FakeLocator(1, true)
    )

    await new DeskDataSearchSubmitController({ submitSettleDelayMs: 1 }).submitOnce(page)

    const dom = new JSDOM(
      '<div class="toast-message">A consulta ao conjunto de dados Processos foi atualizada. Conteúdo divergente.</div>',
      { runScripts: 'outside-only' }
    )
    dom.window.Element.prototype.getClientRects = () => ({ length: 1 }) as DOMRectList
    dom.window.setInterval = ((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler()
      }

      return 1
    }) as typeof dom.window.setInterval

    dom.window.eval(page.initScriptContent)

    expect(
      dom.window.document.documentElement.getAttribute(DESKDATA_PROCESSES_UPDATED_MARKER_ATTRIBUTE)
    ).toBeNull()
    dom.window.close()
  })

  it('arma a confirmação persistente de Processos antes de enviar a consulta', async () => {
    const events: string[] = []
    const state: MutablePageState = {
      url: 'https://app.deskdata.com.br/pessoas/'
    }
    const button = new FakeLocator(1, true, () => {
      events.push('submit')
      state.url = 'https://app.deskdata.com.br/pessoas/resultado/'
    })
    const page = new FakePage(state, button, () => events.push('arm-readiness'))

    await new DeskDataSearchSubmitController({ submitSettleDelayMs: 1 }).submitOnce(page)

    expect(events).toEqual(['arm-readiness', 'submit'])
    expect(page.initScriptCalls).toBe(1)
    expect(page.initScriptDisposeCalls).toBe(1)
    expect(page.initScriptKind).toBe('self-contained-content')
  })

  it('deve enviar a consulta exatamente uma vez', async () => {
    const state: MutablePageState = {
      url: 'https://app.deskdata.com.br/pessoas/'
    }

    const button = new FakeLocator(1, true, () => {
      state.url = 'https://app.deskdata.com.br/pessoas/resultado/'
    })

    const page = new FakePage(state, button)
    const controller = new DeskDataSearchSubmitController({
      actionTimeoutMs: 12_345,
      navigationTimeoutMs: 31_234,
      submitSettleDelayMs: 1_234
    })

    await expect(controller.submitOnce(page)).resolves.toEqual({
      status: 'SUBMITTED',
      resultPath: '/pessoas/resultado/'
    })

    expect(button.clickCalls).toBe(1)
    expect(button.clickTimeoutMs).toBe(12_345)
    expect(page.loadTimeoutMs).toBe(31_234)
    expect(page.settleDelayMs).toBe(1_234)

    await expect(controller.submitOnce(page)).rejects.toThrow(
      'A consulta da DeskData já foi enviada'
    )

    expect(button.clickCalls).toBe(1)
  })

  it('deve falhar quando o botão Consultar não existir', async () => {
    const page = new FakePage(
      {
        url: 'https://app.deskdata.com.br/pessoas/'
      },
      new FakeLocator(0, false)
    )

    const controller = new DeskDataSearchSubmitController()

    await expect(controller.submitOnce(page)).rejects.toThrow(
      'Botão Consultar da DeskData não encontrado'
    )
  })

  it('deve falhar quando o botão estiver desabilitado', async () => {
    const page = new FakePage(
      {
        url: 'https://app.deskdata.com.br/pessoas/'
      },
      new FakeLocator(1, false)
    )

    const controller = new DeskDataSearchSubmitController()

    await expect(controller.submitOnce(page)).rejects.toThrow(
      'Botão Consultar da DeskData está desabilitado'
    )
  })
})
