import type {
  CpiResearchPreparationPort,
  DeskDataResearchPort,
  PreparedResearch,
  ResearchIdentity,
  ResearchReportPort
} from '@/application/ports/research-preparation-ports'
import type { ResearchPreparationPort } from '@/application/ports/research-cycle-ports'
import { PrepareResearch } from '@/application/research/prepare-research'
import type { BrowserContext, Page } from 'playwright'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfPreparationFrame
} from '../cpi/cpi-research-pdf-preparation-workflow'
import { CpiResearchPdfAttachmentController } from '../cpi/cpi-research-pdf-attachment-controller'
import { CpiResearchResultController } from '../cpi/cpi-research-result-controller'
import { CpiResearchPersonalDetailsReader } from '../cpi/cpi-research-personal-details-reader'
import { DeskDataMinorSearchController } from '../deskdata/deskdata-minor-search-controller'
import { DeskDataCpfFormController } from '../deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../deskdata/deskdata-dataset-controller'
import { DeskDataResultReadyWaiter } from '../deskdata/deskdata-result-ready-waiter'
import { DeskDataSearchResultPageResolver } from '../deskdata/deskdata-search-result-page-resolver'
import { DeskDataSearchSubmitController } from '../deskdata/deskdata-search-submit-controller'
import { DeskDataPdfDownloadController } from '../pdf/deskdata-pdf-download-controller'
import { DeskDataPdfProcessReader } from '../pdf/deskdata-pdf-process-reader'
import { DeskDataPdfReportAdapter } from '../pdf/deskdata-pdf-report-adapter'
import { PlaywrightCpiPreparationAdapter } from './playwright-cpi-preparation-adapter'
import { PlaywrightDeskDataResearchAdapter } from './playwright-deskdata-research-adapter'
import type { PlaywrightAutomationConfig } from './playwright-automation-config'
import {
  PlaywrightResearchPreparationState,
  type PlaywrightResolvedDeskDataResultState
} from './playwright-research-preparation-state'

export class PlaywrightResearchPreparationAdapter implements ResearchPreparationPort {
  constructor(
    private readonly deskData: DeskDataResearchPort,
    private readonly report: ResearchReportPort,
    private readonly cpi: CpiResearchPreparationPort
  ) {}

  execute(identity: ResearchIdentity): Promise<PreparedResearch> {
    return new PrepareResearch({
      deskData: this.deskData,
      report: this.report,
      cpi: this.cpi
    }).execute(identity)
  }
}

export interface PlaywrightResearchPreparationAdapterInput {
  context: BrowserContext
  deskDataPage: Page
  detailFrame: CpiResearchPdfPreparationFrame
  config: PlaywrightAutomationConfig
}

export function createPlaywrightResearchPreparationAdapter(input: {
  context: BrowserContext
  deskDataPage: Page
  detailFrame: CpiResearchPdfPreparationFrame
  config: PlaywrightAutomationConfig
}): PlaywrightResearchPreparationAdapter {
  return createPlaywrightResearchPreparationAdapterWithState({
    ...input,
    state: new PlaywrightResearchPreparationState()
  })
}

export function createPlaywrightResearchPreparationAdapterWithState(
  input: PlaywrightResearchPreparationAdapterInput & {
    state: PlaywrightResolvedDeskDataResultState
  }
): PlaywrightResearchPreparationAdapter {
  const deskData = new PlaywrightDeskDataResearchAdapter(
    input.deskDataPage,
    {
      cpfForm: new DeskDataCpfFormController({
        actionTimeoutMs: input.config.actionTimeoutMs,
        readTimeoutMs: input.config.readTimeoutMs
      }),
      dataset: new DeskDataDatasetController(),
      minorSearch: new DeskDataMinorSearchController(
        {
          readDetails: (cpf) =>
            new CpiResearchPersonalDetailsReader(input.config.readTimeoutMs).read(
              input.detailFrame,
              cpf
            ),
          dataset: new DeskDataDatasetController(),
          submit: new DeskDataSearchSubmitController({
            actionTimeoutMs: input.config.actionTimeoutMs,
            navigationTimeoutMs: input.config.navigationTimeoutMs,
            submitSettleDelayMs: input.config.submitSettleDelayMs
          })
        },
        input.config.actionTimeoutMs
      ),
      submit: new DeskDataSearchSubmitController({
        actionTimeoutMs: input.config.actionTimeoutMs,
        navigationTimeoutMs: input.config.navigationTimeoutMs,
        submitSettleDelayMs: input.config.submitSettleDelayMs
      }),
      resultPageResolver: new DeskDataSearchResultPageResolver({
        searchAttempts: input.config.deskDataResultSearchAttempts,
        searchIntervalMs: input.config.deskDataResultPollingIntervalMs,
        navigationTimeoutMs: input.config.navigationTimeoutMs,
        historyNavigationAttempts: input.config.deskDataHistoryNavigationAttempts,
        historyNavigationIntervalMs: input.config.deskDataHistoryNavigationIntervalMs,
        actionTimeoutMs: input.config.actionTimeoutMs,
        confirmationSettleDelayMs: input.config.submitSettleDelayMs
      }),
      resultReady: new DeskDataResultReadyWaiter({
        searchAttempts: input.config.deskDataResultSearchAttempts,
        searchIntervalMs: input.config.deskDataResultPollingIntervalMs
      })
    },
    input.state
  )
  const report = new DeskDataPdfReportAdapter(
    input.context,
    () => input.state.requireResolvedResult().resultPage,
    new DeskDataPdfDownloadController({
      outputDirectory: input.config.pdfOutputDirectory,
      downloadTimeoutMs: input.config.downloadStartTimeoutMs,
      actionTimeoutMs: input.config.actionTimeoutMs
    }),
    new DeskDataPdfProcessReader()
  )
  const cpi = new PlaywrightCpiPreparationAdapter(
    input.detailFrame,
    new CpiResearchPdfPreparationWorkflow(
      new CpiResearchResultController({
        resultSearchAttempts: input.config.cpiResultSearchAttempts,
        resultSearchIntervalMs: input.config.cpiSearchPollingIntervalMs,
        stabilizationAttempts: input.config.cpiResultStabilizationAttempts,
        readTimeoutMs: input.config.readTimeoutMs
      }),
      new CpiResearchPdfAttachmentController({
        controlSearchAttempts: input.config.cpiAttachmentSearchAttempts,
        controlSearchIntervalMs: input.config.cpiSearchPollingIntervalMs
      })
    )
  )

  return new PlaywrightResearchPreparationAdapter(deskData, report, cpi)
}
