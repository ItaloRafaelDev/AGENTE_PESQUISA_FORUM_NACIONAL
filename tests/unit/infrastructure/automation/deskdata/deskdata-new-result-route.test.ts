import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKDATA_PDF_EXPORT_SELECTOR,
  DESKDATA_PROCESSES_SECTION_SELECTOR,
  DESKDATA_PROCESSES_UPDATED_SELECTOR,
  DESKDATA_SIMILAR_QUERY_SELECTORS
} from '@/infrastructure/automation/deskdata/deskdata-selectors'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '@/infrastructure/automation/deskdata/deskdata-result-ready-waiter'
import {
  DeskDataSearchResultPageResolver,
  type DeskDataSimilarQueryLocator,
  type DeskDataSimilarQueryPage
} from '@/infrastructure/automation/deskdata/deskdata-search-result-page-resolver'

class FakeLocator implements DeskDataSimilarQueryLocator {
  constructor(
    private readonly value: number,
    private readonly content: string | null = null
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.value)
  }

  nth(): DeskDataSimilarQueryLocator {
    return this
  }

  locator(): DeskDataSimilarQueryLocator {
    return this
  }

  allTextContents(): Promise<string[]> {
    return Promise.resolve([])
  }

  textContent(): Promise<string | null> {
    return Promise.resolve(this.content)
  }

  getAttribute(): Promise<string | null> {
    return Promise.resolve(null)
  }

  click(): Promise<void> {
    return Promise.resolve()
  }
}

function createNewResultPage(): DeskDataSimilarQueryPage {
  return {
    url: () => 'https://app.deskdata.com.br/pessoas/resultado/?q=Q-7E20026628',

    locator: (selector: string) => {
      if (selector === DESKDATA_PDF_EXPORT_SELECTOR) {
        return new FakeLocator(1)
      }

      if (selector === DESKDATA_PROCESSES_SECTION_SELECTOR) {
        return new FakeLocator(1, 'Processos 1000878-26.2017.5.02.0067')
      }

      if (selector === DESKDATA_PROCESSES_UPDATED_SELECTOR) {
        return new FakeLocator(1)
      }

      if (selector === DESKDATA_SIMILAR_QUERY_SELECTORS.rows) {
        return new FakeLocator(0)
      }

      return new FakeLocator(0)
    },

    waitForTimeout: vi.fn(async () => undefined),

    waitForEvent: vi.fn(async () => {
      throw new Error('Popup nao esperado para pesquisa nova')
    }),

    waitForLoadState: vi.fn(async () => undefined),

    isClosed: () => false,

    close: vi.fn(async () => undefined)
  }
}

describe('DeskData new-result route regression', () => {
  it('resolves /pessoas/resultado/?q=... as a direct result', async () => {
    const page = createNewResultPage()

    await expect(
      new DeskDataSearchResultPageResolver({
        searchAttempts: 1,
        searchIntervalMs: 0
      }).resolve(page, '00586104569')
    ).resolves.toEqual({
      source: 'DIRECT_RESULT',
      page: page as Page,
      resultPath: '/pessoas/resultado/',
      closeAfterConfirmedSave: false
    })
  })

  it('accepts /pessoas/resultado/?q=... as ready for PDF download', async () => {
    const page = createNewResultPage()

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 1,
        searchIntervalMs: 0,
        settledContentChecks: 1
      }).waitUntilReady(page as DeskDataResultReadyPage)
    ).resolves.toEqual({
      status: 'READY',
      resultPath: '/pessoas/resultado/'
    })
  })
})
