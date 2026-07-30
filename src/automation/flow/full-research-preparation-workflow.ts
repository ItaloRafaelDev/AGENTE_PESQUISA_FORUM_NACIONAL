import type { BrowserContext, Page } from 'playwright'
import type {
  DeskDataClassification,
  DeskDataResult
} from '../../domain/research/deskdata-process-record'
import { classifyDeskDataSpheres } from '../../domain/research/classify-deskdata-spheres'
import type { ResearchClassification } from '../../domain/research/research-classification'
import type { CpiResearchIdentity } from '../cpi/cpi-research-identity-reader'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfAttachmentPort,
  type CpiResearchPdfPreparationFrame,
  type CpiResearchPdfPreparationResult,
  type CpiResearchResultPreparationPort
} from '../cpi/cpi-research-pdf-preparation-workflow'
import {
  CpiResearchPdfAttachmentController,
  type CpiResearchPdfAttachmentControllerOptions
} from '../cpi/cpi-research-pdf-attachment-controller'
import {
  CpiResearchResultController,
  type CpiResearchResultControllerOptions
} from '../cpi/cpi-research-result-controller'
import {
  DeskDataCpfFormController,
  type DeskDataCpfFormControllerOptions
} from '../deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import {
  DeskDataPdfDownloadController,
  type DeskDataPdfDownloadControllerOptions,
  type DeskDataPdfDownloadResult
} from '../deskdata/deskdata-pdf-download-controller'
import { DeskDataPdfProcessReader } from '../deskdata/deskdata-pdf-process-reader'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyWaiterOptions
} from '../deskdata/deskdata-result-ready-waiter'
import {
  DeskDataSearchResultPageResolver,
  type DeskDataSearchResultPageResolverOptions
} from '../deskdata/deskdata-search-result-page-resolver'
import {
  DeskDataSearchSubmitController,
  type DeskDataSearchSubmitControllerOptions
} from '../deskdata/deskdata-search-submit-controller'
import type { ResearchCycleRuntimeConfig } from './single-research-cycle'

export type CpiDeskDataClassification = Extract<
  ResearchClassification,
  'CONSTA_RESTRICAO' | 'HA_INFORMACOES'
>

export type FullResearchPreparationClassification = DeskDataClassification & {
  classification: CpiDeskDataClassification
}

export interface FullResearchPreparationDependencies {
  cpfForm: Pick<DeskDataCpfFormController, 'fillCpf'>
  dataset: Pick<DeskDataDatasetController, 'applyApprovedDatasets'>
  submit: Pick<DeskDataSearchSubmitController, 'submitOnce'>
  resultPageResolver: Pick<DeskDataSearchResultPageResolver, 'resolve'>
  resultReady: Pick<DeskDataResultReadyWaiter, 'waitUntilReady'>
  pdfDownloader: Pick<DeskDataPdfDownloadController, 'downloadOnce'>
  pdfProcessReader: Pick<DeskDataPdfProcessReader, 'read'>
  cpiPreparation: Pick<CpiResearchPdfPreparationWorkflow, 'prepareWithAttachment'>
}

export interface FullResearchPreparationFactorySeam {
  createCpfForm(
    options: DeskDataCpfFormControllerOptions
  ): FullResearchPreparationDependencies['cpfForm']
  createSubmit(
    options: DeskDataSearchSubmitControllerOptions
  ): FullResearchPreparationDependencies['submit']
  createResultPageResolver(
    options: DeskDataSearchResultPageResolverOptions
  ): FullResearchPreparationDependencies['resultPageResolver']
  createResultReady(
    options: DeskDataResultReadyWaiterOptions
  ): FullResearchPreparationDependencies['resultReady']
  createPdfDownloader(
    options: DeskDataPdfDownloadControllerOptions
  ): FullResearchPreparationDependencies['pdfDownloader']
  createCpiResultController(
    options: CpiResearchResultControllerOptions
  ): CpiResearchResultPreparationPort
  createCpiAttachmentController(
    options: CpiResearchPdfAttachmentControllerOptions
  ): CpiResearchPdfAttachmentPort
}

export interface FullResearchPreparationResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: FullResearchPreparationClassification
  pdf: DeskDataPdfDownloadResult
  cpi: CpiResearchPdfPreparationResult
  detailFrame: CpiResearchPdfPreparationFrame
  deskDataResultPage?: Page
  closeDeskDataResultPageAfterSave?: boolean
}

export function mapDeskDataResultToResearchClassification(
  result: DeskDataResult
): CpiDeskDataClassification {
  return result === 'SIM_CONSTA_RESTRICAO' ? 'CONSTA_RESTRICAO' : 'HA_INFORMACOES'
}

const DEFAULT_FACTORY_SEAM: FullResearchPreparationFactorySeam = {
  createCpfForm: (options) => new DeskDataCpfFormController(options),
  createSubmit: (options) => new DeskDataSearchSubmitController(options),
  createResultPageResolver: (options) => new DeskDataSearchResultPageResolver(options),
  createResultReady: (options) => new DeskDataResultReadyWaiter(options),
  createPdfDownloader: (options) => new DeskDataPdfDownloadController(options),
  createCpiResultController: (options) => new CpiResearchResultController(options),
  createCpiAttachmentController: (options) => new CpiResearchPdfAttachmentController(options)
}

