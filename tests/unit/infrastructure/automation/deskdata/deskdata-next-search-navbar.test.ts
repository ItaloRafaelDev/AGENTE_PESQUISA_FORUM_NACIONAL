import { describe, expect, it, vi } from 'vitest'
import { DESKDATA_NEXT_SEARCH_SELECTORS } from '@/infrastructure/automation/deskdata/deskdata-selectors'
import {
  DESKDATA_PEOPLE_URL,
  DeskDataNextSearchController,
  type DeskDataNextSearchLocator,
  type DeskDataNextSearchPage
} from '@/infrastructure/automation/deskdata/deskdata-next-search-controller'

const APP_NAVBAR_SELECTOR =
  'a[href="https://app.deskdata.com.br/pessoas/"]:visible, a[href="https://app.deskdata.com.br/pessoas"]:visible'

class FakeLocator implements DeskDataNextSearchLocator {
  constructor(
    private readonly getCount: () => number,
    private readonly actions: {
      fill?: (value: string) => void
      inputValue?: () => string
      click?: () => void
      selectOption?: (value: string) => void
    } = {}
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.getCount())
  }

  async fill(value: string): Promise<void> {
    this.actions.fill?.(value)
  }

  inputValue(): Promise<string> {
    return Promise.resolve(this.actions.inputValue?.() ?? '')
  }

  async click(): Promise<void> {
    this.actions.click?.()
  }

  async selectOption(value: string): Promise<string[]> {
    this.actions.selectOption?.(value)
    return [value]
  }
}

describe('DeskDataNextSearchController navbar app', () => {
  it('uses the visible Consultar pessoas link from app.deskdata.com.br', () => {
    expect(DESKDATA_NEXT_SEARCH_SELECTORS.consultPeopleLink).toBe(APP_NAVBAR_SELECTOR)
  })

  it('clicks Consultar pessoas and confirms the clean form', async () => {
    let formAvailable = false
    let similarQueriesVisible = true
    let cpfValue = '23559839840'
    let primaryKey = 'cpf'

    const clickNavbar = vi.fn(() => {
      formAvailable = true
      similarQueriesVisible = false
    })

    const page: DeskDataNextSearchPage = {
      url: () => DESKDATA_PEOPLE_URL,
      isClosed: () => false,
      bringToFront: vi.fn(async () => undefined),
      goto: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined),

      locator: vi.fn((selector: string) => {
        if (selector === DESKDATA_NEXT_SEARCH_SELECTORS.primaryKey) {
          return new FakeLocator(() => (formAvailable ? 1 : 0), {
            selectOption: (value) => {
              primaryKey = value
            },
            inputValue: () => primaryKey
          })
        }

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

        if (selector === APP_NAVBAR_SELECTOR) {
          return new FakeLocator(() => 1, {
            click: clickNavbar
          })
        }

        return new FakeLocator(() => 0)
      })
    }

    await expect(new DeskDataNextSearchController().prepare(page)).resolves.toEqual({
      status: 'READY',
      pagePath: '/pessoas/',
      cpfCleared: true
    })

    expect(clickNavbar).toHaveBeenCalledTimes(1)
    expect(cpfValue).toBe('')
  })
})
