import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../src/automation/cpi/cpi-queue-monitor'
import { parseCpiResearchClassification } from '../src/automation/cpi/cpi-research-classification-parser'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfPreparationFrame
} from '../src/automation/cpi/cpi-research-pdf-preparation-workflow'
import { CpiResearchResultSimulationReporter } from '../src/automation/cpi/cpi-research-result-simulation-reporter'
import { DeskDataLatestPdfLocator } from '../src/automation/deskdata/deskdata-latest-pdf-locator'

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

  const appData = process.env.APPDATA

  if (!appData) {
    throw new Error('Variável APPDATA não encontrada.')
  }

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const context = await chromium.launchPersistentContext(
    join(appData, 'AgenteCPI', 'browser-profile'),
    {
      headless: false,
      viewport: null,
      acceptDownloads: true,
      args: ['--start-maximized']
    }
  )

  try {
    await new PlatformPageManager().ensurePages(context)

    await terminal.question('Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...')

    let cpiPage = findCpiPage(context.pages())

    if (!cpiPage) {
      throw new Error('A aba da CPI Central não foi localizada.')
    }

    if (!cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
    }

    await cpiPage.bringToFront()

    const filterController = new CpiQueueFilterController()
    const monitor = new CpiQueueMonitor(filterController, new CpiQueueAvailabilityReader())

    console.log('Aplicando filtro 29...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const monitorResult = await monitor.waitForResearch(cpiPage)

    if (monitorResult.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    await new CpiFirstResearchOpener().openFirst(cpiPage)

    cpiPage = findCpiPage(context.pages()) ?? cpiPage

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa não foi localizado.')
    }

    const pdfFile = await new DeskDataLatestPdfLocator().findLatestValid()

    console.log('PDF válido mais recente localizado: ' + pdfFile.filePath)

    console.log('Preparando campos da CPI...')

    const workflowResult = await new CpiResearchPdfPreparationWorkflow().prepareWithAttachment(
      detailFrame as CpiResearchPdfPreparationFrame,
      classification,
      pdfFile.filePath
    )

    const reportLines = new CpiResearchResultSimulationReporter().format(workflowResult.prepared)

    console.log('')
    console.log('PDF anexado sem gravação.')
    console.log('Arquivo anexado: ' + workflowResult.attachment.fileName)
    console.log('Tamanho em bytes: ' + workflowResult.attachment.sizeBytes)

    reportLines.forEach((line) => console.log(line))

    console.log('')
    console.log('O botão Alterar não foi acionado.')
    console.log('Confira visualmente o anexo e os campos da CPI.')

    await terminal.question('Pressione ENTER para fechar sem gravar a pesquisa...')
  } catch (error: unknown) {
    console.error('Falha no teste de anexo da CPI:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado sem gravar a pesquisa.')
  }
}

void main()
