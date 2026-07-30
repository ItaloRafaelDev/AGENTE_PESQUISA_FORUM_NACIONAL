import { describe, expect, it, vi } from 'vitest'
import type { Page } from 'playwright'
import {
  DESKDATA_SIMILAR_QUERY_SELECTORS,
  DeskDataSearchResultPageResolver,
  type DeskDataSimilarQueryLocator,
  type DeskDataSimilarQueryPage
} from '@/automation/deskdata/deskdata-search-result-page-resolver'
import { DESKDATA_PDF_EXPORT_SELECTOR } from '@/automation/deskdata/deskdata-pdf-download-controller'

class FakeLocator implements DeskDataSimilarQueryLocator {
  clickCalls = 0
  clickTimeoutMs: number | undefined

  constructor(
    private readonly options: {
      count?: number
      children?: FakeLocator[]
      texts?: string[]
      href?: string | null
      locators?: Record<string, FakeLocator>
      onClick?: () => void
    } = {}
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.options.count ?? this.options.children?.length ?? 0)
  }

  nth(index: number): DeskDataSimilarQueryLocator {
    return this.options.children?.[index] ?? new FakeLocator()
  }

  locator(selector: string): DeskDataSimilarQueryLocator {
    return this.options.locators?.[selector] ?? new FakeLocator()
  }

  allTextContents(): Promise<string[]> {
    return Promise.resolve(this.options.texts ?? [])
  }

  getAttribute(name: string): Promise<string | null> {
    return Promise.resolve(name === 'href' ? (this.options.href ?? null) : null)
  }

  async click(options?: { timeout?: number }): Promise<void> {
    this.clickCalls += 1
    this.clickTimeoutMs = options?.timeout
    this.options.onClick?.()
  }
}

class FakePage implements DeskDataSimilarQueryPage {
  public waitCalls = 0
  public loadCalls = 0
  public closeCalls = 0
  public readonly waitDurations: number[] = []
  public popupTimeoutMs: number | undefined
  public loadTimeoutMs: number | undefined

  constructor(
    private currentUrl: string,
    private readonly locators: Record<string, FakeLocator>,
    private readonly popup?: FakePage,
    private readonly onWaitForTimeout?: () => void
  ) {}

  setUrl(value: string): void {
    this.currentUrl = value
  }

  url(): string {
    return this.currentUrl
  }

  locator(selector: string): DeskDataSimilarQueryLocator {
    return this.locators[selector] ?? new FakeLocator()
  }

  async waitForTimeout(milliseconds: number): Promise<void> {
    this.waitCalls += 1
    this.waitDurations.push(milliseconds)
    this.onWaitForTimeout?.()
  }

  waitForEvent(
    event: 'popup',
    options?: {
      timeout?: number
    }
  ): Promise<DeskDataSimilarQueryPage> {
    this.popupTimeoutMs = options?.timeout

    if (event !== 'popup' || !this.popup) {
      return Promise.reject(new Error('Popup nao configurado'))
    }

    return Promise.resolve(this.popup)
  }

  async waitForLoadState(
    _state: 'domcontentloaded',
    options?: {
      timeout?: number
    }
  ): Promise<void> {
    this.loadCalls += 1
    this.loadTimeoutMs = options?.timeout
  }

  isClosed(): boolean {
    return this.closeCalls > 0
  }

  async close(): Promise<void> {
    this.closeCalls += 1
  }
}

function row(
  date: string,
  cpf: string,
  datasets: string,
  href: string,
  onClick?: () => void
): FakeLocator {
  return new FakeLocator({
    locators: {
      td: new FakeLocator({
        texts: [date, 'Q-TESTE', `CPF: ${cpf}`, datasets, 'Ver']
      }),
      [DESKDATA_SIMILAR_QUERY_SELECTORS.historyLink]: new FakeLocator({
        count: 1,
        href,
        onClick
      })
    }
  })
}

const SIX_DATASETS = [
  'Dados basicos',
  'E-mails',
  'Enderecos',
  'Telefones',
  'Emprego',
  'Processos'
].join('\n')

