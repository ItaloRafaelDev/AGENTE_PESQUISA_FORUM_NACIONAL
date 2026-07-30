import type { BrowserContext, Frame, Page } from 'playwright'
import {
  CpiFirstResearchOpener,
  type CpiFirstResearchOpenerOptions,
  type OpenedResearchSnapshot
} from '../cpi/cpi-first-research-opener'
import {
  CpiResearchIdentityReader,
  type CpiResearchIdentityReaderOptions,
  type CpiResearchIdentity
} from '../cpi/cpi-research-identity-reader'
import {
  CpiResearchConfirmedSaveController,
  type CpiResearchConfirmedSaveOptions,
  type CpiResearchSavePort,
  type CpiResearchConfirmedSaveResult
} from '../cpi/cpi-research-confirmed-save-controller'
import type { CpiResearchPdfPreparationFrame } from '../cpi/cpi-research-pdf-preparation-workflow'
import {
  CpiResearchResultSaver,
  type CpiResearchResultSaverOptions,
  type CpiResearchSaveFrame
} from '../cpi/cpi-research-result-saver'
import {
  DeskDataNextSearchController,
  type DeskDataNextSearchControllerOptions,
  type DeskDataNextSearchPage,
  type DeskDataNextSearchResult
} from '../deskdata/deskdata-next-search-controller'
import {
  createFullResearchPreparationWorkflow,
  FullResearchPreparationWorkflow,
  type FullResearchPreparationResult
} from './full-research-preparation-workflow'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from './continuous-research-stage'

const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'

const MASKED_CPF_PATTERN = /^\*{3}\.\*{3}\.\*{3}-\d{2}$/

export interface SingleResearchCycleHooks {
  onStage?(stage: ContinuousResearchStage): void

  onIdentity?(maskedCpf: string): void
}

export interface SingleResearchCycleInput {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  signal?: AbortSignal
  hooks?: SingleResearchCycleHooks
}

export interface SingleResearchCycleResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: FullResearchPreparationResult['classification']['classification']
  pdfPath: string
  pdfSizeBytes: number
  saved: true
  confirmationAccepted: true
}

export interface CpiResearchOpenPort {
  openFirst(page: Page): Promise<OpenedResearchSnapshot>
}

export interface CpiResearchIdentityPort {
  read(page: Page): Promise<CpiResearchIdentity>
}

export interface DeskDataNextSearchPort {
  prepare(page: DeskDataNextSearchPage): Promise<DeskDataNextSearchResult>
}

export interface FullResearchPreparationPort {
  prepare(
    context: BrowserContext,
    deskDataPage: Page,
    detailFrame: CpiResearchPdfPreparationFrame,
    identity: CpiResearchIdentity
  ): Promise<FullResearchPreparationResult>
}

export interface CpiConfirmedSavePort {
  saveOnce(page: Page, frame: CpiResearchSaveFrame): Promise<CpiResearchConfirmedSaveResult>
}

export interface CpiQueueReturnPort {
  returnToQueue(page: Page): Promise<void>
}

export interface SingleResearchCycleDependencies {
  opener: CpiResearchOpenPort
  identityReader: CpiResearchIdentityPort
  nextSearchController: DeskDataNextSearchPort
  preparationWorkflow: FullResearchPreparationPort
  saveController: CpiConfirmedSavePort
  queueReturnController: CpiQueueReturnPort
}

export interface ResearchCycleRuntimeConfig {
  navigationTimeoutMs: number
  actionTimeoutMs: number
  readTimeoutMs: number
  downloadStartTimeoutMs: number
  cpiSearchPollingIntervalMs: number
  deskDataFormPollingIntervalMs: number
  deskDataResultPollingIntervalMs: number
  deskDataHistoryNavigationIntervalMs: number
  submitSettleDelayMs: number
  queueReturnDelayMs: number
  cpiIdentitySearchAttempts: number
  cpiAttachmentSearchAttempts: number
  cpiResultSearchAttempts: number
  cpiResultStabilizationAttempts: number
  deskDataFormReadyAttempts: number
  deskDataResultSearchAttempts: number
  deskDataHistoryNavigationAttempts: number
  pdfOutputDirectory: string
}

