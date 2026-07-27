import { describe, expect, it } from 'vitest'
import {
  DESKDATA_SUBMIT_SELECTORS,
  DeskDataSearchSubmitController,
  type DeskDataSubmitLocator,
  type DeskDataSubmitPage
} from '@/automation/deskdata/deskdata-search-submit-controller'

interface MutablePageState {
  url: string
}

class FakeLocator implements DeskDataSubmitLocator {
  public clickCalls = 0

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

  async click(): Promise<void> {
    this.clickCalls += 1
    this.onClick?.()
  }
}

class FakePage implements DeskDataSubmitPage {
  public loadStateCalls = 0
  public timeoutCalls = 0

  constructor(
    private readonly state: MutablePageState,
    private readonly searchButton: DeskDataSubmitLocator
  ) {}

  locator(selector: string): DeskDataSubmitLocator {
    if (selector === DESKDATA_SUBMIT_SELECTORS.searchButton) {
      return this.searchButton
    }

    return new FakeLocator(0, false)
  }

  url(): string {
    return this.state.url
  }

  async waitForLoadState(): Promise<void> {
    this.loadStateCalls += 1
  }

  async waitForTimeout(): Promise<void> {
    this.timeoutCalls += 1
  }
}

describe('DeskDataSearchSubmitController', () => {
  it('deve enviar a consulta exatamente uma vez', async () => {
    const state: MutablePageState = {
      url: 'https://app.deskdata.com.br/pessoas/'
    }

    const button = new FakeLocator(1, true, () => {
      state.url = 'https://app.deskdata.com.br/pessoas/resultado/'
    })

    const page = new FakePage(state, button)
    const controller = new DeskDataSearchSubmitController()

    await expect(controller.submitOnce(page)).resolves.toEqual({
      status: 'SUBMITTED',
      resultPath: '/pessoas/resultado/'
    })

    expect(button.clickCalls).toBe(1)

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
