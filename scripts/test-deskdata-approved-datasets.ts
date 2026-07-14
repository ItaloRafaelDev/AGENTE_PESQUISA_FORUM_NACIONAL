import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import {
  APPROVED_DESKDATA_DATASET_IDS,
  DeskDataDatasetController
} from '../src/automation/deskdata/deskdata-dataset-controller'

function findDeskDataPage(pages: Page[]): Page | undefined {
  return pages.find((page) => {
    try {
      const url = new URL(page.url())

      return (
        url.hostname === 'deskdata.com.br' &&
        (url.pathname === '/pessoas' || url.pathname.startsWith('/pessoas/'))
      )
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
    const pageManager = new PlatformPageManager()

    await pageManager.ensurePages(context)

    let deskDataPage = findDeskDataPage(context.pages())

    if (
      !deskDataPage ||
      (await deskDataPage.locator('input[type="password"]:visible').count()) > 0
    ) {
      await terminal.question(
        'Faça o login manual na DeskData, abra Consultar pessoas e pressione ENTER...'
      )

      deskDataPage = findDeskDataPage(context.pages())
    }

    if (!deskDataPage) {
      throw new Error('A página Consultar pessoas da DeskData não foi confirmada.')
    }

    const controller = new DeskDataDatasetController()

    const result = await controller.applyApprovedDatasets(deskDataPage)

    await deskDataPage.bringToFront()

    console.log(`${result.selectedCount} conjuntos selecionados com sucesso.`)

    console.log(
      ['Dados básicos', 'E-mails', 'Endereços', 'Telefones', 'Emprego', 'Processos'].join(', ')
    )

    console.log('Todos os demais conjuntos foram desmarcados.')

    console.log('A consulta NÃO foi enviada.')

    console.log(`IDs validados: ${APPROVED_DESKDATA_DATASET_IDS.join(', ')}`)

    await terminal.question(
      'Confirme visualmente os seis conjuntos e pressione ENTER para fechar...'
    )
  } catch (error: unknown) {
    console.error('Falha ao selecionar os conjuntos da DeskData:', error)

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