export interface SingleResearchCycleConfig extends ResearchCycleRuntimeConfig {
  cpiFrameSearchAttempts: number
  deskDataPeopleUrl: string
}

export interface SingleResearchCycleFactorySeam {
  createOpener(options: CpiFirstResearchOpenerOptions): CpiResearchOpenPort
  createIdentityReader(options: CpiResearchIdentityReaderOptions): CpiResearchIdentityPort
  createNextSearchController(options: DeskDataNextSearchControllerOptions): DeskDataNextSearchPort
  createPreparationWorkflow(config: ResearchCycleRuntimeConfig): FullResearchPreparationPort
  createResultSaver(options: CpiResearchResultSaverOptions): CpiResearchSavePort
  createSaveController(
    saver: CpiResearchSavePort,
    options: CpiResearchConfirmedSaveOptions
  ): CpiConfirmedSavePort
  createQueueReturnController(delayMs: number): CpiQueueReturnPort
}

class DefaultCpiQueueReturnController implements CpiQueueReturnPort {
  constructor(private readonly delayMs = 3_000) {}

  async returnToQueue(page: Page): Promise<void> {
    await page.waitForTimeout(this.delayMs)
    await page.bringToFront()

    let pathname: string

    try {
      pathname = new URL(page.url()).pathname.toLowerCase()
    } catch {
      throw new Error('A URL atual da CPI não pôde ser validada.')
    }

    if (pathname !== CPI_QUEUE_PATH) {
      throw new Error('A CPI não retornou para a página da fila.')
    }
  }
}

const DEFAULT_FACTORY_SEAM: SingleResearchCycleFactorySeam = {
  createOpener: (options) => new CpiFirstResearchOpener(options),
  createIdentityReader: (options) => new CpiResearchIdentityReader(options),
  createNextSearchController: (options) => new DeskDataNextSearchController(options),
  createPreparationWorkflow: createFullResearchPreparationWorkflow,
  createResultSaver: (options) => new CpiResearchResultSaver(options),
  createSaveController: (saver, options) => new CpiResearchConfirmedSaveController(saver, options),
  createQueueReturnController: (delayMs) => new DefaultCpiQueueReturnController(delayMs)
}

function toResearchCycleRuntimeConfig(
  config: SingleResearchCycleConfig
): ResearchCycleRuntimeConfig {
  return {
    navigationTimeoutMs: config.navigationTimeoutMs,
    actionTimeoutMs: config.actionTimeoutMs,
    readTimeoutMs: config.readTimeoutMs,
    downloadStartTimeoutMs: config.downloadStartTimeoutMs,
    cpiSearchPollingIntervalMs: config.cpiSearchPollingIntervalMs,
    deskDataFormPollingIntervalMs: config.deskDataFormPollingIntervalMs,
    deskDataResultPollingIntervalMs: config.deskDataResultPollingIntervalMs,
    deskDataHistoryNavigationIntervalMs: config.deskDataHistoryNavigationIntervalMs,
    submitSettleDelayMs: config.submitSettleDelayMs,
    queueReturnDelayMs: config.queueReturnDelayMs,
    cpiIdentitySearchAttempts: config.cpiIdentitySearchAttempts,
    cpiAttachmentSearchAttempts: config.cpiAttachmentSearchAttempts,
    cpiResultSearchAttempts: config.cpiResultSearchAttempts,
    cpiResultStabilizationAttempts: config.cpiResultStabilizationAttempts,
    deskDataFormReadyAttempts: config.deskDataFormReadyAttempts,
    deskDataResultSearchAttempts: config.deskDataResultSearchAttempts,
    deskDataHistoryNavigationAttempts: config.deskDataHistoryNavigationAttempts,
    pdfOutputDirectory: config.pdfOutputDirectory
  }
}

