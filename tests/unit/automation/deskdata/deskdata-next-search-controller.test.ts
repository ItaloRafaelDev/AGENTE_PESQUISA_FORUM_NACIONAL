import { describe, expect, it, vi } from 'vitest'
import {
  DESKDATA_NEXT_SEARCH_SELECTORS,
  DESKDATA_PEOPLE_URL,
  DeskDataNextSearchController,
  type DeskDataNextSearchLocator,
  type DeskDataNextSearchPage
} from '@/automation/deskdata/deskdata-next-search-controller'

class FakeLocator implements DeskDataNextSearchLocator {
  constructor(
    private readonly getCount: () => number,
    private readonly actions: {
      fill?: (value: string) => void
      inputValue?: () => string
      click?: () => void
    } = {}
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.getCount())
  }

  async fill(value: string): Promise<void> {
    if (!this.actions.fill) {
      throw new Error('Fill nao configurado')
    }

    this.actions.fill(value)
  }

  inputValue(): Promise<string> {
    if (!this.actions.inputValue) {
      return Promise.reject(new Error('InputValue nao configurado'))
    }

    return Promise.resolve(this.actions.inputValue())
  }

  async click(): Promise<void> {
    if (!this.actions.click) {
      throw new Error('Click nao configurado')
    }

    this.actions.click()
  }
}

interface PageOptions {
  initialUrl: string
  formAvailable: boolean
  similarQueriesVisible?: boolean
  consultPeopleLinkAvailable?: boolean
  gotoRestoresForm?: boolean
}

function createPage(options: PageOptions): {
  page: DeskDataNextSearchPage
  goto: ReturnType<typeof vi.fn>
  bringToFront: ReturnType<typeof vi.fn>
  consultPeopleClick: ReturnType<typeof vi.fn>
  getCpfValue(): string
  isFormAvailable(): boolean
  isSimilarQueriesVisible(): boolean
} {
  let currentUrl = options.initialUrl
  let formAvailable = options.formAvailable
  let similarQueriesVisible = options.similarQueriesVisible ?? false
  let cpfValue = '12345678900'

  const goto = vi.fn(async (url: string) => {
    currentUrl = url

    if (options.gotoRestoresForm ?? true) {
      formAvailable = true
      similarQueriesVisible = false
    }
  })

  const bringToFront = vi.fn(async () => undefined)

  const consultPeopleClick = vi.fn(() => {
    currentUrl = DESKDATA_PEOPLE_URL
    formAvailable = true
    similarQueriesVisible = false
  })

  const page: DeskDataNextSearchPage = {
    url: () => currentUrl,
    isClosed: () => false,
    bringToFront,
    goto,
    waitForTimeout: vi.fn(async () => undefined),
    locator: vi.fn((selector: string) => {
      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.cpfInput) {
        return new FakeLocator(() => (formAvailable ? 1 : 0), {
          fill: (value) => {
            cpfValue = value
          },
          inputValue: () => cpfValue
        })
      }

      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.searchButton) {
        return new FakeLocator(() => (formAvailable ? 1 : 0))
      }

      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.similarQueriesHeading) {
        return new FakeLocator(() => (similarQueriesVisible ? 1 : 0))
      }

      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.consultPeopleLink) {
        return new FakeLocator(() => (options.consultPeopleLinkAvailable === false ? 0 : 1), {
          click: consultPeopleClick
        })
      }

      throw new Error('Seletor inesperado: ' + selector)
    })
  }

  return {
    page,
    goto,
    bringToFront,
    consultPeopleClick,
    getCpfValue: () => cpfValue,
    isFormAvailable: () => formAvailable,
    isSimilarQueriesVisible: () => similarQueriesVisible
  }
}

describe('DeskDataNextSearchController', () => {
  it('clicks Consultar pessoas when similar queries are visible', async () => {
    const context = createPage({
      initialUrl: DESKDATA_PEOPLE_URL,
      formAvailable: false,
      similarQueriesVisible: true,
      consultPeopleLinkAvailable: true,
      gotoRestoresForm: false
    })

    const result = await new DeskDataNextSearchController().prepare(context.page)

    expect(context.consultPeopleClick).toHaveBeenCalledTimes(1)
    expect(context.goto).not.toHaveBeenCalled()
    expect(context.isSimilarQueriesVisible()).toBe(false)
    expect(context.isFormAvailable()).toBe(true)
    expect(context.getCpfValue()).toBe('')

    expect(result).toEqual({
      status: 'READY',
      pagePath: '/pessoas/',
      cpfCleared: true
    })
  })

  it('does not navigate when the clean search form is already available', async () => {
    const context = createPage({
      initialUrl: DESKDATA_PEOPLE_URL,
      formAvailable: true
    })

    await new DeskDataNextSearchController().prepare(context.page)

    expect(context.consultPeopleClick).not.toHaveBeenCalled()
    expect(context.goto).not.toHaveBeenCalled()
    expect(context.getCpfValue()).toBe('')
  })

  it('uses direct navigation when coming from a result page', async () => {
    const context = createPage({
      initialUrl: 'https://app.deskdata.com.br/pessoas/resultado/teste',
      formAvailable: false,
      gotoRestoresForm: true
    })

    await new DeskDataNextSearchController().prepare(context.page)

    expect(context.goto).toHaveBeenCalledWith(DESKDATA_PEOPLE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    })
    expect(context.consultPeopleClick).not.toHaveBeenCalled()
    expect(context.getCpfValue()).toBe('')
  })

  it('fails safely when the similar-query page has no Consultar pessoas link', async () => {
    const context = createPage({
      initialUrl: DESKDATA_PEOPLE_URL,
      formAvailable: false,
      similarQueriesVisible: true,
      consultPeopleLinkAvailable: false,
      gotoRestoresForm: false
    })

    await expect(new DeskDataNextSearchController().prepare(context.page)).rejects.toThrow(
      'O link Consultar pessoas da DeskData nao foi encontrado.'
    )

    expect(context.goto).not.toHaveBeenCalled()
  })

  it('rejects when the DeskData main tab is closed', async () => {
    const context = createPage({
      initialUrl: DESKDATA_PEOPLE_URL,
      formAvailable: true
    })

    context.page.isClosed = () => true

    await expect(new DeskDataNextSearchController().prepare(context.page)).rejects.toThrow(
      'A aba da DeskData esta fechada.'
    )
  })
})
