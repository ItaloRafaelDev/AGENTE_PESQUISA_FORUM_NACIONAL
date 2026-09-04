import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { CpiResearchIdentityReader } from '../src/infrastructure/automation/cpi/cpi-research-identity-reader'
import { DeskDataCpfFormController } from '../src/infrastructure/automation/deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../src/infrastructure/automation/deskdata/deskdata-dataset-controller'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '../src/infrastructure/automation/deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchSubmitController } from '../src/infrastructure/automation/deskdata/deskdata-search-submit-controller'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

const diagnosticLines: string[] = []

function recordDiagnostic(label: string, value: unknown): void {
  const line = new Date().toISOString() + ' ' + label + ' ' + JSON.stringify(value)

  diagnosticLines.push(line)
  console.log(label, JSON.stringify(value))
}

function serializeError(error: unknown, depth = 0): unknown {
  if (depth >= 5) {
    return '[CAUSE_LIMIT]'
  }

  if (!(error instanceof Error)) {
    return sanitizeDiagnosticText(String(error))
  }

  const errorWithCause = error as Error & {
    cause?: unknown
  }

  return {
    name: error.name,
    message: sanitizeDiagnosticText(error.message),
    stack: sanitizeDiagnosticText(error.stack ?? ''),
    cause:
      errorWithCause.cause === undefined
        ? undefined
        : serializeError(errorWithCause.cause, depth + 1)
  }
}

async function saveDiagnosticReport(error: unknown): Promise<string> {
  const outputDirectory = join(process.cwd(), 'data', 'runtime', 'logs')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = join(outputDirectory, 'deskdata-readiness-' + timestamp + '.txt')
  const report = [
    'Diagnóstico sanitizado da espera da DeskData',
    'Gerado em: ' + new Date().toISOString(),
    'Resultado: ' + (error === undefined ? 'READY' : 'ERROR'),
    '',
    ...diagnosticLines,
    '',
    'Erro técnico:',
    JSON.stringify(serializeError(error), null, 2)
  ].join('\r\n')

  await mkdir(outputDirectory, {
    recursive: true
  })
  await writeFile(filePath, report, 'utf8')

  return filePath
}

function findPage(pages: Page[], hostname: string): Page | undefined {
  return pages.find((page) => {
    try {
      const pageHostname = new URL(page.url()).hostname

      return pageHostname === hostname || pageHostname.endsWith(`.${hostname}`)
    } catch {
      return false
    }
  })
}

function isCpiQueuePage(page: Page): boolean {
  try {
    return new URL(page.url()).pathname
      .toLowerCase()
      .endsWith('/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx')
  } catch {
    return false
  }
}

function isDeskDataPeoplePage(page: Page): boolean {
  try {
    const pathname = new URL(page.url()).pathname.toLowerCase()

    return pathname === '/pessoas' || pathname.startsWith('/pessoas/')
  } catch {
    return false
  }
}