function createDefaultDependencies(
  config?: SingleResearchCycleConfig,
  factorySeam: SingleResearchCycleFactorySeam = DEFAULT_FACTORY_SEAM
): SingleResearchCycleDependencies {
  if (!config) {
    return {
      opener: new CpiFirstResearchOpener(),
      identityReader: new CpiResearchIdentityReader(),
      nextSearchController: new DeskDataNextSearchController(),
      preparationWorkflow: new FullResearchPreparationWorkflow(),
      saveController: new CpiResearchConfirmedSaveController(),
      queueReturnController: new DefaultCpiQueueReturnController()
    }
  }

  const saver = factorySeam.createResultSaver({
    actionTimeoutMs: config.actionTimeoutMs
  })

  return {
    opener: factorySeam.createOpener({
      frameSearchAttempts: config.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.actionTimeoutMs
    }),
    identityReader: factorySeam.createIdentityReader({
      searchAttempts: config.cpiIdentitySearchAttempts,
      searchIntervalMs: config.cpiSearchPollingIntervalMs,
      readTimeoutMs: config.readTimeoutMs
    }),
    nextSearchController: factorySeam.createNextSearchController({
      peopleUrl: config.deskDataPeopleUrl,
      formReadyAttempts: config.deskDataFormReadyAttempts,
      pollingIntervalMs: config.deskDataFormPollingIntervalMs,
      navigationTimeoutMs: config.navigationTimeoutMs,
      actionTimeoutMs: config.actionTimeoutMs,
      readTimeoutMs: config.readTimeoutMs
    }),
    preparationWorkflow: factorySeam.createPreparationWorkflow(
      toResearchCycleRuntimeConfig(config)
    ),
    saveController: factorySeam.createSaveController(saver, {
      dialogTimeoutMs: config.actionTimeoutMs
    }),
    queueReturnController: factorySeam.createQueueReturnController(config.queueReturnDelayMs)
  }
}

export class SingleResearchCycle {
  constructor(
    private readonly dependencies: SingleResearchCycleDependencies = createDefaultDependencies()
  ) {}

  async run(input: SingleResearchCycleInput): Promise<SingleResearchCycleResult> {
    this.assertCanStart(input.signal)

    await this.runStage(
      'OPENING_CPI_RESEARCH',
      async () => {
        await this.dependencies.opener.openFirst(input.cpiPage)
      },
      input.hooks
    )

    const identity = await this.runStage(
      'READING_CPI_IDENTITY',
      () => this.dependencies.identityReader.read(input.cpiPage),
      input.hooks
    )

    const detailFrame = await this.runStage(
      'READING_CPI_IDENTITY',
      async () => this.findDetailFrame(input.cpiPage, identity.detailFramePath),
      input.hooks
    )

    await this.runStage(
      'PREPARING_DESKDATA',
      () => this.dependencies.nextSearchController.prepare(input.deskDataPage),
      input.hooks
    )

    const preparation = await this.runStage(
      'PREPARING_CPI_RESULT',
      () =>
        this.dependencies.preparationWorkflow.prepare(
          input.context,
          input.deskDataPage,
          detailFrame,
          identity
        ),
      input.hooks
    )

    this.validatePreparation(preparation)

    this.notifyMaskedIdentity(preparation.maskedCpf, input.hooks)

    const saveResult = await this.runStage(
      'SAVING_CPI',
      () => this.dependencies.saveController.saveOnce(input.cpiPage, preparation.detailFrame),
      input.hooks
    )

    if (!saveResult.saved) {
      throw new ContinuousResearchStageError(
        'SAVING_CPI',
        new Error('A gravação da pesquisa não foi confirmada.')
      )
    }

    await this.runStage(
      'PREPARING_NEXT_SEARCH',
      async () => {
        await this.closeHistoricalDeskDataResult(preparation, input.deskDataPage)

        return this.dependencies.nextSearchController.prepare(input.deskDataPage)
      },
      input.hooks
    )

    await this.runStage(
      'RETURNING_TO_QUEUE',
      () => this.dependencies.queueReturnController.returnToQueue(input.cpiPage),
      input.hooks
    )

    return {
      maskedCpf: preparation.maskedCpf,
      selectedDatasetCount: preparation.selectedDatasetCount,
      classification: preparation.classification.classification,
      pdfPath: preparation.pdf.filePath,
      pdfSizeBytes: preparation.pdf.sizeBytes,
      saved: true,
      confirmationAccepted: saveResult.confirmationAccepted
    }
  }

