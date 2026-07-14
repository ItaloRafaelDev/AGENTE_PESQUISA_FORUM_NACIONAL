import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { prepareDeskDataInspectionPages } from '../src/automation/deskdata/deskdata-inspection-page-preparer'
import {
  DESKDATA_PDF_EXPORT_SELECTOR,
  DeskDataPdfDownloadController
} from '../src/automation/deskdata/deskdata-pdf-download-controller'

function isDeskDataPage(page: Page): boolean {
  try {
    return new URL(page.url()).hostname.endsWith('deskdata.com.br')
  } catch {
    return false
  }
}

async function findExportPage(pages: Page[]): Promise<Page | undefined> {
  for (const page of pages) {
    if (page.isClosed() || !isDeskDataPage(page)) {
      continue
    }

    const exportControlCount = await page.locator(DESKDATA_PDF_EXPORT_SELECTOR).count()

    if (exportControlCount === 1) {
      return page
    }
  }

  return undefined
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
    await prepareDeskDataInspectionPages(context)

    await terminal.question(
      'Faça o login na DeskData, deixe o resultado com o botão Exportar aberto e pressione ENTER...'
    )

    const exportPage = await findExportPage(context.pages())

    if (!exportPage) {
      throw new Error('Nenhuma página da DeskData com o botão Exportar foi localizada.')
    }

    await exportPage.bringToFront()

    console.log('Botão Exportar localizado.')
    console.log('Iniciando captura supervisionada do PDF...')

    const result = await new DeskDataPdfDownloadController().downloadOnce(context, exportPage)

    console.log('')
    console.log('PDF baixado e validado com sucesso.')
    console.log('Arquivo local: ' + result.filePath)
    console.log('Tamanho em bytes: ' + result.sizeBytes)
    console.log('Nenhuma pesquisa foi alterada na CPI.')

    await terminal.question('Confira o arquivo e pressione ENTER para fechar o navegador...')
  } catch (error: unknown) {
    console.error('Falha no teste de download da DeskData:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
