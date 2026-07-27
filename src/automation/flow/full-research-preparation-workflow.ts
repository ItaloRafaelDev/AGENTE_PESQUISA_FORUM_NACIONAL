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
  type CpiResearchPdfPreparationFrame,
  type CpiResearchPdfPreparationResult
} from '../cpi/cpi-research-pdf-preparation-workflow'
import { DeskDataCpfFormController } from '../deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import {
  DeskDataPdfDownloadController,
  type DeskDataPdfDownloadResult
} from '../deskdata/deskdata-pdf-download-controller'
import { DeskDataPdfProcessReader } from '../deskdata/deskdata-pdf-process-reader'
import { DeskDataResultReadyWaiter } from '../deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchResultPageResolver } from '../deskdata/deskdata-search-result-page-resolver'
import { DeskDataSearchSubmitController } from '../deskdata/deskdata-search-submit-controller'

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

function createDefaultDependencies(): FullResearchPreparationDependencies {
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
