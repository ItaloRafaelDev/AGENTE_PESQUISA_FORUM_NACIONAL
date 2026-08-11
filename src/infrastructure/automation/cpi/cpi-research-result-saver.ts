import { CPI_RESEARCH_RESULT_SELECTORS } from './cpi-selectors'

export interface CpiResearchSaveLocator {
  count(): Promise<number>
  click(options?: { timeout?: number }): Promise<unknown>
}

export interface CpiResearchSaveFrame {
  locator(selector: string): CpiResearchSaveLocator
}

export interface CpiResearchSaveResult {
  saved: true
}

export interface CpiResearchResultSaverOptions {
  actionTimeoutMs?: number
}

type SaveState = 'IDLE' | 'SAVING' | 'SAVED'

export class CpiResearchResultSaver {
  private state: SaveState = 'IDLE'
  private readonly actionTimeoutMs: number

  constructor(options: CpiResearchResultSaverOptions = {}) {
    this.actionTimeoutMs = options.actionTimeoutMs ?? 10_000
  }

  async saveOnce(frame: CpiResearchSaveFrame): Promise<CpiResearchSaveResult> {
    if (this.state !== 'IDLE') {
      throw new Error('A pesquisa da CPI já foi gravada ou está sendo gravada nesta execução.')
    }

    const saveControl = frame.locator(CPI_RESEARCH_RESULT_SELECTORS.save)
    const saveControlCount = await saveControl.count()

    if (saveControlCount !== 1) {
      throw new Error(
        'A ação Alterar deveria possuir exatamente um controle. Encontrados: ' + saveControlCount
      )
    }

    this.state = 'SAVING'

    try {
      await saveControl.click({
        timeout: this.actionTimeoutMs
      })

      this.state = 'SAVED'

      return {
        saved: true
      }
    } catch (error: unknown) {
      this.state = 'IDLE'

      throw error
    }
  }
}
