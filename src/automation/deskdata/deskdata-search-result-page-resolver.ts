import type { Page } from 'playwright'
import { DESKDATA_PDF_EXPORT_SELECTOR } from './deskdata-pdf-download-controller'

export const DESKDATA_SIMILAR_QUERY_SELECTORS = {
  rows: 'table tbody tr:has(a[href*="/historico/detalhes"])',
  historyLink: 'a[href*="/historico/detalhes"]'
} as const

const EXPECTED_DATASET_LABELS = [
  'dados basicos',
  'e-mails',
  'enderecos',
  'telefones',
  'emprego',
  'processos'
] as const

export interface DeskDataSimilarQueryLocator {
  count(): Promise<number>
  nth(index: number): DeskDataSimilarQueryLocator
  locator(selector: string): DeskDataSimilarQueryLocator
  allTextContents(): Promise<string[]>
  getAttribute(name: string): Promise<string | null>
  click(options?: { timeout?: number }): Promise<void>
}

export interface DeskDataSimilarQueryPage {
  url(): string
  locator(selector: string): DeskDataSimilarQueryLocator
  waitForTimeout(milliseconds: number): Promise<void>
  waitForEvent(
    event: 'popup',
    options?: {
      timeout?: number
    }
  ): Promise<DeskDataSimilarQueryPage>
  waitForLoadState(
    state: 'domcontentloaded',
    options?: {
      timeout?: number
    }
  ): Promise<void>
  isClosed(): boolean
  close(options?: { runBeforeUnload?: boolean }): Promise<void>
}

export interface DeskDataSearchResultPageResolverOptions {
  searchAttempts?: number
  searchIntervalMs?: number
  popupTimeoutMs?: number
  historyNavigationAttempts?: number
  historyNavigationIntervalMs?: number
}

export type DeskDataResolvedResultSource = 'DIRECT_RESULT' | 'SIMILAR_QUERY'

export interface DeskDataResolvedResultPage {
  source: DeskDataResolvedResultSource
  page: Page
  resultPath: string
  closeAfterConfirmedSave: boolean
}

type SimilarQueryCandidate = {
  rowIndex: number
  timestamp: number
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '')
}

function extractPath(pageUrl: string): string {
  try {
    return new URL(pageUrl).pathname
  } catch {
    return ''
  }
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')

  return normalized || '/'
}

function parseBrazilianDateTime(value: string): number | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/)

  if (!match) {
    return null
  }

  const [, day, month, year, hour, minute] = match

  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  )

  return Number.isFinite(timestamp) ? timestamp : null
}

function containsApprovedDatasets(value: string): boolean {
  const normalized = normalizeText(value)

  return EXPECTED_DATASET_LABELS.every((label) => normalized.includes(label))
}

function isDeskDataHistoryUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://app.deskdata.com.br')

    return (
      (url.hostname === 'deskdata.com.br' || url.hostname.endsWith('.deskdata.com.br')) &&
      normalizePath(url.pathname) === '/historico/detalhes' &&
      Boolean(url.searchParams.get('q'))
    )
  } catch {
    return false
  }
}

function isDirectResultReady(pageUrl: string, exportCount: number): boolean {
  const resultPath = extractPath(pageUrl).replace(/\/+$/, '')

  return (
    (resultPath === '/pessoas/resultado' || resultPath.startsWith('/pessoas/resultado/')) &&
    exportCount === 1
  )
}

export class DeskDataSearchResultPageResolver {
  private readonly searchAttempts: number
  private readonly searchIntervalMs: number
  private readonly popupTimeoutMs: number
  private readonly historyNavigationAttempts: number
  private readonly historyNavigationIntervalMs: number

  constructor(options: DeskDataSearchResultPageResolverOptions = {}) {
    this.searchAttempts = options.searchAttempts ?? 180
    this.searchIntervalMs = options.searchIntervalMs ?? 500
    this.popupTimeoutMs = options.popupTimeoutMs ?? 30_000
    this.historyNavigationAttempts = options.historyNavigationAttempts ?? 120
    this.historyNavigationIntervalMs = options.historyNavigationIntervalMs ?? 250

    if (
      this.searchAttempts < 1 ||
      this.searchIntervalMs < 0 ||
      this.popupTimeoutMs < 1 ||
      this.historyNavigationAttempts < 1 ||
      this.historyNavigationIntervalMs < 0
    ) {
      throw new Error('As configuracoes de espera do resolvedor sao invalidas.')
    }
  }