  private async closeHistoricalDeskDataResult(
    preparation: FullResearchPreparationResult,
    mainPage: Page
  ): Promise<void> {
    if (!preparation.closeDeskDataResultPageAfterSave) {
      return
    }

    const resultPage = preparation.deskDataResultPage

    if (!resultPage) {
      throw new Error('A aba historica da DeskData nao foi preservada para fechamento.')
    }

    if (resultPage === mainPage) {
      throw new Error('A aba principal da DeskData nao pode ser fechada como resultado historico.')
    }

    if (!resultPage.isClosed()) {
      await resultPage.close({
        runBeforeUnload: false
      })
    }
  }
  private assertCanStart(signal: AbortSignal | undefined): void {
    if (!signal?.aborted) {
      return
    }

    throw new ContinuousResearchStageError(
      'OPENING_CPI_RESEARCH',
      new Error('A execução foi interrompida antes do início da pesquisa.')
    )
  }

  private findDetailFrame(page: Page, expectedPath: string): CpiResearchPdfPreparationFrame {
    const normalizedExpectedPath = expectedPath.toLowerCase()

    const detailFrames = page.frames().filter((frame: Frame) => {
      try {
        return new URL(frame.url()).pathname.toLowerCase() === normalizedExpectedPath
      } catch {
        return false
      }
    })

    if (detailFrames.length !== 1) {
      throw new Error(
        'O formulário interno da pesquisa deveria possuir exatamente um frame. Encontrados: ' +
          detailFrames.length
      )
    }

    return detailFrames[0] as CpiResearchPdfPreparationFrame
  }

  private validatePreparation(preparation: FullResearchPreparationResult): void {
    if (!preparation.cpi.attachment.attached) {
      throw new ContinuousResearchStageError(
        'ATTACHING_PDF',
        new Error('O PDF não foi confirmado no campo de anexo da CPI.')
      )
    }

    if (preparation.pdf.sizeBytes < 1) {
      throw new ContinuousResearchStageError(
        'DOWNLOADING_PDF',
        new Error('O PDF da DeskData possui tamanho inválido.')
      )
    }

    if (
      preparation.cpi.prepared.researcherLabel !== 'Desk Data' ||
      preparation.cpi.prepared.primaryResearcherLabel !== 'Desk Data' ||
      preparation.cpi.prepared.statusLabel !== 'Respondida'
    ) {
      throw new ContinuousResearchStageError(
        'PREPARING_CPI_RESULT',
        new Error('Os campos obrigatórios da CPI não foram confirmados.')
      )
    }
  }

  private notifyMaskedIdentity(
    maskedCpf: string,
    hooks: SingleResearchCycleHooks | undefined
  ): void {
    if (!MASKED_CPF_PATTERN.test(maskedCpf)) {
      throw new ContinuousResearchStageError(
        'PREPARING_CPI_RESULT',
        new Error('O CPF produzido pelo fluxo não está mascarado.')
      )
    }

    hooks?.onIdentity?.(maskedCpf)
  }

  private async runStage<T>(
    stage: ContinuousResearchStage,
    operation: () => Promise<T>,
    hooks: SingleResearchCycleHooks | undefined
  ): Promise<T> {
    try {
      hooks?.onStage?.(stage)

      return await operation()
    } catch (error: unknown) {
      if (error instanceof ContinuousResearchStageError) {
        throw error
      }

      throw new ContinuousResearchStageError(stage, error)
    }
  }
}

export function createSingleResearchCycle(
  config: SingleResearchCycleConfig,
  factorySeam: SingleResearchCycleFactorySeam = DEFAULT_FACTORY_SEAM
): SingleResearchCycle {
  return new SingleResearchCycle(createDefaultDependencies(config, factorySeam))
}
