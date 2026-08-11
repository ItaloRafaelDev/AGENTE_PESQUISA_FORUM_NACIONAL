import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/infrastructure/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/infrastructure/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/infrastructure/automation/cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  NodeQueueDelay
} from '../src/infrastructure/automation/cpi/cpi-queue-monitor'
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
    console.log('\nParada solicitada.')

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

    const monitor = new CpiQueueMonitor(
      filterController,
      new CpiQueueAvailabilityReader(config.timing.readTimeoutMs),
      new NodeQueueDelay(),
      config.timing.queueCheckIntervalMs
    )

    const opener = new CpiFirstResearchOpener({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs
    })

    console.log('Aplicando filtro 29...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const monitorResult = await monitor.waitForResearch(cpiPage, {
      signal: abortController.signal,

      onState: (state, checks) => {
        const time = new Date().toLocaleTimeString('pt-BR')

        console.log(`[${time}] Verificação ${checks}: ${state}`)
      }
    })

    if (monitorResult.status === 'PAUSED') {
      console.log('Teste interrompido com segurança.')

      return
    }

    console.log('Abrindo somente a primeira pesquisa...')

    const openedResearch = await opener.openFirst(cpiPage)

    console.log('Pesquisa aberta com segurança.')

    console.log(`Pesquisas disponíveis: ${openedResearch.availableRows}`)

    console.log(`Formulário aberto: ${openedResearch.detailFramePath}`)

    console.log('Nenhum campo foi preenchido, salvo ou alterado.')

    await terminal.question(
      'Confira visualmente o formulário e pressione ENTER para fechar o navegador...'
    )
  } catch (error: unknown) {
    console.error('Falha ao abrir a primeira pesquisa:', error)

    await terminal.question(
      'O navegador permanecerá aberto para inspeção. Pressione ENTER para encerrar...'
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