function createDefaultDependencies(
  config?: ResearchCycleRuntimeConfig,
  factorySeam: FullResearchPreparationFactorySeam = DEFAULT_FACTORY_SEAM
): FullResearchPreparationDependencies {
  if (!config) {
    return {
      cpfForm: new DeskDataCpfFormController(),
      dataset: new DeskDataDatasetController(),
      submit: new DeskDataSearchSubmitController(),
      resultPageResolver: new DeskDataSearchResultPageResolver(),
      resultReady: new DeskDataResultReadyWaiter(),
      pdfDownloader: new DeskDataPdfDownloadController(),
      pdfProcessReader: new DeskDataPdfProcessReader(),
      cpiPreparation: new CpiResearchPdfPreparationWorkflow()
    }
  }

  return {
    cpfForm: factorySeam.createCpfForm({
      actionTimeoutMs: config.actionTimeoutMs,
      readTimeoutMs: config.readTimeoutMs
    }),
    dataset: new DeskDataDatasetController(),
    submit: factorySeam.createSubmit({
      actionTimeoutMs: config.actionTimeoutMs,
      navigationTimeoutMs: config.navigationTimeoutMs,
      submitSettleDelayMs: config.submitSettleDelayMs
    }),
    resultPageResolver: factorySeam.createResultPageResolver({
      searchAttempts: config.deskDataResultSearchAttempts,
      searchIntervalMs: config.deskDataResultPollingIntervalMs,
      navigationTimeoutMs: config.navigationTimeoutMs,
      historyNavigationAttempts: config.deskDataHistoryNavigationAttempts,
      historyNavigationIntervalMs: config.deskDataHistoryNavigationIntervalMs,
      actionTimeoutMs: config.actionTimeoutMs
    }),
    resultReady: factorySeam.createResultReady({
      searchAttempts: config.deskDataResultSearchAttempts,
      searchIntervalMs: config.deskDataResultPollingIntervalMs
    }),
    pdfDownloader: factorySeam.createPdfDownloader({
      outputDirectory: config.pdfOutputDirectory,
      downloadTimeoutMs: config.downloadStartTimeoutMs,
      actionTimeoutMs: config.actionTimeoutMs
    }),
    pdfProcessReader: new DeskDataPdfProcessReader(),
    cpiPreparation: new CpiResearchPdfPreparationWorkflow(
      factorySeam.createCpiResultController({
        resultSearchAttempts: config.cpiResultSearchAttempts,
        resultSearchIntervalMs: config.cpiSearchPollingIntervalMs,
        stabilizationAttempts: config.cpiResultStabilizationAttempts,
        readTimeoutMs: config.readTimeoutMs
      }),
      factorySeam.createCpiAttachmentController({
        controlSearchAttempts: config.cpiAttachmentSearchAttempts,
        controlSearchIntervalMs: config.cpiSearchPollingIntervalMs
      })
    )
  }
}

export class FullResearchPreparationWorkflow {
  constructor(
    private readonly dependencies: FullResearchPreparationDependencies = createDefaultDependencies()
  ) {}

  async prepare(
    context: BrowserContext,
    deskDataPage: Page,
    detailFrame: CpiResearchPdfPreparationFrame,
    identity: CpiResearchIdentity
  ): Promise<FullResearchPreparationResult> {
    await this.dependencies.cpfForm.fillCpf(deskDataPage, identity.cpf)

    const datasets = await this.dependencies.dataset.applyApprovedDatasets(deskDataPage)

    await this.dependencies.submit.submitOnce(deskDataPage)

    const resolvedResult = await this.dependencies.resultPageResolver.resolve(
      deskDataPage,
      identity.cpf
    )

    const resultPage = resolvedResult.page

    await this.dependencies.resultReady.waitUntilReady(resultPage)

    const pdf = await this.dependencies.pdfDownloader.downloadOnce(context, resultPage)

    const processes = await this.dependencies.pdfProcessReader.read(pdf.filePath)

    const sphereClassification = classifyDeskDataSpheres(processes)

    const classification: FullResearchPreparationClassification = {
      ...sphereClassification,
      classification: mapDeskDataResultToResearchClassification(sphereClassification.result)
    }

    const cpi = await this.dependencies.cpiPreparation.prepareWithAttachment(
      detailFrame,
      classification.classification,
      pdf.filePath
    )

    return {
      maskedCpf: identity.maskedCpf,
      selectedDatasetCount: datasets.selectedCount,
      classification,
      pdf,
      cpi,
      detailFrame,
      deskDataResultPage: resultPage,
      closeDeskDataResultPageAfterSave: resolvedResult.closeAfterConfirmedSave
    }
  }
}

export function createFullResearchPreparationWorkflow(
  config: ResearchCycleRuntimeConfig,
  factorySeam: FullResearchPreparationFactorySeam = DEFAULT_FACTORY_SEAM
): FullResearchPreparationWorkflow {
  return new FullResearchPreparationWorkflow(createDefaultDependencies(config, factorySeam))
}
