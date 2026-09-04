import type { DeskDataResearchPort } from '@/application/ports/research-preparation-ports'
import type { Page } from 'playwright'
import type { DeskDataCpfFormController } from '../deskdata/deskdata-cpf-form-controller'
import type { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import type { DeskDataResultReadyWaiter } from '../deskdata/deskdata-result-ready-waiter'
import type { DeskDataSearchResultPageResolver } from '../deskdata/deskdata-search-result-page-resolver'
import type { DeskDataSearchSubmitController } from '../deskdata/deskdata-search-submit-controller'
import type { PlaywrightResolvedDeskDataResultState } from './playwright-research-preparation-state'

export interface PlaywrightDeskDataResearchDependencies {
  cpfForm: Pick<DeskDataCpfFormController, 'fillCpf'>
  dataset: Pick<DeskDataDatasetController, 'applyApprovedDatasets'>
  submit: Pick<DeskDataSearchSubmitController, 'submitOnce'>
  resultPageResolver: Pick<DeskDataSearchResultPageResolver, 'resolve'>
  resultReady: Pick<DeskDataResultReadyWaiter, 'waitUntilReady'>
}

export class PlaywrightDeskDataResearchAdapter implements DeskDataResearchPort {
  private resolveActiveResult:
    (() => ReturnType<DeskDataSearchResultPageResolver['resolve']>) | null = null

  constructor(
    private readonly deskDataPage: Page,
    private readonly dependencies: PlaywrightDeskDataResearchDependencies,
    private readonly state: PlaywrightResolvedDeskDataResultState
  ) {}

  async fillCpf(cpf: string): Promise<void> {
    this.invalidateActivePreparation()

    try {
      await this.dependencies.cpfForm.fillCpf(this.deskDataPage, cpf)

      this.resolveActiveResult = () =>
        this.dependencies.resultPageResolver.resolve(this.deskDataPage, cpf)
    } catch (error: unknown) {
      this.invalidateActivePreparation()
      throw error
    }
  }

  async applyApprovedDatasets(): Promise<{ selectedCount: number }> {
    try {
      const result = await this.dependencies.dataset.applyApprovedDatasets(this.deskDataPage)

      return {
        selectedCount: result.selectedCount
      }
    } catch (error: unknown) {
      this.invalidateActivePreparation()
      throw error
    }
  }

  async submitOnce(): Promise<void> {
    try {
      await this.dependencies.submit.submitOnce(this.deskDataPage)
    } catch (error: unknown) {
      this.invalidateActivePreparation()
      throw error
    }
  }

  async waitUntilResultReady(): Promise<void> {
    const resolveResult = this.resolveActiveResult

    if (!resolveResult) {
      this.invalidateActivePreparation()
      throw new Error('O resultado da DeskData não foi resolvido para gerar o relatório.')
    }

    this.resolveActiveResult = null

    let resolvedResult: Awaited<ReturnType<DeskDataSearchResultPageResolver['resolve']>> | null =
      null
    let completed = false

    try {
      resolvedResult = await resolveResult()

      const readyResult = await this.dependencies.resultReady.waitUntilReady(resolvedResult.page)

      this.state.setResolvedResult({
        resultPage: resolvedResult.page,
        closeResultPageAfterSave: resolvedResult.closeAfterConfirmedSave,
        expectedProcessCount: readyResult.expectedProcessCount,
        expectedProcessNumbers: readyResult.expectedProcessNumbers
      })
      completed = true
    } catch (error: unknown) {
      await this.closeFailedHistoricalResult(resolvedResult)
      throw error
    } finally {
      this.resolveActiveResult = null

      if (!completed) {
        this.state.clearResolvedResult()
      }
    }
  }

  private invalidateActivePreparation(): void {
    this.resolveActiveResult = null
    this.state.clearResolvedResult()
  }

  private async closeFailedHistoricalResult(
    resolvedResult: Awaited<ReturnType<DeskDataSearchResultPageResolver['resolve']>> | null
  ): Promise<void> {
    if (!resolvedResult?.closeAfterConfirmedSave || resolvedResult.page === this.deskDataPage) {
      return
    }

    try {
      if (!resolvedResult.page.isClosed()) {
        await resolvedResult.page.close({
          runBeforeUnload: false
        })
      }
    } catch {
      // The readiness error remains the primary failure when best-effort popup cleanup fails.
    }
  }
}
