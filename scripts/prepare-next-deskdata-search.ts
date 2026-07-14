import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { DeskDataNextSearchController } from '../src/automation/deskdata/deskdata-next-search-controller'

function findDeskDataPage(pages: Page[]): Page | undefined {
  return [...pages].reverse().find((page) => {
    if (page.isClosed()) {
      return false
    }

    try {
      const hostname = new URL(page.url()).hostname

      return hostname === 'deskdata.com.br' || hostname.endsWith('.deskdata.com.br')
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

    let deskDataPage = findDeskDataPage(context.pages())

    if (!deskDataPage) {
      throw new Error('A aba da DeskData não foi localizada.')
    }

    await deskDataPage.bringToFront()

    if ((await deskDataPage.locator('input[type="password"]:visible').count()) > 0) {
      await terminal.question('Faça o login manual na DeskData e pressione ENTER...')

      deskDataPage = findDeskDataPage(context.pages())
    }

    if (!deskDataPage) {
      throw new Error('A página autenticada da DeskData não foi confirmada.')
    }

    const result = await new DeskDataNextSearchController().prepare(deskDataPage)

    console.log('')
    console.log('DeskData preparada para a próxima consulta.')
    console.log('Caminho: ' + result.pagePath)
    console.log('Campo CPF limpo: Sim')
    console.log('Nenhuma consulta foi enviada.')

    await terminal.question('Confira a página Consultar pessoas e pressione ENTER para fechar...')
  } catch (error: unknown) {
    console.error('Falha ao preparar a próxima consulta:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
