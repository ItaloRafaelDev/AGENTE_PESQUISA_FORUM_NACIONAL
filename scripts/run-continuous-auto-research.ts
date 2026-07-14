import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { ContinuousResearchStageError } from '../src/automation/flow/continuous-research-stage'
import {
  ContinuousResearchRunner,
  type ContinuousResearchRunnerState
} from '../src/automation/flow/continuous-research-runner'
import { SafeResearchLogger } from '../src/automation/logging/safe-research-logger'

const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'

type TerminalInterface = ReturnType<typeof createInterface>

interface AuthenticatedPages {
  cpiPage: Page
  deskDataPage: Page
}

function findPage(pages: Page[], hostname: string): Page | undefined {
  return [...pages].reverse().find((page) => {
    if (page.isClosed()) {
      return false
    }

    try {
      const currentHostname = new URL(page.url()).hostname

      return currentHostname === hostname || currentHostname.endsWith('.' + hostname)
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
    const url = new URL(page.url())

    const validHostname =
      url.hostname === 'deskdata.com.br' || url.hostname.endsWith('.deskdata.com.br')

    const validPath = url.pathname === '/pessoas' || url.pathname.startsWith('/pessoas/')

    return validHostname && validPath
  } catch {
    return false
  }
}

async function hasVisiblePasswordField(page: Page): Promise<boolean> {
  return (
    (await page
      .locator('input[type="password"]:visible')
      .count()
      .catch(() => 0)) > 0
  )
}

async function ensureAuthenticatedPages(
  context: BrowserContext,
  terminal: TerminalInterface,
  logger: SafeResearchLogger
): Promise<AuthenticatedPages> {
  await new PlatformPageManager().ensurePages(context)

  let cpiPage = findPage(context.pages(), 'adm.cpicentral.com.br')

  let deskDataPage = findPage(context.pages(), 'deskdata.com.br')

  if (!cpiPage || !deskDataPage) {
    throw new Error('As abas da CPI e da DeskData não foram localizadas.')
  }

  if (!isCpiQueuePage(cpiPage)) {
    logger.info('Aguardando login manual na CPI.')

    await terminal.question('Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...')

    cpiPage = findPage(context.pages(), 'adm.cpicentral.com.br')
  }

  if (!cpiPage || !isCpiQueuePage(cpiPage)) {
    throw new Error('A fila autenticada da CPI não foi confirmada.')
  }

  const deskDataRequiresLogin =
    !isDeskDataPeoplePage(deskDataPage) || (await hasVisiblePasswordField(deskDataPage))

  if (deskDataRequiresLogin) {
    logger.info('Aguardando login manual na DeskData.')

    await terminal.question('Faça o login manual na DeskData e pressione ENTER...')

    deskDataPage = findPage(context.pages(), 'deskdata.com.br')
  }

  if (
    !deskDataPage ||
    !isDeskDataPeoplePage(deskDataPage) ||
    (await hasVisiblePasswordField(deskDataPage))
  ) {
    throw new Error('A sessão autenticada da DeskData não foi confirmada.')
  }

  return {
    cpiPage,
    deskDataPage
  }
}

function logRunnerState(logger: SafeResearchLogger, state: ContinuousResearchRunnerState): void {
  switch (state.type) {
    case 'WAITING_QUEUE':
      if (state.checks === 0) {
        logger.info('Verificando a fila da CPI.')
      } else {
        logger.info('Verificação da fila concluída: ' + state.checks)
      }

      return

    case 'IDLE':
      logger.info('Fila vazia. Nova verificação em ' + state.nextCheckInMs / 1000 + ' segundos.')

      return

    case 'RESEARCH_AVAILABLE':
      logger.info('Pesquisa disponível. Iniciando ciclo ' + state.cycle + '.')

      return

    case 'CYCLE_COMPLETED':
      logger.info('Ciclo ' + state.cycle + ' concluído e gravado.')

      return

    case 'STOPPED':
      logger.info('Execução contínua interrompida. Ciclos concluídos: ' + state.cycles + '.')

      return
  }
}

async function main(): Promise<void> {
  const appData = process.env.APPDATA

  if (!appData) {
    throw new Error('Variável APPDATA não encontrada.')
  }

  const logger = new SafeResearchLogger()

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const abortController = new AbortController()

  let sigintReceived = false
  let sigintRegistered = false

  const handleSigint = (): void => {
    if (sigintReceived) {
      return
    }

    sigintReceived = true

    logger.info('Interrupção solicitada. O agente será encerrado no próximo ponto seguro.')

    abortController.abort()
  }

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
    const { cpiPage, deskDataPage } = await ensureAuthenticatedPages(context, terminal, logger)

    await cpiPage.bringToFront()

    logger.info('Aplicando filtro 29 na CPI.')

    await new CpiQueueFilterController().applyCriminalForumFilter(cpiPage)

    logger.info('Modo automático contínuo iniciado.')

    logger.info('Pressione Ctrl+C para solicitar encerramento seguro.')

    process.once('SIGINT', handleSigint)

    sigintRegistered = true

    const result = await new ContinuousResearchRunner().run({
      context,
      cpiPage,
      deskDataPage,
      signal: abortController.signal,
      onState: (state): void => {
        logRunnerState(logger, state)
      }
    })

    logger.info('Agente finalizado. Ciclos concluídos: ' + result.completedCycles + '.')
  } catch (error: unknown) {
    const stage = error instanceof ContinuousResearchStageError ? error.stage : 'CONTINUOUS_RUNNER'

    logger.error(stage, error)

    logger.info('Política E1 aplicada. Nenhuma nova pesquisa será iniciada.')

    process.exitCode = 1

    await terminal.question(
      'O navegador permanecerá aberto para análise. Pressione ENTER para encerrar...'
    )
  } finally {
    if (sigintRegistered) {
      process.off('SIGINT', handleSigint)
    }

    terminal.close()

    await context.close()

    logger.info('Navegador encerrado com segurança.')
  }
}

void main()
