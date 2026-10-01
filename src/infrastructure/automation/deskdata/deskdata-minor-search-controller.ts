import type { Page } from 'playwright'
import type { DeskDataDatasetController } from './deskdata-dataset-controller'
import type { DeskDataSearchSubmitController } from './deskdata-search-submit-controller'
import { DESKDATA_MINOR_SEARCH_SELECTORS } from './deskdata-selectors'

export interface DeskDataMinorSearchDependencies {
  readDetails(cpf: string): Promise<{ fullName: string; birthDate: string }>
  dataset: Pick<DeskDataDatasetController, 'applyApprovedDatasets'>
  submit: Pick<DeskDataSearchSubmitController, 'submitOnce'>
}

export class DeskDataMinorSearchController {
  private attempted = false

  constructor(
    private readonly dependencies: DeskDataMinorSearchDependencies,
    private readonly actionTimeoutMs = 10_000
  ) {}

  async retryIfRequired(page: Page, cpf: string): Promise<boolean> {
    if (!(await this.hasNotice(page))) return false
    if (this.attempted) {
      throw new Error('A tentativa por nome e nascimento já foi utilizada.')
    }
    this.attempted = true

    const details = await this.dependencies.readDetails(cpf)
    try {
      const options = { timeout: this.actionTimeoutMs }
      await page.locator(DESKDATA_MINOR_SEARCH_SELECTORS.back).click(options)
      await page
        .locator(DESKDATA_MINOR_SEARCH_SELECTORS.primaryKey)
        .selectOption('fullname', options)
      await page
        .locator(DESKDATA_MINOR_SEARCH_SELECTORS.secondaryKey)
        .selectOption('birthdate', options)
      await this.fillAndVerify(page, DESKDATA_MINOR_SEARCH_SELECTORS.fullName, details.fullName)
      await this.fillAndVerify(page, DESKDATA_MINOR_SEARCH_SELECTORS.birthDate, details.birthDate)
      await this.dependencies.dataset.applyApprovedDatasets(page)
      await this.dependencies.submit.submitOnce(page)
      return true
    } catch {
      // Playwright action errors can include personal values passed to fill().
      throw new Error('Não foi possível concluir a consulta DeskData por nome e nascimento.')
    }
  }

  async assertAvailable(page: Page): Promise<void> {
    if (await this.hasNotice(page)) {
      throw new Error('A busca DeskData permanece indisponível após informar nome e nascimento.')
    }
  }

  private async hasNotice(page: Page): Promise<boolean> {
    return (await page.locator(DESKDATA_MINOR_SEARCH_SELECTORS.notice).count()) > 0
  }

  private async fillAndVerify(page: Page, selector: string, value: string): Promise<void> {
    const input = page.locator(selector)
    const options = { timeout: this.actionTimeoutMs }
    await input.fill(value, options)
    if ((await input.inputValue(options)).trim() !== value) {
      throw new Error('A DeskData não manteve os dados preenchidos.')
    }
  }
}
