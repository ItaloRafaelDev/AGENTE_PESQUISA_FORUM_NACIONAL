import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor, NodeQueueDelay } from '../src/automation/cpi/cpi-queue-monitor'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => page.url().includes('adm.cpicentral.com.br'))
}

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const abortController = new AbortController()

  const handleSigint = (): void => {
    console.log('\nParada solicitada. Encerrando no ponto seguro...')

    abortController.abort()
  }

  process.once('SIGINT', handleSigint)

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  try {
    const pageManager = new PlatformPageManager(
      config.platform,
      config.timing.platformPageNavigationTimeoutMs
    )

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

    const filterController = new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    })

    const availabilityReader = new CpiQueueAvailabilityReader(config.timing.readTimeoutMs)

    const monitor = new CpiQueueMonitor(
      filterController,
      availabilityReader,
      new NodeQueueDelay(),
      config.timing.queueCheckIntervalMs
    )

    console.log('Aplicando filtro PROCESSOS JUDICIAIS CRIMINAL FÓRUM NACIONAL CPF...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Filtro aplicado com sucesso.')
    console.log('Monitoramento contínuo iniciado.')
    console.log('A fila será consultada imediatamente e depois a cada 60 segundos.')
    console.log('Pressione Ctrl + C para solicitar parada segura.')

    const result = await monitor.waitForResearch(cpiPage, {
      signal: abortController.signal,

      onState: (state, checks) => {
        const currentTime = new Date().toLocaleTimeString('pt-BR')

        if (state === 'EMPTY') {
          console.log(`[${currentTime}] Verificação ${checks}: fila vazia. Ocioso por 60 segundos.`)

          return
        }

        if (state === 'HAS_RESEARCH') {
          console.log(`[${currentTime}] Verificação ${checks}: pesquisa disponível.`)

          return
        }

        console.log(`[${currentTime}] Verificação ${checks}: estado da fila indeterminado.`)
      }
    })

    if (result.status === 'RESEARCH_AVAILABLE') {
      console.log(`Pesquisa detectada após ${result.checks} verificação(ões).`)

      console.log('Nenhuma pesquisa foi aberta nesta etapa.')

      await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
    } else {
      console.log('Monitoramento pausado com segurança.')
    }
  } catch (error: unknown) {
    console.error('Falha no monitoramento contínuo da CPI:', error)

    await terminal.question(
      'O navegador foi mantido aberto para inspeção. Pressione ENTER para encerrar...'
    )

    process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', handleSigint)

    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
