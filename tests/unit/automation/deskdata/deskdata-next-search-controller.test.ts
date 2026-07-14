import { describe, expect, it, vi } from 'vitest'
import {
  DESKDATA_NEXT_SEARCH_SELECTORS,
  DESKDATA_PEOPLE_URL,
  DeskDataNextSearchController,
  type DeskDataNextSearchPage
} from '@/automation/deskdata/deskdata-next-search-controller'

interface TestPageContext {
  page: DeskDataNextSearchPage
  goto: ReturnType<typeof vi.fn>
  bringToFront: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  getUrl(): string
  getCpfValue(): string
}

function createPage(initialUrl: string, formControlCount = 1): TestPageContext {
  let currentUrl = initialUrl
  let cpfValue = '12345678900'

  const goto = vi.fn(async (url: string) => {
    currentUrl = url
  })

  const bringToFront = vi.fn(async () => undefined)

  const fill = vi.fn(async (value: string) => {
    cpfValue = value
  })

  const page: DeskDataNextSearchPage = {
    url: () => currentUrl,
    isClosed: () => false,
    bringToFront,
    goto,
    locator: vi.fn((selector: string) => {
      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.cpfInput) {
        return {
          count: async () => formControlCount,
          fill,
          inputValue: async () => cpfValue
        }
      }

      if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.searchButton) {
        return {
          count: async () => formControlCount
        }
      }

      throw new Error('Seletor inesperado: ' + selector)
    })
  }

  return {
    page,
    goto,
    bringToFront,
    fill,
    getUrl: () => currentUrl,
    getCpfValue: () => cpfValue
  }
}

describe('DeskDataNextSearchController', () => {
  it('deve voltar do resultado para Consultar pessoas', async () => {
    const context = createPage('https://deskdata.com.br/pessoas/resultado/teste')

    const result = await new DeskDataNextSearchController().prepare(context.page)

    expect(context.goto).toHaveBeenCalledTimes(1)
    expect(context.goto).toHaveBeenCalledWith(DESKDATA_PEOPLE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000
    })
    expect(context.fill).toHaveBeenCalledWith('', {
      timeout: 10_000
    })
    expect(context.getCpfValue()).toBe('')
    expect(result).toEqual({
      status: 'READY',
      pagePath: '/pessoas/',
      cpfCleared: true
    })
  })

  it('não deve navegar quando já estiver na página de consulta', async () => {
    const context = createPage(DESKDATA_PEOPLE_URL)

    await new DeskDataNextSearchController().prepare(context.page)

    expect(context.goto).not.toHaveBeenCalled()
    expect(context.bringToFront).toHaveBeenCalledTimes(1)
    expect(context.getCpfValue()).toBe('')
  })

  it('deve rejeitar quando o formulário não estiver disponível', async () => {
    const context = createPage('https://deskdata.com.br/pessoas/resultado/teste', 0)

    await expect(new DeskDataNextSearchController().prepare(context.page)).rejects.toThrow(
      'O formulário Consultar pessoas da DeskData não ficou disponível.'
    )

    expect(context.fill).not.toHaveBeenCalled()
  })

  it('deve rejeitar quando a aba estiver fechada', async () => {
    const context = createPage(DESKDATA_PEOPLE_URL)

    context.page.isClosed = () => true

    await expect(new DeskDataNextSearchController().prepare(context.page)).rejects.toThrow(
      'A aba da DeskData está fechada.'
    )
  })
})
