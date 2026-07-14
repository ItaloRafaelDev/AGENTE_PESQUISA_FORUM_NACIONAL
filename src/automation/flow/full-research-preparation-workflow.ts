import type { BrowserContext, Page } from 'playwright'
import type { CpiResearchIdentity } from '../cpi/cpi-research-identity-reader'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfPreparationFrame,
  type CpiResearchPdfPreparationResult
} from '../cpi/cpi-research-pdf-preparation-workflow'
import { DeskDataCpfFormController } from '../deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import {
  DeskDataInspectionClassifier,
  type DeskDataInspectionClassification
} from '../deskdata/deskdata-inspection-classifier'
import { DeskDataLiveResultCapture } from '../deskdata/deskdata-live-result-capture'
import {
  DeskDataPdfDownloadController,
  type DeskDataPdfDownloadResult
} from '../deskdata/deskdata-pdf-download-controller'
import { DeskDataResultReadyWaiter } from '../deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchSubmitController } from '../deskdata/deskdata-search-submit-controller'

export interface FullResearchPreparationDependencies {
  cpfForm: Pick<DeskDataCpfFormController, 'fillCpf'>
  dataset: Pick<DeskDataDatasetController, 'applyApprovedDatasets'>
  submit: Pick<DeskDataSearchSubmitController, 'submitOnce'>
  resultReady: Pick<DeskDataResultReadyWaiter, 'waitUntilReady'>
  resultCapture: Pick<DeskDataLiveResultCapture, 'capture'>
  classifier: Pick<DeskDataInspectionClassifier, 'classify'>
  pdfDownloader: Pick<DeskDataPdfDownloadController, 'downloadOnce'>
  cpiPreparation: Pick<CpiResearchPdfPreparationWorkflow, 'prepareWithAttachment'>
}

export interface FullResearchPreparationResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: DeskDataInspectionClassification
  pdf: DeskDataPdfDownloadResult
  cpi: CpiResearchPdfPreparationResult
  detailFrame: CpiResearchPdfPreparationFrame
}

function createDefaultDependencies(): FullResearchPreparationDependencies {
  return {
    cpfForm: new DeskDataCpfFormController(),
    dataset: new DeskDataDatasetController(),
    submit: new DeskDataSearchSubmitController(),
    resultReady: new DeskDataResultReadyWaiter(),
    resultCapture: new DeskDataLiveResultCapture(),
    classifier: new DeskDataInspectionClassifier(),
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

    const inspection = await this.dependencies.resultCapture.capture(deskDataPage)

    const classification = this.dependencies.classifier.classify(inspection)

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
