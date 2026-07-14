import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => page.url().includes('adm.cpicentral.com.br'))
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

    const controller = new CpiQueueFilterController()

    console.log('Aplicando filtro PROCESSOS JUDICIAIS CRIMINAL FÓRUM NACIONAL CPF...')

    await controller.applyCriminalForumFilter(cpiPage)

    console.log('Filtro aplicado com sucesso.')

    await terminal.question(
      'Confirme visualmente o filtro e pressione ENTER para executar Mostrar Tudo...'
    )

    await controller.refreshQueue(cpiPage)

    console.log('Mostrar Tudo executado com sucesso.')

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } catch (error: unknown) {
    console.error('Falha no teste dos controles da CPI:', error)

    await terminal.question(
      'O navegador foi mantido aberto para inspeção. Pressione ENTER para encerrar...'
    )

    throw error
  } finally {
    terminal.close()
    await context.close()
  }
}

main().catch(() => {
  process.exitCode = 1
})
