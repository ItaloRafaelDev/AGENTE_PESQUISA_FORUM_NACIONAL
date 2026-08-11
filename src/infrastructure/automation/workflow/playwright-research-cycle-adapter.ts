import type { ExecutionToken } from '@/application/agent/execution-control'
import { ContinuousResearchStageError } from '@/application/agent/continuous-research-stage'
import { ApplicationError } from '@/application/errors/application-error'
import type { ResearchCyclePort } from '@/application/ports/continuous-research-ports'
import type {
  ResearchCycleHooks,
  ResearchPreparationPort,
  RunResearchCycleDependencies
} from '@/application/ports/research-cycle-ports'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'
import { RunResearchCycle } from '@/application/research/run-research-cycle'
import type { BrowserContext, Page } from 'playwright'
import { CpiFirstResearchOpener } from '../cpi/cpi-first-research-opener'
import { CpiResearchConfirmedSaveController } from '../cpi/cpi-research-confirmed-save-controller'
import { CpiResearchIdentityReader } from '../cpi/cpi-research-identity-reader'
import { CpiResearchResultSaver } from '../cpi/cpi-research-result-saver'
import { DeskDataNextSearchController } from '../deskdata/deskdata-next-search-controller'
import type { PlaywrightAutomationConfig } from './playwright-automation-config'
import {
  PlaywrightCpiQueueReturnController,
  PlaywrightCpiResearchCycleAdapter
} from './playwright-cpi-research-cycle-adapter'
import { PlaywrightDeskDataCycleAdapter } from './playwright-deskdata-cycle-adapter'
import {
  createPlaywrightResearchPreparationAdapterWithState,
  type PlaywrightResearchPreparationAdapterInput
} from './playwright-research-preparation-adapter'
import { PlaywrightResearchCycleState } from './playwright-research-cycle-state'
import { PlaywrightResearchPreparationState } from './playwright-research-preparation-state'

export interface PlaywrightResearchCycleCleanup {
  clear(): void
}

export class PlaywrightResearchCycleAdapter implements ResearchCyclePort {
  constructor(
    private readonly dependencies: RunResearchCycleDependencies,
    private readonly cleanup?: PlaywrightResearchCycleCleanup
  ) {}

  async execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult> {
    try {
      return await new RunResearchCycle(this.dependencies).execute(input)
    } catch (error: unknown) {
      if (error instanceof ApplicationError && error.stage && error.stage !== 'CONTINUOUS_RUNNER') {
        throw ContinuousResearchStageError.fromPublicMessage(error.stage, error.message)
      }

      throw error
    } finally {
      this.cleanup?.clear()
    }
  }
}

export function createPlaywrightResearchCycleAdapter(input: {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  config: PlaywrightAutomationConfig
}): PlaywrightResearchCycleAdapter {
  const cycleState = new PlaywrightResearchCycleState()
  const preparationState = new PlaywrightResearchPreparationState()
  const createPreparation = (
    detailFrame: PlaywrightResearchPreparationAdapterInput['detailFrame']
  ): ResearchPreparationPort =>
    createPlaywrightResearchPreparationAdapterWithState({
      context: input.context,
      deskDataPage: input.deskDataPage,
      detailFrame,
      config: input.config,
      state: preparationState
    })
  const cpi = new PlaywrightCpiResearchCycleAdapter(
    input.cpiPage,
    {
      opener: new CpiFirstResearchOpener({
        frameSearchAttempts: input.config.cpiFrameSearchAttempts,
        frameSearchIntervalMs: input.config.cpiSearchPollingIntervalMs,
        actionTimeoutMs: input.config.actionTimeoutMs
      }),
      identityReader: new CpiResearchIdentityReader({
        searchAttempts: input.config.cpiIdentitySearchAttempts,
        searchIntervalMs: input.config.cpiSearchPollingIntervalMs,
        readTimeoutMs: input.config.readTimeoutMs
      }),
      saveController: new CpiResearchConfirmedSaveController(
        new CpiResearchResultSaver({ actionTimeoutMs: input.config.actionTimeoutMs }),
        { dialogTimeoutMs: input.config.actionTimeoutMs }
      ),
      queueReturnController: new PlaywrightCpiQueueReturnController(
        input.config.queueReturnDelayMs
      ),
      createPreparation
    },
    cycleState
  )
  const deskData = new PlaywrightDeskDataCycleAdapter(
    input.deskDataPage,
    {
      prepare: new DeskDataNextSearchController({
        peopleUrl: input.config.deskDataPeopleUrl,
        formReadyAttempts: input.config.deskDataFormReadyAttempts,
        pollingIntervalMs: input.config.deskDataFormPollingIntervalMs,
        navigationTimeoutMs: input.config.navigationTimeoutMs,
        actionTimeoutMs: input.config.actionTimeoutMs,
        readTimeoutMs: input.config.readTimeoutMs
      })
    },
    preparationState
  )
  const preparation: ResearchPreparationPort = {
    execute: (identity) => cycleState.requirePreparation().execute(identity)
  }

  return new PlaywrightResearchCycleAdapter(
    { cpi, deskData, preparation },
    {
      clear: () => {
        cycleState.clear()
        preparationState.clearResolvedResult()
      }
    }
  )
}
