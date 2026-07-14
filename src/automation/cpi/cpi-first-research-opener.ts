export const CPI_RESEARCH_SELECTORS = {
  researchRows:
    'div.row.linhas:has(input[type="checkbox"][id^="pesq_"]):has(i[title="Responder / Atualizar"])',

  responderAction: 'i[title="Responder / Atualizar"]',

  deleteAction: 'i[title="Excluir"]'
} as const

export interface ResearchLocator {
  count(): Promise<number>
  first(): ResearchLocator
  locator(selector: string): ResearchLocator
  click(options?: { timeout?: number }): Promise<void>
}

export interface ResearchFrame {
  url(): string
}

export interface ResearchPage {
  locator(selector: string): ResearchLocator
  frames(): ResearchFrame[]
  waitForTimeout(milliseconds: number): Promise<void>
}

export interface CpiFirstResearchOpenerOptions {
  frameSearchAttempts?: number
  frameSearchIntervalMs?: number
}

export interface OpenedResearchSnapshot {
  availableRows: number
  detailFramePath: string
}

export class CpiFirstResearchOpener {
  private readonly frameSearchAttempts: number
  private readonly frameSearchIntervalMs: number

  constructor(options: CpiFirstResearchOpenerOptions = {}) {
    this.frameSearchAttempts = options.frameSearchAttempts ?? 40

    this.frameSearchIntervalMs = options.frameSearchIntervalMs ?? 250
  }

  async openFirst(page: ResearchPage): Promise<OpenedResearchSnapshot> {
    const rows = page.locator(CPI_RESEARCH_SELECTORS.researchRows)

    const availableRows = await rows.count()

    if (availableRows === 0) {
      throw new Error('Nenhuma pesquisa disponível foi encontrada na fila da CPI')
    }

    const firstRow = rows.first()

    const responderAction = firstRow.locator(CPI_RESEARCH_SELECTORS.responderAction)

    if ((await responderAction.count()) !== 1) {
      throw new Error('Ação Responder / Atualizar não encontrada na primeira pesquisa')
    }

    await responderAction.click({
      timeout: 10_000
    })

    const detailFramePath = await this.waitForDetailFrame(page)

    return {
      availableRows,
      detailFramePath
    }
  }

  private async waitForDetailFrame(page: ResearchPage): Promise<string> {
    for (let attempt = 0; attempt < this.frameSearchAttempts; attempt += 1) {
      const detailFrame = page.frames().find((frame) => {
        try {
          return new URL(frame.url()).pathname
            .toLowerCase()
            .endsWith('/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx')
        } catch {
          return false
        }
      })

      if (detailFrame) {
        return new URL(detailFrame.url()).pathname
      }

      await page.waitForTimeout(this.frameSearchIntervalMs)
    }

    throw new Error('Formulário da pesquisa não foi aberto pela CPI')
  }
}
