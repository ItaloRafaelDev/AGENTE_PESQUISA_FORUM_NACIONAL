import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../src/automation/cpi/cpi-queue-monitor'
import { CpiResearchIdentityReader } from '../src/automation/cpi/cpi-research-identity-reader'
import { DeskDataCpfFormController } from '../src/automation/deskdata/deskdata-cpf-form-controller'

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

    const filterController = new CpiQueueFilterController()

    const monitor = new CpiQueueMonitor(filterController, new CpiQueueAvailabilityReader())

    console.log('Aplicando filtro 29 na CPI...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const result = await monitor.waitForResearch(cpiPage)

    if (result.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    const opener = new CpiFirstResearchOpener()

    await opener.openFirst(cpiPage)

    const identityReader = new CpiResearchIdentityReader()

    const identity = await identityReader.read(cpiPage)

    console.log(`CPF capturado na CPI: ${identity.maskedCpf}`)

    const deskDataController = new DeskDataCpfFormController()

    const filledCpf = await deskDataController.fillCpf(deskDataPage, identity.cpf)

    await deskDataPage.bringToFront()

    console.log(`CPF preenchido na DeskData: ${filledCpf.maskedCpf}`)

    console.log('A consulta NÃO foi enviada.')

    await terminal.question(
      'Confirme visualmente o CPF no campo da DeskData e pressione ENTER para fechar...'
    )
  } catch (error: unknown) {
    console.error('Falha na transferência do CPF:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
