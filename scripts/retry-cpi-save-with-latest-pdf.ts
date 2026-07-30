import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor, NodeQueueDelay } from '../src/automation/cpi/cpi-queue-monitor'
import { parseCpiResearchClassification } from '../src/automation/cpi/cpi-research-classification-parser'
import { CpiResearchPdfAttachmentController } from '../src/automation/cpi/cpi-research-pdf-attachment-controller'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfPreparationFrame
} from '../src/automation/cpi/cpi-research-pdf-preparation-workflow'
import { CpiResearchConfirmedSaveController } from '../src/automation/cpi/cpi-research-confirmed-save-controller'
import { CpiResearchResultController } from '../src/automation/cpi/cpi-research-result-controller'
import { CpiResearchResultSaver } from '../src/automation/cpi/cpi-research-result-saver'
import { CpiResearchResultSimulationReporter } from '../src/automation/cpi/cpi-research-result-simulation-reporter'
import { isCpiResearchSaveConfirmed } from '../src/automation/cpi/cpi-research-save-confirmation'
import { DeskDataLatestPdfLocator } from '../src/automation/deskdata/deskdata-latest-pdf-locator'
import { resolvePdfOutputDirectory } from '../src/infrastructure/filesystem/pdf-output-directory-resolver'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

const DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => {
    try {
      return new URL(page.url()).hostname === 'adm.cpicentral.com.br'
    } catch {
      return false
    }
  })
}

function findDetailFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => {
    try {
      return new URL(frame.url()).pathname.toLowerCase() === DETAIL_FRAME_PATH
    } catch {
      return false
    }
  })
}

async function main(): Promise<void> {
  const classification = parseCpiResearchClassification(process.argv.slice(2))

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

    await terminal.question('Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...')

    let cpiPage = findCpiPage(context.pages())

    if (!cpiPage) {
      throw new Error('A aba da CPI Central não foi localizada.')
    }

    if (!cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
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

    console.log('Aplicando filtro 29...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const monitorResult = await monitor.waitForResearch(cpiPage)

    if (monitorResult.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    await new CpiFirstResearchOpener({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs
    }).openFirst(cpiPage)

    cpiPage = findCpiPage(context.pages()) ?? cpiPage

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa não foi localizado.')
    }

    const pdfFile = await new DeskDataLatestPdfLocator(pdfOutputDirectory).findLatestValid()

    console.log('PDF reaproveitado: ' + pdfFile.filePath)
    console.log('Nenhuma nova consulta DeskData será enviada.')

    const workflowResult = await new CpiResearchPdfPreparationWorkflow(
      new CpiResearchResultController({
        resultSearchAttempts: config.limits.cpiResultSearchAttempts,
        resultSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
        stabilizationAttempts: config.limits.cpiResultStabilizationAttempts,
        readTimeoutMs: config.timing.readTimeoutMs
      }),
      new CpiResearchPdfAttachmentController({
        controlSearchAttempts: config.limits.cpiAttachmentSearchAttempts,
        controlSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs
      })
    ).prepareWithAttachment(
      detailFrame as CpiResearchPdfPreparationFrame,
      classification,
      pdfFile.filePath
    )

    const reportLines = new CpiResearchResultSimulationReporter().format(workflowResult.prepared)

    console.log('')
    console.log('Campos finais confirmados no DOM:')
    reportLines.forEach((line) => console.log(line))
    console.log('PDF anexado: ' + workflowResult.attachment.fileName)

    await cpiPage.bringToFront()

    const confirmation = await terminal.question(
      'Digite GRAVAR para tentar salvar, ou pressione ENTER para cancelar: '
    )

    if (!isCpiResearchSaveConfirmed(confirmation)) {
      console.log('Gravação cancelada. Alterar não foi acionado.')
      return
    }

    const navigationPromise = detailFrame
      .waitForNavigation({
        waitUntil: 'domcontentloaded',
        timeout: 15_000
      })
      .then(() => true)
      .catch(() => false)

    const saveResult = await new CpiResearchConfirmedSaveController(
      new CpiResearchResultSaver({
        actionTimeoutMs: config.timing.actionTimeoutMs
      }),
      {
        dialogTimeoutMs: config.timing.actionTimeoutMs
      }
    ).saveOnce(cpiPage, detailFrame)

    console.log('Confirmação da CPI aceita: ' + (saveResult.confirmationAccepted ? 'Sim' : 'Não'))

    const navigated = await navigationPromise

    console.log('Alterar foi acionado e o botão OK foi confirmado.')
    console.log('Navegação do formulário confirmada: ' + (navigated ? 'Sim' : 'Não confirmada'))

    await terminal.question('Confira se a pesquisa saiu da fila e pressione ENTER para fechar...')
  } catch (error: unknown) {
    console.error('Falha na retentativa de gravação da CPI:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
