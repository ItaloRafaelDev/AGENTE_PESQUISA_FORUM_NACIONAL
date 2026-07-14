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

type SaveState = 'IDLE' | 'SAVING' | 'SAVED'

const SAVE_SELECTOR = 'form[name="form_cad"] a.button[onclick*="upd_pesq"]'

export class CpiResearchResultSaver {
  private state: SaveState = 'IDLE'

  async saveOnce(frame: CpiResearchSaveFrame): Promise<CpiResearchSaveResult> {
    if (this.state !== 'IDLE') {
      throw new Error('A pesquisa da CPI já foi gravada ou está sendo gravada nesta execução.')
    }

    const saveControl = frame.locator(SAVE_SELECTOR)
    const saveControlCount = await saveControl.count()

    if (saveControlCount !== 1) {
      throw new Error(
        'A ação Alterar deveria possuir exatamente um controle. Encontrados: ' + saveControlCount
      )
    }

    this.state = 'SAVING'

    try {
      await saveControl.click({
        timeout: 10_000
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
