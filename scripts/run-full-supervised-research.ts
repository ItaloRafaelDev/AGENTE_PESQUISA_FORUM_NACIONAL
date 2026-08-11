import { basename } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { CpiFirstResearchOpener } from '../src/infrastructure/automation/cpi/cpi-first-research-opener'
import { CpiQueueAvailabilityReader } from '../src/infrastructure/automation/cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../src/infrastructure/automation/cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  NodeQueueDelay
} from '../src/infrastructure/automation/cpi/cpi-queue-monitor'
import { CpiResearchIdentityReader } from '../src/infrastructure/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '../src/infrastructure/automation/cpi/cpi-research-pdf-preparation-workflow'
import { CpiResearchConfirmedSaveController } from '../src/infrastructure/automation/cpi/cpi-research-confirmed-save-controller'
import { CpiResearchResultSaver } from '../src/infrastructure/automation/cpi/cpi-research-result-saver'
import { isCpiResearchSaveConfirmed } from '../src/infrastructure/automation/cpi/cpi-research-save-confirmation'
import { DeskDataNextSearchController } from '../src/infrastructure/automation/deskdata/deskdata-next-search-controller'
import { createPlaywrightResearchPreparationAdapter } from '../src/infrastructure/automation/workflow/playwright-research-preparation-adapter'
import { getCpiClassificationLabel } from '../src/domain/research/get-cpi-classification-label'
import { resolvePdfOutputDirectory } from '../src/infrastructure/filesystem/pdf-output-directory-resolver'
import { formatResearchPreparationReport } from './support/research-preparation-report-formatter'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'

const CPI_DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

function findPage(pages: Page[], hostname: string): Page | undefined {
  return pages.find((page) => {
    try {
      const pageHostname = new URL(page.url()).hostname

      return pageHostname === hostname || pageHostname.endsWith('.' + hostname)
    } catch {
      return false
    }
  })
}

