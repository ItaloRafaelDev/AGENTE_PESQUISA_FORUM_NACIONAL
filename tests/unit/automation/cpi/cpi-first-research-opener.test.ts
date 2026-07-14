import { describe, expect, it } from 'vitest'
import {
  CPI_RESEARCH_SELECTORS,
  CpiFirstResearchOpener,
  type ResearchFrame,
  type ResearchLocator,
  type ResearchPage
} from '@/automation/cpi/cpi-first-research-opener'

class FakeLocator implements ResearchLocator {
  public clickCalls = 0

  constructor(
    private readonly elementCount: number,
    private readonly children = new Map<string, FakeLocator>()
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.elementCount)
  }

  first(): ResearchLocator {
    return this
  }

  locator(selector: string): ResearchLocator {
    const child = this.children.get(selector)

    if (!child) {
      return new FakeLocator(0)
    }

    return child
  }

  async click(): Promise<void> {
    this.clickCalls += 1
  }
}

class FakeFrame implements ResearchFrame {
  constructor(private readonly frameUrl: string) {}

  url(): string {
    return this.frameUrl
  }
}

class FakePage implements ResearchPage {
  public waitCalls = 0

  constructor(
    private readonly rows: FakeLocator,
    private readonly frameList: ResearchFrame[]
  ) {}

  locator(selector: string): ResearchLocator {
    if (selector === CPI_RESEARCH_SELECTORS.researchRows) {
      return this.rows
    }

    return new FakeLocator(0)
  }

  frames(): ResearchFrame[] {
    return this.frameList
  }

  async waitForTimeout(): Promise<void> {
    this.waitCalls += 1
  }
}

describe('CpiFirstResearchOpener', () => {
  it('deve abrir somente a primeira pesquisa pela ação Responder / Atualizar', async () => {
    const responderAction = new FakeLocator(1)
    const deleteAction = new FakeLocator(1)

    const rows = new FakeLocator(
      2,
      new Map([
        [CPI_RESEARCH_SELECTORS.responderAction, responderAction],
        [CPI_RESEARCH_SELECTORS.deleteAction, deleteAction]
      ])
    )

    const page = new FakePage(rows, [
      new FakeFrame(
        'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx?id_cadastro=123'
      )
    ])

    const opener = new CpiFirstResearchOpener()

    await expect(opener.openFirst(page)).resolves.toEqual({
      availableRows: 2,
      detailFramePath: '/zpersEspecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    })

    expect(responderAction.clickCalls).toBe(1)
    expect(deleteAction.clickCalls).toBe(0)
  })

  it('deve falhar quando não houver pesquisa disponível', async () => {
    const page = new FakePage(new FakeLocator(0), [])

    const opener = new CpiFirstResearchOpener()

    await expect(opener.openFirst(page)).rejects.toThrow(
      'Nenhuma pesquisa disponível foi encontrada na fila da CPI'
    )
  })

  it('deve falhar quando a ação Responder / Atualizar não existir', async () => {
    const page = new FakePage(new FakeLocator(1), [])

    const opener = new CpiFirstResearchOpener()

    await expect(opener.openFirst(page)).rejects.toThrow(
      'Ação Responder / Atualizar não encontrada na primeira pesquisa'
    )
  })

  it('deve falhar se o formulário de detalhes não abrir', async () => {
    const responderAction = new FakeLocator(1)

    const rows = new FakeLocator(
      1,
      new Map([[CPI_RESEARCH_SELECTORS.responderAction, responderAction]])
    )

    const page = new FakePage(rows, [])

    const opener = new CpiFirstResearchOpener({
      frameSearchAttempts: 2,
      frameSearchIntervalMs: 1
    })

    await expect(opener.openFirst(page)).rejects.toThrow(
      'Formulário da pesquisa não foi aberto pela CPI'
    )
  })
})
