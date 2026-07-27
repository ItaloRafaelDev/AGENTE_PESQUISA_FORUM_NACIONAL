export const DESKDATA_PEOPLE_URL = 'https://app.deskdata.com.br/pessoas/'

export const DESKDATA_NEXT_SEARCH_SELECTORS = {
  cpfInput: 'form#form input#cpf[name="cpf"][type="text"]',
  searchButton: 'form#form input#search[name="submit"][type="submit"]',
  similarQueriesHeading: 'h5:has-text("Consultas semelhantes encontradas")',
  consultPeopleLink:
    'a[href="https://app.deskdata.com.br/pessoas/"]:visible, a[href="https://app.deskdata.com.br/pessoas"]:visible'
} as const

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

interface DeskDataSearchFormControls {
  cpfInput: DeskDataNextSearchLocator
  searchButton: DeskDataNextSearchLocator
  available: boolean
}

const FORM_READY_ATTEMPTS = 40
const FORM_READY_INTERVAL_MS = 250

export class DeskDataNextSearchController {
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
      await page.goto(DESKDATA_PEOPLE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000
      })

      form = await this.waitForSearchForm(page)
    }

    if (!this.isSearchPage(page.url())) {
      throw new Error('A DeskData nao retornou para a pagina Consultar pessoas.')
    }

    if (!form.available) {
      throw new Error('O formulario Consultar pessoas da DeskData nao ficou disponivel.')
    }

    if (!form.cpfInput.fill || !form.cpfInput.inputValue) {
      throw new Error('O campo CPF da DeskData nao permite limpeza e validacao.')
    }

    await form.cpfInput.fill('', {
      timeout: 10_000
    })

    const persistedValue = await form.cpfInput.inputValue({
      timeout: 5_000
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
      timeout: 10_000
    })
  }

  private async waitForSearchForm(
    page: DeskDataNextSearchPage
  ): Promise<DeskDataSearchFormControls> {
    let form = await this.inspectSearchForm(page)

    for (let attempt = 0; attempt < FORM_READY_ATTEMPTS && !form.available; attempt += 1) {
      if (page.isClosed()) {
        throw new Error('A aba da DeskData foi fechada durante a preparacao.')
      }

      if (attempt < FORM_READY_ATTEMPTS - 1) {
        await page.waitForTimeout(FORM_READY_INTERVAL_MS)
        form = await this.inspectSearchForm(page)
      }
    }

    return form
  }

  private async inspectSearchForm(
    page: DeskDataNextSearchPage
  ): Promise<DeskDataSearchFormControls> {
    const cpfInput = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.cpfInput)

    const searchButton = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.searchButton)

    const [cpfInputCount, searchButtonCount] = await Promise.all([
      cpfInput.count().catch(() => 0),
      searchButton.count().catch(() => 0)
    ])

    return {
      cpfInput,
      searchButton,
      available: cpfInputCount === 1 && searchButtonCount === 1
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