describe('DeskDataSearchResultPageResolver', () => {
  it('keeps the main page when the normal result is ready', async () => {
    const page = new FakePage('https://app.deskdata.com.br/pessoas/resultado/abc', {
      [DESKDATA_PDF_EXPORT_SELECTOR]: new FakeLocator({ count: 1 }),
      [DESKDATA_SIMILAR_QUERY_SELECTORS.rows]: new FakeLocator({
        count: 0
      })
    })

    await expect(
      new DeskDataSearchResultPageResolver({
        searchAttempts: 1,
        searchIntervalMs: 0
      }).resolve(page as unknown as Page, '12345678901')
    ).resolves.toEqual({
      source: 'DIRECT_RESULT',
      page,
      resultPath: '/pessoas/resultado/abc',
      closeAfterConfirmedSave: false
    })
  })

  it('selects the latest matching query and captures the popup opened by Ver', async () => {
    const popup = new FakePage('https://deskdata.com.br/historico/detalhes?q=Q-MAIS-NOVA', {})

    const oldLinkClick = vi.fn()
    const incompleteLinkClick = vi.fn()
    const latestLinkClick = vi.fn()

    const rows = new FakeLocator({
      children: [
        row(
          '16/07/2026 10:20',
          '123.456.789-01',
          SIX_DATASETS,
          'https://deskdata.com.br/historico/detalhes?q=Q-ANTIGA',
          oldLinkClick
        ),
        row(
          '16/07/2026 11:25',
          '123.456.789-01',
          'Dados basicos\nProcessos',
          'https://deskdata.com.br/historico/detalhes?q=Q-INCOMPLETA',
          incompleteLinkClick
        ),
        row(
          '16/07/2026 11:29',
          '123.456.789-01',
          SIX_DATASETS,
          'https://deskdata.com.br/historico/detalhes?q=Q-MAIS-NOVA',
          latestLinkClick
        )
      ]
    })

    const page = new FakePage(
      'https://app.deskdata.com.br/pessoas/',
      {
        [DESKDATA_PDF_EXPORT_SELECTOR]: new FakeLocator({ count: 0 }),
        [DESKDATA_SIMILAR_QUERY_SELECTORS.rows]: rows
      },
      popup
    )

    const result = await new DeskDataSearchResultPageResolver({
      searchAttempts: 1,
      searchIntervalMs: 0,
      navigationTimeoutMs: 31_234,
      actionTimeoutMs: 12_345
    }).resolve(page as unknown as Page, '12345678901')

    expect(result).toEqual({
      source: 'SIMILAR_QUERY',
      page: popup,
      resultPath: '/historico/detalhes',
      closeAfterConfirmedSave: true
    })

    expect(oldLinkClick).not.toHaveBeenCalled()
    expect(incompleteLinkClick).not.toHaveBeenCalled()
    expect(latestLinkClick).toHaveBeenCalledTimes(1)
    expect(page.popupTimeoutMs).toBe(31_234)
    expect(popup.loadTimeoutMs).toBe(31_234)
    expect(
      (rows.nth(2).locator(DESKDATA_SIMILAR_QUERY_SELECTORS.historyLink) as FakeLocator)
        .clickTimeoutMs
    ).toBe(12_345)
  })

  it('waits for delayed popup navigation and accepts a trailing slash', async () => {
    let popupWaits = 0

    const popup = new FakePage('about:blank', {}, undefined, () => {
      popupWaits += 1

      if (popupWaits === 2) {
        popup.setUrl('https://deskdata.com.br/historico/detalhes/?q=Q-ATRASADA')
      }
    })

    const rows = new FakeLocator({
      children: [
        row(
          '17/07/2026 12:08',
          '058.688.984-19',
          SIX_DATASETS,
          'https://deskdata.com.br/historico/detalhes?q=Q-ATRASADA'
        )
      ]
    })

    const page = new FakePage(
      'https://app.deskdata.com.br/pessoas/',
      {
        [DESKDATA_PDF_EXPORT_SELECTOR]: new FakeLocator({ count: 0 }),
        [DESKDATA_SIMILAR_QUERY_SELECTORS.rows]: rows
      },
      popup
    )

    const result = await new DeskDataSearchResultPageResolver({
      searchAttempts: 1,
      searchIntervalMs: 0,
      historyNavigationAttempts: 4,
      historyNavigationIntervalMs: 0
    }).resolve(page as unknown as Page, '05868898419')

    expect(result).toEqual({
      source: 'SIMILAR_QUERY',
      page: popup,
      resultPath: '/historico/detalhes/',
      closeAfterConfirmedSave: true
    })

    expect(popupWaits).toBe(2)
  })

  it('rejects another CPF or incomplete datasets', async () => {
    const rows = new FakeLocator({
      children: [
        row(
          '16/07/2026 11:29',
          '999.999.999-99',
          SIX_DATASETS,
          'https://deskdata.com.br/historico/detalhes?q=Q-OUTRO'
        ),
        row(
          '16/07/2026 11:30',
          '123.456.789-01',
          'Dados basicos\nProcessos',
          'https://deskdata.com.br/historico/detalhes?q=Q-INCOMPLETA'
        )
      ]
    })

    const page = new FakePage('https://app.deskdata.com.br/pessoas/', {
      [DESKDATA_PDF_EXPORT_SELECTOR]: new FakeLocator({ count: 0 }),
      [DESKDATA_SIMILAR_QUERY_SELECTORS.rows]: rows
    })

    await expect(
      new DeskDataSearchResultPageResolver({
        searchAttempts: 1,
        searchIntervalMs: 0
      }).resolve(page as unknown as Page, '12345678901')
    ).rejects.toThrow('Nenhuma consulta semelhante compativel')
  })
})
