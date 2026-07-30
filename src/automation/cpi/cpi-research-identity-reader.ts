import { setTimeout as wait } from 'node:timers/promises'
import { isValidCpf, maskCpfForLog } from '../../shared/utils/cpf'

const DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

export const CPI_RESEARCH_DATA_SELECTORS = {
  cpfValue:
    'xpath=//div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " txt ") and normalize-space(.)="CPF:"]/following-sibling::div[contains(concat(" ", normalize-space(@class), " "), " cell ") and contains(concat(" ", normalize-space(@class), " "), " field ")][1]'
} as const

export interface ResearchDataLocator {
  count(): Promise<number>
  first(): ResearchDataLocator

  innerText(options?: { timeout?: number }): Promise<string>
}

export interface ResearchDataFrame {
  url(): string

  locator(selector: string): ResearchDataLocator
}

export interface ResearchDataPage {
  frames(): ResearchDataFrame[]
}

export interface CpiResearchIdentity {
  cpf: string
  maskedCpf: string
  detailFramePath: string
}

export interface CpiResearchIdentityReaderOptions {
  searchAttempts?: number
  searchIntervalMs?: number
  readTimeoutMs?: number
}

export class CpiResearchIdentityReader {
  private readonly searchAttempts: number
  private readonly searchIntervalMs: number
  private readonly readTimeoutMs: number

  constructor(options: CpiResearchIdentityReaderOptions = {}) {
    this.searchAttempts = options.searchAttempts ?? 40

    this.searchIntervalMs = options.searchIntervalMs ?? 250

    this.readTimeoutMs = options.readTimeoutMs ?? 5_000

    if (this.searchAttempts < 1) {
      throw new Error('Número de tentativas deve ser maior que zero')
    }

    if (this.searchIntervalMs < 0) {
      throw new Error('Intervalo de busca não pode ser negativo')
    }
  }

  async read(page: ResearchDataPage): Promise<CpiResearchIdentity> {
    let detailFrameFound = false

    for (let attempt = 0; attempt < this.searchAttempts; attempt += 1) {
      const detailFrames = page.frames().filter((frame) => this.isDetailFrame(frame))

      if (detailFrames.length > 0) {
        detailFrameFound = true
      }

      for (const detailFrame of detailFrames) {
        const cpfField = detailFrame.locator(CPI_RESEARCH_DATA_SELECTORS.cpfValue)

        const cpfFieldCount = await cpfField.count().catch(() => 0)

        if (cpfFieldCount === 0) {
          continue
        }

        const rawCpf = await cpfField.first().innerText({
          timeout: this.readTimeoutMs
        })

        const cpf = rawCpf.replace(/\D/g, '')

        if (!isValidCpf(cpf)) {
          throw new Error('CPF capturado na CPI é inválido')
        }

        return {
          cpf,
          maskedCpf: maskCpfForLog(cpf),
          detailFramePath: new URL(detailFrame.url()).pathname
        }
      }

      if (attempt < this.searchAttempts - 1) {
        await wait(this.searchIntervalMs)
      }
    }

    if (!detailFrameFound) {
      throw new Error('Formulário interno da pesquisa da CPI não encontrado')
    }

    throw new Error('Campo CPF da pesquisa da CPI não encontrado')
  }

  private isDetailFrame(frame: ResearchDataFrame): boolean {
    try {
      return new URL(frame.url()).pathname.toLowerCase() === DETAIL_FRAME_PATH
    } catch {
      return false
    }
  }
}
