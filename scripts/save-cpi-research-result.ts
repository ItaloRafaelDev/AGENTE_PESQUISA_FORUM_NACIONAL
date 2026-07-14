import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../src/automation/cpi/cpi-queue-monitor'
import { parseCpiResearchClassification } from '../src/automation/cpi/cpi-research-classification-parser'
import { CpiResearchResultController } from '../src/automation/cpi/cpi-research-result-controller'
import { CpiResearchResultSaver } from '../src/automation/cpi/cpi-research-result-saver'
import { CpiResearchResultSimulationReporter } from '../src/automation/cpi/cpi-research-result-simulation-reporter'
import { isCpiResearchSaveConfirmed } from '../src/automation/cpi/cpi-research-save-confirmation'

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
    const pageManager = new PlatformPageManager()

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

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa não foi localizado.')
    }

    const prepared = await new CpiResearchResultController().prepare(detailFrame, classification)

    const reportLines = new CpiResearchResultSimulationReporter().format(prepared)

    console.log('')
    reportLines.forEach((line) => console.log(line))

    console.log('')
    console.log('Confira visualmente todos os campos antes da gravação.')

    const confirmation = await terminal.question(
      'Digite GRAVAR para acionar Alterar uma única vez, ou pressione ENTER para cancelar: '
    )

    if (!isCpiResearchSaveConfirmed(confirmation)) {
      console.log('Gravação cancelada. O botão Alterar não foi acionado.')
      return
    }

    const saveResult = await new CpiResearchResultSaver().saveOnce(detailFrame)

    if (!saveResult.saved) {
      throw new Error('A ação de gravação não foi confirmada pelo controlador.')
    }

    console.log('A ação Alterar foi acionada exatamente uma vez.')
    console.log('Aguardando a atualização da CPI...')

    await cpiPage.waitForTimeout(3_000)

    await terminal.question('Confira o retorno da CPI e pressione ENTER para fechar o navegador...')
  } catch (error: unknown) {
    console.error('Falha na gravação supervisionada da CPI:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
