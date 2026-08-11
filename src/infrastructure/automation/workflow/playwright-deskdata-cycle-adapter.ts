import type { DeskDataCyclePort } from '@/application/ports/research-cycle-ports'
import type { Page } from 'playwright'
import type {
  DeskDataNextSearchController,
  DeskDataNextSearchPage
} from '../deskdata/deskdata-next-search-controller'
import type { PlaywrightResolvedDeskDataResultState } from './playwright-research-preparation-state'

export interface PlaywrightDeskDataCycleDependencies {
  prepare: Pick<DeskDataNextSearchController, 'prepare'>
}

export class PlaywrightDeskDataCycleAdapter implements DeskDataCyclePort {
  constructor(
    private readonly deskDataPage: Page,
    private readonly dependencies: PlaywrightDeskDataCycleDependencies,
    private readonly preparationState: PlaywrightResolvedDeskDataResultState
  ) {}

  async prepareNextSearch(): Promise<void> {
    await this.dependencies.prepare.prepare(this.deskDataPage as unknown as DeskDataNextSearchPage)
  }

  async closeHistoricalResult(): Promise<void> {
    const resolvedResult = this.preparationState.requireResolvedResult()

    try {
      if (!resolvedResult.closeResultPageAfterSave) {
        return
      }

      if (resolvedResult.resultPage === this.deskDataPage) {
        throw new Error(
          'A aba principal da DeskData não pode ser fechada como resultado histórico.'
        )
      }

      if (!resolvedResult.resultPage.isClosed()) {
        await resolvedResult.resultPage.close({
          runBeforeUnload: false
        })
      }
    } finally {
      this.preparationState.clearResolvedResult()
    }
  }
}
