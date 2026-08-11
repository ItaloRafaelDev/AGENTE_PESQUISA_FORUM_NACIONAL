import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Locator, type Page } from 'playwright'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/infrastructure/automation/cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../src/infrastructure/automation/cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  NodeQueueDelay
} from '../src/infrastructure/automation/cpi/cpi-queue-monitor'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

interface RawElement {
  tag: string
  id: string
  name: string
  type: string
  className: string
  title: string
  role: string
  href: string
  onclick: string
  target: string
  text: string
  value: string
}

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => page.url().includes('adm.cpicentral.com.br'))
}

function sanitizeUrl(value: string): string {
  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)

    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

function sanitizeText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  const safeLabels = /^(abrir|alterar|consultar|detalhes|editar|responder|selecionar|visualizar)$/i

  if (safeLabels.test(normalized)) {
    return normalized
  }

  return `[conteúdo ocultado: ${normalized.length} caracteres]`
}

function sanitizeAttribute(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  if (normalized.includes('@') || /\d{3,}/.test(normalized)) {
    return '[ocultado]'
  }

  return normalized.slice(0, 120)
}

function sanitizeJavascript(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized) {
    return ''
  }

  return normalized
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email ocultado]')
    .replace(/\b\d{3,}\b/g, '[numero ocultado]')
    .slice(0, 240)
}
async function findCandidateRows(page: Page): Promise<Locator[]> {
  const result: Locator[] = []

  for (const frame of page.frames()) {
    const rows = frame.locator('tr, div.row')

    const rowCount = await rows.count().catch(() => 0)

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex)

      const tableCellCount = await row
        .locator(':scope > td')
        .count()
        .catch(() => 0)

      const gridCellCount = await row
        .locator(':scope > div[class*="cell"]')
        .count()
        .catch(() => 0)

      const cellCount = tableCellCount + gridCellCount

      const checkboxCount = await row
        .locator('input[type="checkbox"]')
        .count()
        .catch(() => 0)

      const actionCount = await row
        .locator(
          [
            'a',
            'button',
            'input[type="button"]',
            'input[type="submit"]',
            '[role="button"]',
            'i[title]'
          ].join(',')
        )
        .count()
        .catch(() => 0)

      const isResearchRow = cellCount >= 6 && checkboxCount > 0 && actionCount > 0

      if (isResearchRow) {
        result.push(row)
      }
    }
  }

  return result
}

async function inspectRow(row: Locator): Promise<Record<string, unknown>> {
  const tableCells = row.locator(':scope > td')

  const gridCells = row.locator(':scope > div[class*="cell"]')

  const tableCellCount = await tableCells.count()

  const cells = tableCellCount > 0 ? tableCells : gridCells

  const cellCount = await cells.count()

  const cellSummary: Array<Record<string, unknown>> = []

  for (let index = 0; index < cellCount; index += 1) {
    const cell = cells.nth(index)

    cellSummary.push({
      index,

      className: (await cell.getAttribute('class')) ?? '',

      interactiveCount: await cell
        .locator(['a', 'button', 'input', '[role="button"]', 'i[title]'].join(','))
        .count(),

      textLength: (await cell.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().length
    })
  }

  const rawElements = await row
    .locator(['a', 'button', 'input', '[role="button"]', 'i', 'img'].join(','))
    .evaluateAll((elements): RawElement[] =>
      elements.map((element) => {
        const htmlElement = element as HTMLElement

        const inputElement = element as HTMLInputElement

        const anchorElement = element as HTMLAnchorElement

        return {
          tag: element.tagName.toLowerCase(),

          id: htmlElement.id ?? '',

          name: inputElement.name ?? '',

          type: inputElement.type ?? '',

          className: typeof htmlElement.className === 'string' ? htmlElement.className : '',

          title: htmlElement.getAttribute('title') ?? '',

          role: htmlElement.getAttribute('role') ?? '',

          href: anchorElement.href ?? '',

          onclick: htmlElement.getAttribute('onclick') ?? '',

          target: anchorElement.target ?? '',

          text: htmlElement.innerText ?? htmlElement.textContent ?? '',

          value: inputElement.value ?? ''
        }
      })
    )

  const controls = rawElements.map((element) => ({
    tag: element.tag,

    id: sanitizeAttribute(element.id),

    name: sanitizeAttribute(element.name),

    type: element.type,

    className: element.className,

    title: sanitizeAttribute(element.title),

    role: element.role,

    hrefPath: sanitizeUrl(element.href),

    onclick: sanitizeJavascript(element.onclick),

    target: element.target,

    text: sanitizeText(element.text),

    value:
      element.type === 'button' || element.type === 'submit'
        ? sanitizeText(element.value)
        : element.value
          ? '[ocultado]'
          : ''
  }))

  return {
    structure: tableCellCount > 0 ? 'TABLE_ROW' : 'DIV_GRID_ROW',

    tag: await row.evaluate((element) => element.tagName.toLowerCase()),

    id: (await row.getAttribute('id')) ?? '',

    className: (await row.getAttribute('class')) ?? '',

    cellCount,
    cells: cellSummary,
    controls
  }
}

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const abortController = new AbortController()

  const handleSigint = (): void => {
    console.log('\nParada solicitada.')

    abortController.abort()
  }

  process.once('SIGINT', handleSigint)

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  try {
    const pageManager = new PlatformPageManager(
      config.platform,
      config.timing.platformPageNavigationTimeoutMs
    )

    await pageManager.ensurePages(context)

    let cpiPage = findCpiPage(context.pages())

    if (!cpiPage) {
      throw new Error('A aba da CPI Central não foi localizada.')
    }

    if (!cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      await terminal.question(
        'Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...'
      )

      cpiPage = findCpiPage(context.pages())
    }

    if (!cpiPage || !cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
    }

    await cpiPage.bringToFront()

    const filterController = new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    })

    const availabilityReader = new CpiQueueAvailabilityReader(config.timing.readTimeoutMs)

    const monitor = new CpiQueueMonitor(
      filterController,
      availabilityReader,
      new NodeQueueDelay(),
      config.timing.queueCheckIntervalMs
    )

    console.log('Aplicando filtro 29...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando uma pesquisa disponível.')

    const monitorResult = await monitor.waitForResearch(cpiPage, {
      signal: abortController.signal,

      onState: (state, checks) => {
        const time = new Date().toLocaleTimeString('pt-BR')

        console.log(`[${time}] Verificação ${checks}: ${state}`)
      }
    })

    if (monitorResult.status === 'PAUSED') {
      console.log('Inspeção interrompida.')

      return
    }

    console.log('Pesquisa detectada. Inspecionando somente a primeira linha...')

    const candidateRows = await findCandidateRows(cpiPage)

    if (candidateRows.length === 0) {
      throw new Error('Nenhuma linha interativa de pesquisa foi encontrada.')
    }

    const report = {
      platform: 'CPI Central',
      pageUrl: sanitizeUrl(cpiPage.url()),
      candidateRowCount: candidateRows.length,
      firstRow: await inspectRow(candidateRows[0])
    }

    console.dir(report, {
      depth: null,
      colors: true
    })

    console.log('Nenhuma pesquisa foi aberta ou alterada.')

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } catch (error: unknown) {
    console.error('Falha ao inspecionar a primeira pesquisa:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', handleSigint)

    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
