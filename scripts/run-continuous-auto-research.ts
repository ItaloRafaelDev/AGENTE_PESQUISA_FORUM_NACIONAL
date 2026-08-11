import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type BrowserContext, type Page } from 'playwright'
import { ExecutionControl } from '../src/application/agent/execution-control'
import { ContinuousResearchStageError } from '../src/application/agent/continuous-research-stage'
import type { ContinuousResearchState } from '../src/application/research/run-continuous-research'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { CpiQueueFilterController } from '../src/infrastructure/automation/cpi/cpi-queue-filter-controller'
import { createPlaywrightContinuousResearchExecutionAdapter } from '../src/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter'
import { SafeResearchLogger } from '../src/infrastructure/logging/safe-research-logger'
import { resolvePdfOutputDirectory } from '../src/infrastructure/filesystem/pdf-output-directory-resolver'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

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
  logger: SafeResearchLogger,
  pageManager: PlatformPageManager
): Promise<AuthenticatedPages> {
  await pageManager.ensurePages(context)

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

function logRunnerState(logger: SafeResearchLogger, state: ContinuousResearchState): void {
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
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir
  const pdfOutputDirectory = await resolvePdfOutputDirectory({
    preferredDirectory: config.paths.preferredPdfDirectory,
    fallbackDirectory: paths.downloadsDir
  })

  const logger = new SafeResearchLogger()

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const control = new ExecutionControl()

  let sigintReceived = false
  let sigintRegistered = false

  const handleSigint = (): void => {
    if (sigintReceived) {
      return
    }

    sigintReceived = true

    logger.info('Interrupção solicitada. O agente será encerrado no próximo ponto seguro.')

    control.requestStop()
  }

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  try {
    const { cpiPage, deskDataPage } = await ensureAuthenticatedPages(
      context,
      terminal,
      logger,
      new PlatformPageManager(config.platform, config.timing.platformPageNavigationTimeoutMs)
    )

    await cpiPage.bringToFront()

    logger.info('Aplicando filtro 29 na CPI.')

    await new CpiQueueFilterController({
      frameSearchAttempts: config.limits.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.timing.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.timing.actionTimeoutMs,
      settleDelayMs: config.timing.queueFilterSettleDelayMs
    }).applyCriminalForumFilter(cpiPage)

    logger.info('Modo automático contínuo iniciado.')

    logger.info('Pressione Ctrl+C para solicitar encerramento seguro.')

    process.once('SIGINT', handleSigint)

    sigintRegistered = true

    const result = await createPlaywrightContinuousResearchExecutionAdapter({
      context,
      cpiPage,
      deskDataPage,
      config: {
        queueCheckIntervalMs: config.timing.queueCheckIntervalMs,
        cpiSearchPollingIntervalMs: config.timing.cpiSearchPollingIntervalMs,
        actionTimeoutMs: config.timing.actionTimeoutMs,
        readTimeoutMs: config.timing.readTimeoutMs,
        queueFilterSettleDelayMs: config.timing.queueFilterSettleDelayMs,
        cpiFrameSearchAttempts: config.limits.cpiFrameSearchAttempts,
        deskDataPeopleUrl: config.platform.deskDataPeopleUrl,
        navigationTimeoutMs: config.timing.navigationTimeoutMs,
        downloadStartTimeoutMs: config.timing.downloadStartTimeoutMs,
        deskDataFormPollingIntervalMs: config.timing.deskDataFormPollingIntervalMs,
        deskDataResultPollingIntervalMs: config.timing.deskDataResultPollingIntervalMs,
        deskDataHistoryNavigationIntervalMs: config.timing.deskDataHistoryNavigationIntervalMs,
        submitSettleDelayMs: config.timing.submitSettleDelayMs,
        queueReturnDelayMs: config.timing.queueReturnDelayMs,
        cpiIdentitySearchAttempts: config.limits.cpiIdentitySearchAttempts,
        cpiAttachmentSearchAttempts: config.limits.cpiAttachmentSearchAttempts,
        cpiResultSearchAttempts: config.limits.cpiResultSearchAttempts,
        cpiResultStabilizationAttempts: config.limits.cpiResultStabilizationAttempts,
        deskDataFormReadyAttempts: config.limits.deskDataFormReadyAttempts,
        deskDataResultSearchAttempts: config.limits.deskDataResultSearchAttempts,
        deskDataHistoryNavigationAttempts: config.limits.deskDataHistoryNavigationAttempts,
        pdfOutputDirectory
      }
    }).execute({
      token: control.token,
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