  async resolve(page: DeskDataSimilarQueryPage, cpf: string): Promise<DeskDataResolvedResultPage> {
    const normalizedCpf = normalizeCpf(cpf)

    if (normalizedCpf.length !== 11) {
      throw new Error('O CPF informado ao resolvedor da DeskData e invalido.')
    }

    for (let attempt = 0; attempt < this.searchAttempts; attempt += 1) {
      const exportCount = await page
        .locator(DESKDATA_PDF_EXPORT_SELECTOR)
        .count()
        .catch(() => 0)

      if (exportCount > 1) {
        throw new Error(
          'O botao Exportar deveria possuir exatamente um controle. Encontrados: ' + exportCount
        )
      }

      if (isDirectResultReady(page.url(), exportCount)) {
        return {
          source: 'DIRECT_RESULT',
          page: page as Page,
          resultPath: extractPath(page.url()),
          closeAfterConfirmedSave: false
        }
      }

      const rows = page.locator(DESKDATA_SIMILAR_QUERY_SELECTORS.rows)
      const rowCount = await rows.count().catch(() => 0)

      if (rowCount > 0) {
        return this.openLatestMatchingQuery(page, rows, rowCount, normalizedCpf)
      }

      if (attempt < this.searchAttempts - 1) {
        await page.waitForTimeout(this.searchIntervalMs)
      }
    }

    throw new Error(
      'A DeskData nao apresentou resultado normal nem consultas semelhantes dentro do tempo limite.'
    )
  }

  private async waitForHistoryNavigation(popup: DeskDataSimilarQueryPage): Promise<void> {
    for (let attempt = 0; attempt < this.historyNavigationAttempts; attempt += 1) {
      if (isDeskDataHistoryUrl(popup.url())) {
        return
      }

      if (popup.isClosed()) {
        throw new Error('A aba aberta pelo botao Ver foi fechada antes de carregar o historico.')
      }

      if (attempt < this.historyNavigationAttempts - 1) {
        await popup.waitForTimeout(this.historyNavigationIntervalMs)
      }
    }

    if (!popup.isClosed()) {
      await popup.close({
        runBeforeUnload: false
      })
    }

    throw new Error(
      'A aba aberta pelo botao Ver nao carregou o historico da DeskData dentro do tempo limite.'
    )
  }

  private async openLatestMatchingQuery(
    page: DeskDataSimilarQueryPage,
    rows: DeskDataSimilarQueryLocator,
    rowCount: number,
    normalizedCpf: string
  ): Promise<DeskDataResolvedResultPage> {
    const candidates: SimilarQueryCandidate[] = []

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex)
      const cells = await row.locator('td').allTextContents()

      if (cells.length < 5) {
        continue
      }

      if (normalizeCpf(cells[2]) !== normalizedCpf) {
        continue
      }

      if (!containsApprovedDatasets(cells[3])) {
        continue
      }

      const timestamp = parseBrazilianDateTime(cells[0])

      if (timestamp === null) {
        continue
      }

      const link = row.locator(DESKDATA_SIMILAR_QUERY_SELECTORS.historyLink)

      if ((await link.count()) !== 1) {
        continue
      }

      const href = await link.getAttribute('href')

      if (!href || !isDeskDataHistoryUrl(href)) {
        continue
      }

      candidates.push({
        rowIndex,
        timestamp
      })
    }

    const selected = candidates.sort((left, right) => {
      if (right.timestamp !== left.timestamp) {
        return right.timestamp - left.timestamp
      }

      return left.rowIndex - right.rowIndex
    })[0]

    if (!selected) {
      throw new Error(
        'Nenhuma consulta semelhante compativel com o CPF e os seis conjuntos foi encontrada.'
      )
    }

    const selectedRow = rows.nth(selected.rowIndex)
    const selectedLink = selectedRow.locator(DESKDATA_SIMILAR_QUERY_SELECTORS.historyLink)

    const popupPromise = page.waitForEvent('popup', {
      timeout: this.popupTimeoutMs
    })

    await selectedLink.click({
      timeout: 10_000
    })

    const popup = await popupPromise

    await popup
      .waitForLoadState('domcontentloaded', {
        timeout: 30_000
      })
      .catch(() => undefined)

    await this.waitForHistoryNavigation(popup)

    return {
      source: 'SIMILAR_QUERY',
      page: popup as Page,
      resultPath: extractPath(popup.url()),
      closeAfterConfirmedSave: true
    }
  }
}
