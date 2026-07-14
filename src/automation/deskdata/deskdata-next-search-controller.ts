export const DESKDATA_PEOPLE_URL = 'https://deskdata.com.br/pessoas/'

export const DESKDATA_NEXT_SEARCH_SELECTORS = {
  cpfInput: 'form#form input#cpf[name="cpf"][type="text"]',
  searchButton: 'form#form input#search[name="submit"][type="submit"]'
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
}

export interface DeskDataNextSearchPage {
  url(): string
  isClosed(): boolean
  bringToFront(): Promise<void>

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

export class DeskDataNextSearchController {
  async prepare(page: DeskDataNextSearchPage): Promise<DeskDataNextSearchResult> {
    if (page.isClosed()) {
      throw new Error('A aba da DeskData está fechada.')
    }

    await page.bringToFront()

    if (!this.isSearchPage(page.url())) {
      await page.goto(DESKDATA_PEOPLE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000
      })
    }

    if (!this.isSearchPage(page.url())) {
      throw new Error('A DeskData não retornou para a página Consultar pessoas.')
    }

    const cpfInput = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.cpfInput)

    const searchButton = page.locator(DESKDATA_NEXT_SEARCH_SELECTORS.searchButton)

    const [cpfInputCount, searchButtonCount] = await Promise.all([
      cpfInput.count(),
      searchButton.count()
    ])

    if (cpfInputCount !== 1 || searchButtonCount !== 1) {
      throw new Error('O formulário Consultar pessoas da DeskData não ficou disponível.')
    }

    if (!cpfInput.fill || !cpfInput.inputValue) {
      throw new Error('O campo CPF da DeskData não permite limpeza e validação.')
    }

    await cpfInput.fill('', {
      timeout: 10_000
    })

    const persistedValue = await cpfInput.inputValue({
      timeout: 5_000
    })

    if (persistedValue.trim() !== '') {
      throw new Error('A DeskData não limpou o campo CPF para a próxima consulta.')
    }

    return {
      status: 'READY',
      pagePath: '/pessoas/',
      cpfCleared: true
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