function safePath(value: string): string {
  try {
    const url = new URL(value)

    return url.origin + url.pathname
  } catch {
    return '[URL_INVALIDA]'
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value.replace(/\d/g, '#').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function attachDeskDataDiagnostics(page: Page): void {
  const startedAt = Date.now()
  const elapsed = (): number => Date.now() - startedAt

  page.on('close', () => {
    recordDiagnostic('[DeskData evento]', { elapsedMs: elapsed(), type: 'page-close' })
  })
  page.on('crash', () => {
    recordDiagnostic('[DeskData evento]', { elapsedMs: elapsed(), type: 'page-crash' })
  })
  page.on('pageerror', (error) => {
    recordDiagnostic('[DeskData evento]', {
      elapsedMs: elapsed(),
      type: 'page-error',
      message: sanitizeDiagnosticText(error.message)
    })
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      recordDiagnostic('[DeskData evento]', {
        elapsedMs: elapsed(),
        type: 'navigation',
        path: safePath(frame.url())
      })
    }
  })
  page.on('requestfailed', (request) => {
    recordDiagnostic('[DeskData evento]', {
      elapsedMs: elapsed(),
      type: 'request-failed',
      method: request.method(),
      path: safePath(request.url()),
      failure: sanitizeDiagnosticText(request.failure()?.errorText ?? '')
    })
  })
}

function createDiagnosticResultPage(page: Page): {
  resultPage: DeskDataResultReadyPage
  capture(): Promise<void>
} {
  let previousSnapshot = ''

  const capture = async (): Promise<void> => {
    if (page.isClosed()) {
      const closedSnapshot = JSON.stringify({ state: 'CLOSED' })

      if (closedSnapshot !== previousSnapshot) {
        previousSnapshot = closedSnapshot
        recordDiagnostic('[DeskData DOM]', { state: 'CLOSED' })
      }

      return
    }

    const processes = page.locator('#processes')
    const processesCount = await processes.count().catch(() => -1)
    const processElements = await processes
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)

          return {
            text: element.textContent ?? '',
            innerText: element instanceof HTMLElement ? element.innerText : '',
            visible:
              bounds.width > 0 &&
              bounds.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden',
            display: style.display,
            visibility: style.visibility,
            ariaHidden: element.getAttribute('aria-hidden') ?? '',
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            childCount: element.children.length,
            html: element.outerHTML.slice(0, 1500)
          }
        })
      )
      .catch(() => [])
    const processesText =
      processesCount === 1 ? ((await processes.textContent().catch(() => null)) ?? '') : ''
    const processesInnerText =
      processesCount === 1 ? ((await processes.innerText().catch(() => null)) ?? '') : ''
    const processNumbers = processesText.match(/\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) ?? []
    const processStructure =
      processesCount === 1
        ? await processes
            .evaluate((element) =>
              [...element.children].map((child) => ({
                tag: child.tagName.toLowerCase(),
                id: child.id,
                className: child.className,
                children: child.children.length
              }))
            )
            .catch(() => [])
        : []
    const toasts = await page
      .locator('.toast-message')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          text: element.textContent ?? '',
          visible: element.getClientRects().length > 0,
          className: element.className
        }))
      )
      .catch(() => [])
    const exportCount = await page
      .locator(
        'form[method="POST"] input[type="submit"][name="export"][value="Exportar"][formtarget="_blank"]'
      )
      .count()
      .catch(() => -1)
    const marker = await page
      .locator('html[data-agent-cpi-processes-updated="true"]')
      .count()
      .catch(() => -1)

    const snapshot = {
      path: safePath(page.url()),
      exportCount,
      processesCount,
      processElements: processElements.map((element) => ({
        ...element,
        text: sanitizeDiagnosticText(element.text),
        innerText: sanitizeDiagnosticText(element.innerText),
        html: sanitizeDiagnosticText(element.html)
      })),
      processNumberCount: new Set(processNumbers).size,
      processesText: sanitizeDiagnosticText(processesText),
      processesInnerText: sanitizeDiagnosticText(processesInnerText),
      processStructure,
      marker,
      toasts: toasts.map((toast) => ({
        ...toast,
        text: sanitizeDiagnosticText(toast.text)
      }))
    }
    const serialized = JSON.stringify(snapshot)

    if (serialized !== previousSnapshot) {
      previousSnapshot = serialized
      recordDiagnostic('[DeskData DOM]', snapshot)
    }
  }

  return {
    capture,
    resultPage: {
      url: () => page.url(),
      locator: (selector) => page.locator(selector),
      waitForTimeout: async (milliseconds) => {
        await capture()
        await page.waitForTimeout(milliseconds)
      }
    }
  }
}

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })
  let terminalError: unknown

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

    let cpiPage = findPage(context.pages(), 'adm.cpicentral.com.br')

    let deskDataPage = findPage(context.pages(), 'deskdata.com.br')

    if (!cpiPage || !deskDataPage) {
      throw new Error('As abas da CPI e DeskData não foram localizadas.')
    }

    if (!isCpiQueuePage(cpiPage)) {
      await terminal.question(
        'Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...'
      )

      cpiPage = findPage(context.pages(), 'adm.cpicentral.com.br')
    }

    if (!cpiPage || !isCpiQueuePage(cpiPage)) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
    }

    if (
      !isDeskDataPeoplePage(deskDataPage) ||
      (await deskDataPage.locator('input[type="password"]:visible').count()) > 0
    ) {
      await terminal.question(
        'Faça o login manual na DeskData, abra Consultar pessoas e pressione ENTER...'
      )

      deskDataPage = findPage(context.pages(), 'deskdata.com.br')
    }

    if (!deskDataPage || !isDeskDataPeoplePage(deskDataPage)) {
      throw new Error('A página Consultar pessoas da DeskData não foi confirmada.')
    }

    await cpiPage.bringToFront()
    await terminal.question(
      'Confirme que a pesquisa desejada está aberta na CPI e pressione ENTER...'
    )

    const identity = await new CpiResearchIdentityReader({
      searchAttempts: config.limits.cpiIdentitySearchAttempts,
      searchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      readTimeoutMs: config.timing.readTimeoutMs
    }).read(cpiPage)

    console.log(`CPF capturado na CPI: ${identity.maskedCpf}`)

    const filledCpf = await new DeskDataCpfFormController({
      actionTimeoutMs: config.timing.actionTimeoutMs,
      readTimeoutMs: config.timing.readTimeoutMs
    }).fillCpf(deskDataPage, identity.cpf)

    const datasets = await new DeskDataDatasetController().applyApprovedDatasets(deskDataPage)

    await deskDataPage.bringToFront()

    console.log(`CPF preenchido na DeskData: ${filledCpf.maskedCpf}`)

    console.log(`${datasets.selectedCount} conjuntos aprovados selecionados.`)

    console.log('A consulta ainda NÃO foi enviada.')

    const confirmation = (
      await terminal.question('Digite CONFIRMAR para enviar uma única consulta real à DeskData: ')
    )
      .trim()
      .toUpperCase()

    if (confirmation !== 'CONFIRMAR') {
      console.log('Envio cancelado. Nenhuma consulta foi realizada.')

      return
    }

    const submitController = new DeskDataSearchSubmitController({
      actionTimeoutMs: config.timing.actionTimeoutMs,
      navigationTimeoutMs: config.timing.navigationTimeoutMs,
      submitSettleDelayMs: config.timing.submitSettleDelayMs
    })

    attachDeskDataDiagnostics(deskDataPage)

    const submitResult = await submitController.submitOnce(deskDataPage)

    console.log('Consulta enviada uma única vez.')

    console.log(
      `Página atual da DeskData: ${submitResult.resultPath || '[caminho não identificado]'}`
    )

    console.log('O controlador bloqueou qualquer segundo envio.')

    const diagnosticResult = createDiagnosticResultPage(deskDataPage)

    await diagnosticResult.capture()

    const readyResult = await new DeskDataResultReadyWaiter({
      searchAttempts: config.limits.deskDataResultSearchAttempts,
      searchIntervalMs: config.timing.deskDataResultPollingIntervalMs
    }).waitUntilReady(diagnosticResult.resultPage)

    await diagnosticResult.capture()

    recordDiagnostic('[DeskData pronto]', {
      resultPath: readyResult.resultPath,
      expectedProcessCount: readyResult.expectedProcessCount
    })

    await terminal.question(
      'Captura concluída sem exportar PDF. Confira visualmente e pressione ENTER para fechar...'
    )
  } catch (error: unknown) {
    terminalError = error
    recordDiagnostic('[DeskData erro]', serializeError(error))
    console.error('Falha no envio supervisionado à DeskData:', error)

    await terminal.question(
      'O navegador permanecerá aberto para inspeção. Pressione ENTER para encerrar...'
    )

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    const diagnosticFile = await saveDiagnosticReport(terminalError)

    console.log('Diagnóstico salvo em: ' + diagnosticFile)
    console.log('Navegador encerrado com segurança.')
  }
}

void main()
