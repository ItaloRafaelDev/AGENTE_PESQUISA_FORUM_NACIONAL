import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../src/automation/cpi/cpi-queue-monitor'
import { CpiResearchIdentityReader } from '../src/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '../src/automation/cpi/cpi-research-pdf-preparation-workflow'
import { CpiResearchConfirmedSaveController } from '../src/automation/cpi/cpi-research-confirmed-save-controller'
import { isCpiResearchSaveConfirmed } from '../src/automation/cpi/cpi-research-save-confirmation'
import { DeskDataClassificationReportFormatter } from '../src/automation/deskdata/deskdata-classification-report-formatter'
import { DeskDataNextSearchController } from '../src/automation/deskdata/deskdata-next-search-controller'
import { FullResearchPreparationWorkflow } from '../src/automation/flow/full-research-preparation-workflow'

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

    const filterController = new CpiQueueFilterController()
    const monitor = new CpiQueueMonitor(filterController, new CpiQueueAvailabilityReader())

    console.log('Aplicando filtro 29 na CPI...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const queueResult = await monitor.waitForResearch(cpiPage)

    if (queueResult.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    await new CpiFirstResearchOpener().openFirst(cpiPage)

    const identity = await new CpiResearchIdentityReader().read(cpiPage)

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa da CPI não foi localizado.')
    }

    console.log('Pesquisa aberta na CPI.')
    console.log('CPF capturado com segurança: ' + identity.maskedCpf)
    console.log('A consulta da DeskData será enviada automaticamente uma única vez.')

    await deskDataPage.bringToFront()

    const flowResult = await new FullResearchPreparationWorkflow().prepare(
      context,
      deskDataPage,
      detailFrame as CpiResearchPdfPreparationFrame,
      identity
    )

    console.log('')
    console.log('Preparação completa sem gravação.')
    console.log('CPF processado: ' + flowResult.maskedCpf)
    console.log('Conjuntos selecionados: ' + flowResult.selectedDatasetCount)

    const reportLines = new DeskDataClassificationReportFormatter().format(
      flowResult.classification
    )

    reportLines.forEach((line) => console.log(line))

    console.log('PDF salvo: ' + flowResult.pdf.filePath)
    console.log('Tamanho do PDF: ' + flowResult.pdf.sizeBytes + ' bytes')
    console.log('PDF anexado na CPI: ' + flowResult.cpi.attachment.fileName)
    console.log('Resultado selecionado: ' + flowResult.cpi.prepared.selectedResultLabel)
    console.log('Pesquisador/Fonte: ' + flowResult.cpi.prepared.researcherLabel)
    console.log('Pesquisador/Fonte 1º: ' + flowResult.cpi.prepared.primaryResearcherLabel)
    console.log('Status: ' + flowResult.cpi.prepared.statusLabel)
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

    const saveResult = await new CpiResearchConfirmedSaveController().saveOnce(
      cpiPage,
      flowResult.detailFrame
    )

    console.log('Confirmação da CPI aceita: ' + (saveResult.confirmationAccepted ? 'Sim' : 'Não'))

    if (!saveResult.saved) {
      throw new Error('A gravação da pesquisa não foi confirmada pelo controlador.')
    }

    console.log('A ação Alterar foi acionada e o botão OK foi confirmado.')

    await cpiPage.waitForTimeout(3_000)

    await new DeskDataNextSearchController().prepare(deskDataPage)

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