function isCpiQueuePage(page: Page): boolean {
  try {
    return new URL(page.url()).pathname.toLowerCase() === CPI_QUEUE_PATH
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

function findDetailFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => {
    try {
      return new URL(frame.url()).pathname.toLowerCase() === CPI_DETAIL_FRAME_PATH
    } catch {
      return false
    }
  })
}

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir
  const pdfOutputDirectory = await resolvePdfOutputDirectory({
    preferredDirectory: config.paths.preferredPdfDirectory,
    fallbackDirectory: paths.downloadsDir
  })

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
    await new PlatformPageManager(
      config.platform,
      config.timing.platformPageNavigationTimeoutMs
    ).ensurePages(context)

    let cpiPage = findPage(context.pages(), 'adm.cpicentral.com.br')

    let deskDataPage = findPage(context.pages(), 'deskdata.com.br')

    if (!cpiPage || !deskDataPage) {
      throw new Error('As abas da CPI e da DeskData não foram localizadas.')
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

    const filterController = new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    })
    const monitor = new CpiQueueMonitor(
      filterController,
      new CpiQueueAvailabilityReader(config.timing.readTimeoutMs),
      new NodeQueueDelay(),
      config.timing.queueCheckIntervalMs
    )

    console.log('Aplicando filtro 29 na CPI...')

    await filterController.applyCriminalForumFilter(cpiPage)

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

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa da CPI não foi localizado.')
    }

    console.log('Pesquisa aberta na CPI.')
    console.log('CPF capturado com segurança: ' + identity.maskedCpf)
    console.log('A consulta da DeskData será enviada automaticamente uma única vez.')

    await deskDataPage.bringToFront()

    const prepared = await createPlaywrightResearchPreparationAdapter({
      context,
      deskDataPage,
      detailFrame: detailFrame as CpiResearchPdfPreparationFrame,
      config: {
        queueCheckIntervalMs: config.timing.queueCheckIntervalMs,
        cpiSearchPollingIntervalMs: config.timing.cpiSearchPollingIntervalMs,
        actionTimeoutMs: config.timing.actionTimeoutMs,
        readTimeoutMs: config.timing.readTimeoutMs,
        queueFilterSettleDelayMs: config.timing.queueFilterSettleDelayMs,
        cpiFrameSearchAttempts: config.limits.cpiFrameSearchAttempts,
        deskDataPeopleUrl: config.platform.deskDataPeopleUrl,
        navigationTimeoutMs: config.timing.navigationTimeoutMs,
        downloadStartTimeoutMs: config.timing.downloadStartTimeoutMs,
        deskDataFormPollingIntervalMs: config.timing.deskDataFormPollingIntervalMs,
        deskDataResultPollingIntervalMs: config.timing.deskDataResultPollingIntervalMs,
        deskDataHistoryNavigationIntervalMs: config.timing.deskDataHistoryNavigationIntervalMs,
        submitSettleDelayMs: config.timing.submitSettleDelayMs,
        queueReturnDelayMs: config.timing.queueReturnDelayMs,
        cpiIdentitySearchAttempts: config.limits.cpiIdentitySearchAttempts,
        cpiAttachmentSearchAttempts: config.limits.cpiAttachmentSearchAttempts,
        cpiResultSearchAttempts: config.limits.cpiResultSearchAttempts,
        cpiResultStabilizationAttempts: config.limits.cpiResultStabilizationAttempts,
        deskDataFormReadyAttempts: config.limits.deskDataFormReadyAttempts,
        deskDataResultSearchAttempts: config.limits.deskDataResultSearchAttempts,
        deskDataHistoryNavigationAttempts: config.limits.deskDataHistoryNavigationAttempts,
        pdfOutputDirectory
      }
    }).execute(identity)

    console.log('')
    console.log('Preparação completa sem gravação.')
    console.log('CPF processado: ' + prepared.maskedCpf)
    console.log('Conjuntos selecionados: ' + prepared.selectedDatasetCount)

    const reportLines = formatResearchPreparationReport({
      classification: prepared.classification
    })

    reportLines.forEach((line) => console.log(line))

    console.log('PDF salvo: ' + prepared.report.compatibilityPath)
    console.log('Tamanho do PDF: ' + prepared.report.sizeBytes + ' bytes')
    console.log('PDF anexado na CPI: ' + basename(prepared.report.compatibilityPath))
    console.log(
      'Resultado selecionado: ' + getCpiClassificationLabel(prepared.classification.classification)
    )
    console.log('Pesquisador/Fonte: Desk Data')
    console.log('Pesquisador/Fonte 1º: Desk Data')
    console.log('Status: Respondida')
    console.log('Resposta alterada: Não')
    console.log('Pesquisa gravada: Não')

    await cpiPage.bringToFront()

    console.log('')
    console.log('Confira visualmente o PDF, as fontes, o status e o resultado.')

    const confirmation = await terminal.question(
      'Digite GRAVAR para acionar Alterar uma única vez, ou pressione ENTER para cancelar: '
    )

    if (!isCpiResearchSaveConfirmed(confirmation)) {
      console.log('Gravação cancelada. O botão Alterar não foi acionado.')

      return
    }

    const saveResult = await new CpiResearchConfirmedSaveController(
      new CpiResearchResultSaver({
        actionTimeoutMs: config.timing.actionTimeoutMs
      }),
      {
        dialogTimeoutMs: config.timing.actionTimeoutMs
      }
    ).saveOnce(cpiPage, detailFrame as CpiResearchPdfPreparationFrame)

    console.log('Confirmação da CPI aceita: ' + (saveResult.confirmationAccepted ? 'Sim' : 'Não'))

    if (!saveResult.saved) {
      throw new Error('A gravação da pesquisa não foi confirmada pelo controlador.')
    }

    console.log('A ação Alterar foi acionada e o botão OK foi confirmado.')

    await cpiPage.waitForTimeout(3_000)

    await new DeskDataNextSearchController({
      peopleUrl: config.platform.deskDataPeopleUrl,
      formReadyAttempts: config.limits.deskDataFormReadyAttempts,
      pollingIntervalMs: config.timing.deskDataFormPollingIntervalMs,
      navigationTimeoutMs: config.timing.navigationTimeoutMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      readTimeoutMs: config.timing.readTimeoutMs
    }).prepare(deskDataPage)

    console.log('DeskData preparada para a próxima consulta.')

    await cpiPage.bringToFront()

    await terminal.question('Confira o retorno da CPI e pressione ENTER para fechar o navegador...')
  } catch (error: unknown) {
    console.error('Falha no fluxo completo supervisionado:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
