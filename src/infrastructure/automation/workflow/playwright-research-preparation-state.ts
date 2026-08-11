import type { Page } from 'playwright'

export interface PlaywrightResolvedDeskDataResult {
  resultPage: Page
  closeResultPageAfterSave: boolean
}

export interface PlaywrightResolvedDeskDataResultState {
  setResolvedResult(value: PlaywrightResolvedDeskDataResult): void
  clearResolvedResult(): void
  requireResolvedResult(): PlaywrightResolvedDeskDataResult
}

export class PlaywrightResearchPreparationState implements PlaywrightResolvedDeskDataResultState {
  private resolvedResult: PlaywrightResolvedDeskDataResult | null = null

  setResolvedResult(value: PlaywrightResolvedDeskDataResult): void {
    this.resolvedResult = value
  }

  clearResolvedResult(): void {
    this.resolvedResult = null
  }

  requireResolvedResult(): PlaywrightResolvedDeskDataResult {
    if (!this.resolvedResult) {
      throw new Error('O resultado da DeskData não foi resolvido para gerar o relatório.')
    }

    return this.resolvedResult
  }
}
