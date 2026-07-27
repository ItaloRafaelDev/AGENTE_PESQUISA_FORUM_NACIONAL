import type { BrowserContext, Frame, Page } from 'playwright'
import {
  CpiFirstResearchOpener,
  type OpenedResearchSnapshot
} from '../cpi/cpi-first-research-opener'
import {
  CpiResearchIdentityReader,
  type CpiResearchIdentity
} from '../cpi/cpi-research-identity-reader'
import {
  CpiResearchConfirmedSaveController,
  type CpiResearchConfirmedSaveResult
} from '../cpi/cpi-research-confirmed-save-controller'
import type { CpiResearchPdfPreparationFrame } from '../cpi/cpi-research-pdf-preparation-workflow'
import type { CpiResearchSaveFrame } from '../cpi/cpi-research-result-saver'
import {
  DeskDataNextSearchController,
  type DeskDataNextSearchPage,
  type DeskDataNextSearchResult
} from '../deskdata/deskdata-next-search-controller'
import {
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

class DefaultCpiQueueReturnController implements CpiQueueReturnPort {
  async returnToQueue(page: Page): Promise<void> {
    await page.waitForTimeout(3_000)
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

function createDefaultDependencies(): SingleResearchCycleDependencies {
  return {
    opener: new CpiFirstResearchOpener(),
    identityReader: new CpiResearchIdentityReader(),
    nextSearchController: new DeskDataNextSearchController(),
    preparationWorkflow: new FullResearchPreparationWorkflow(),
    saveController: new CpiResearchConfirmedSaveController(),
    queueReturnController: new DefaultCpiQueueReturnController()
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
