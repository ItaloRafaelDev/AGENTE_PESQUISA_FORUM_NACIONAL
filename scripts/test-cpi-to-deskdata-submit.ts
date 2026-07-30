import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor, NodeQueueDelay } from '../src/automation/cpi/cpi-queue-monitor'
import { CpiResearchIdentityReader } from '../src/automation/cpi/cpi-research-identity-reader'
import { DeskDataCpfFormController } from '../src/automation/deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../src/automation/deskdata/deskdata-dataset-controller'
import { DeskDataSearchSubmitController } from '../src/automation/deskdata/deskdata-search-submit-controller'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

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

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

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

    const queueFilterController = new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    })

    await cpiPage.bringToFront()

    console.log('Aplicando filtro 29 na CPI...')

    await queueFilterController.applyCriminalForumFilter(cpiPage)

    const monitor = new CpiQueueMonitor(
      queueFilterController,
      new CpiQueueAvailabilityReader(config.timing.readTimeoutMs),
      new NodeQueueDelay(),
      config.timing.queueCheckIntervalMs
    )

    console.log('Aguardando pesquisa disponível...')

    const queueResult = await monitor.waitForResearch(cpiPage)

    if (queueResult.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    await new CpiFirstResearchOpener({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs
    }).openFirst(cpiPage)

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

    const submitResult = await submitController.submitOnce(deskDataPage)

    console.log('Consulta enviada uma única vez.')

    console.log(
      `Página atual da DeskData: ${submitResult.resultPath || '[caminho não identificado]'}`
    )

    console.log('O controlador bloqueou qualquer segundo envio.')

    await terminal.question(
      'Aguarde o resultado carregar, confira visualmente e pressione ENTER para fechar...'
    )
  } catch (error: unknown) {
    console.error('Falha no envio supervisionado à DeskData:', error)

    await terminal.question(
      'O navegador permanecerá aberto para inspeção. Pressione ENTER para encerrar...'
    )

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
