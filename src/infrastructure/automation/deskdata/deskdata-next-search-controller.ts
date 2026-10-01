import { DESKDATA_NEXT_SEARCH_SELECTORS } from './deskdata-selectors'

export const DESKDATA_PEOPLE_URL = 'https://app.deskdata.com.br/pessoas/'

export interface DeskDataNextSearchLocator {
  count(): Promise<number>

  fill?(
    value: string,
    options?: {
      timeout?: number
    }
  ): Promise<void>

  inputValue?(options?: { timeout?: number }): Promise<string>

  click?(options?: { timeout?: number }): Promise<void>

  selectOption?(
    value: string,
    options?: {
      timeout?: number
    }
  ): Promise<string[]>
}

export interface DeskDataNextSearchPage {
  url(): string
  isClosed(): boolean
  bringToFront(): Promise<void>
  waitForTimeout(milliseconds: number): Promise<void>

  goto(
    url: string,
    options?: {
      waitUntil?: 'domcontentloaded'
      timeout?: number
    }
  ): Promise<unknown>

  locator(selector: string): DeskDataNextSearchLocator
}

export interface DeskDataNextSearchResult {
  status: 'READY'
  pagePath: '/pessoas/'
  cpfCleared: true
}

export interface DeskDataNextSearchControllerOptions {
  peopleUrl?: string
  formReadyAttempts?: number
  pollingIntervalMs?: number
  navigationTimeoutMs?: number
  actionTimeoutMs?: number
  readTimeoutMs?: number
}

interface DeskDataSearchFormControls {
  primaryKey: DeskDataNextSearchLocator
  cpfInput: DeskDataNextSearchLocator
  searchButton: DeskDataNextSearchLocator
  available: boolean
}

export class DeskDataNextSearchController {
  private readonly peopleUrl: string
  private readonly formReadyAttempts: number
  private readonly pollingIntervalMs: number
  private readonly navigationTimeoutMs: number
  private readonly actionTimeoutMs: number
  private readonly readTimeoutMs: number

  constructor(options: DeskDataNextSearchControllerOptions = {}) {
    this.peopleUrl = options.peopleUrl ?? DESKDATA_PEOPLE_URL
    this.formReadyAttempts = options.formReadyAttempts ?? 40
    this.pollingIntervalMs = options.pollingIntervalMs ?? 250
    this.navigationTimeoutMs = options.navigationTimeoutMs ?? 30_000
    this.actionTimeoutMs = options.actionTimeoutMs ?? 10_000
    this.readTimeoutMs = options.readTimeoutMs ?? 5_000
  }

  async prepare(page: DeskDataNextSearchPage): Promise<DeskDataNextSearchResult> {
    if (page.isClosed()) {
      throw new Error('A aba da DeskData esta fechada.')
    }

    await page.bringToFront()

    let form = await this.inspectSearchForm(page)
    const similarQueriesVisible = await this.isSimilarQueriesPage(page)

    if (similarQueriesVisible) {
      await this.clickConsultPeople(page)
      form = await this.waitForSearchForm(page)
    } else if (!this.isSearchPage(page.url()) || !form.available) {
      await page.goto(this.peopleUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.navigationTimeoutMs
      })

      form = await this.waitForSearchForm(page)
    }

    if (!this.isSearchPage(page.url())) {
      throw new Error('A DeskData nao retornou para a pagina Consultar pessoas.')
    }

    if (!form.available) {
      throw new Error('O formulario Consultar pessoas da DeskData nao ficou disponivel.')
    }

    if (
      !form.primaryKey.selectOption ||
      !form.primaryKey.inputValue ||
      !form.cpfInput.fill ||
      !form.cpfInput.inputValue
    ) {
      throw new Error('O formulario CPF da DeskData nao permite preparacao e validacao.')
    }

    await form.primaryKey.selectOption('cpf', {
      timeout: this.actionTimeoutMs
    })

    const persistedPrimaryKey = await form.primaryKey.inputValue({
      timeout: this.readTimeoutMs
    })

    if (persistedPrimaryKey !== 'cpf') {
      throw new Error('A DeskData nao restaurou a chave CPF para a proxima consulta.')
    }

    await form.cpfInput.fill('', {
      timeout: this.actionTimeoutMs
    })

    const persistedValue = await form.cpfInput.inputValue({
      timeout: this.readTimeoutMs
    })

    if (persistedValue.trim() !== '') {
      throw new Error('A DeskData nao limpou o campo CPF para a proxima consulta.')
    }

    return {
      status: 'READY',
      pagePath: '/pessoas/',
      cpfCleared: true
    }
  }

  private async isSimilarQueriesPage(page: DeskDataNextSearchPage): Promise<boolean> {
    const heading = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.similarQueriesHeading)

    const count = await heading.count().catch(() => 0)

    if (count > 1) {
      throw new Error('A pagina de consultas semelhantes possui mais de um titulo esperado.')
    }

    return count === 1
  }

  private async clickConsultPeople(page: DeskDataNextSearchPage): Promise<void> {
    const link = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.consultPeopleLink)

    const count = await link.count().catch(() => 0)

    if (count !== 1 || !link.click) {
      throw new Error('O link Consultar pessoas da DeskData nao foi encontrado.')
    }

    await link.click({
      timeout: this.actionTimeoutMs
    })
  }

  private async waitForSearchForm(
    page: DeskDataNextSearchPage
  ): Promise<DeskDataSearchFormControls> {
    let form = await this.inspectSearchForm(page)

    for (let attempt = 0; attempt < this.formReadyAttempts && !form.available; attempt += 1) {
      if (page.isClosed()) {
        throw new Error('A aba da DeskData foi fechada durante a preparacao.')
      }

      if (attempt < this.formReadyAttempts - 1) {
        await page.waitForTimeout(this.pollingIntervalMs)
        form = await this.inspectSearchForm(page)
      }
    }

    return form
  }

  private async inspectSearchForm(
    page: DeskDataNextSearchPage
  ): Promise<DeskDataSearchFormControls> {
    const primaryKey = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.primaryKey)
    const cpfInput = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.cpfInput)

    const searchButton = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.searchButton)

    const [primaryKeyCount, cpfInputCount, searchButtonCount] = await Promise.all([
      primaryKey.count().catch(() => 0),
      cpfInput.count().catch(() => 0),
      searchButton.count().catch(() => 0)
    ])

    return {
      primaryKey,
      cpfInput,
      searchButton,
      available: primaryKeyCount === 1 && cpfInputCount === 1 && searchButtonCount === 1
    }
  }

  private isSearchPage(pageUrl: string): boolean {
    try {
      const url = new URL(pageUrl)

      return (
        (url.hostname === 'deskdata.com.br' || url.hostname.endsWith('.deskdata.com.br')) &&
        (url.pathname === '/pessoas' || url.pathname === '/pessoas/')
      )
    } catch {
      return false
    }
  }
}
