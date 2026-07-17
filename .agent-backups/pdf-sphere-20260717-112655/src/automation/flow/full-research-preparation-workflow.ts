import type { BrowserContext, Page } from 'playwright'
import type {
  DeskDataClassification,
  DeskDataProcessRecord,
  DeskDataResult
} from '../../domain/research/deskdata-process-record'
import { classifyDeskDataSpheres } from '../../domain/research/classify-deskdata-spheres'
import type { ResearchClassification } from '../../domain/research/research-classification'
import type { CpiResearchIdentity } from '../cpi/cpi-research-identity-reader'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfPreparationFrame,
  type CpiResearchPdfPreparationResult
} from '../cpi/cpi-research-pdf-preparation-workflow'
import { DeskDataCpfFormController } from '../deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import {
  DeskDataPdfDownloadController,
  type DeskDataPdfDownloadResult
} from '../deskdata/deskdata-pdf-download-controller'
import { DeskDataProcessCollector } from '../deskdata/deskdata-process-collector'
import { DeskDataResultReadyWaiter } from '../deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchSubmitController } from '../deskdata/deskdata-search-submit-controller'
import { PlaywrightDeskDataProcessPageAdapter } from '../deskdata/playwright-deskdata-process-page-adapter'

export interface DeskDataProcessCollectionPort {
  collect(): Promise<DeskDataProcessRecord[]>
}

export type DeskDataProcessCollectorFactory = (page: Page) => DeskDataProcessCollectionPort

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
  resultReady: Pick<DeskDataResultReadyWaiter, 'waitUntilReady'>
  processCollectorFactory: DeskDataProcessCollectorFactory
  pdfDownloader: Pick<DeskDataPdfDownloadController, 'downloadOnce'>
  cpiPreparation: Pick<CpiResearchPdfPreparationWorkflow, 'prepareWithAttachment'>
}

export interface FullResearchPreparationResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: FullResearchPreparationClassification
  pdf: DeskDataPdfDownloadResult
  cpi: CpiResearchPdfPreparationResult
  detailFrame: CpiResearchPdfPreparationFrame
}

export function mapDeskDataResultToResearchClassification(
  result: DeskDataResult
): CpiDeskDataClassification {
  return result === 'SIM_CONSTA_RESTRICAO' ? 'CONSTA_RESTRICAO' : 'HA_INFORMACOES'
}

function createDefaultDependencies(): FullResearchPreparationDependencies {
  return {
    cpfForm: new DeskDataCpfFormController(),
    dataset: new DeskDataDatasetController(),
    submit: new DeskDataSearchSubmitController(),
    resultReady: new DeskDataResultReadyWaiter(),
    processCollectorFactory: (page) =>
      new DeskDataProcessCollector(new PlaywrightDeskDataProcessPageAdapter(page)),
    pdfDownloader: new DeskDataPdfDownloadController(),
    cpiPreparation: new CpiResearchPdfPreparationWorkflow()
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

    await this.dependencies.resultReady.waitUntilReady(deskDataPage)

    const processes = await this.dependencies.processCollectorFactory(deskDataPage).collect()

    const sphereClassification = classifyDeskDataSpheres(processes)

    const classification: FullResearchPreparationClassification = {
      ...sphereClassification,
      classification: mapDeskDataResultToResearchClassification(sphereClassification.result)
    }

    const pdf = await this.dependencies.pdfDownloader.downloadOnce(context, deskDataPage)

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
      detailFrame
    }
  }
}
