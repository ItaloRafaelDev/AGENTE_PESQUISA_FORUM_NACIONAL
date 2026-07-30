import type { BrowserContext, Page } from 'playwright'
import {
  CpiQueueAvailabilityReader,
  type CpiQueueAvailabilityState
} from '../cpi/cpi-queue-availability'
import {
  CpiQueueFilterController,
  type CpiQueueFilterControllerOptions
} from '../cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  NodeQueueDelay,
  type CpiQueueAvailabilitySource,
  type CpiQueueDelay,
  type CpiQueueMonitorOptions,
  type CpiQueueMonitorResult,
  type CpiQueueRefresher
} from '../cpi/cpi-queue-monitor'
import type { ContinuousResearchStage } from './continuous-research-stage'
import {
  createSingleResearchCycle,
  type SingleResearchCycleConfig,
  type SingleResearchCycleInput,
  type SingleResearchCycleResult
} from './single-research-cycle'

export interface ContinuousResearchRunnerInput {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  signal: AbortSignal

  onState?(state: ContinuousResearchRunnerState): void

  shouldStopBeforeNextCycle?(): boolean

  onCycleStage?(cycle: number, stage: ContinuousResearchStage): void

  onCycleIdentity?(cycle: number, maskedCpf: string): void
}

export type ContinuousResearchRunnerState =
  | {
      type: 'WAITING_QUEUE'
      checks: number
    }
  | {
      type: 'IDLE'
      nextCheckInMs: number
    }
  | {
      type: 'RESEARCH_AVAILABLE'
      cycle: number
      checks: number
    }
  | {
      type: 'CYCLE_COMPLETED'
      cycle: number
      result: SingleResearchCycleResult
    }
  | {
      type: 'STOPPED'
      cycles: number
    }

export interface ContinuousResearchRunResult {
  status: 'STOPPED_BY_SIGNAL' | 'STOPPED_BY_REQUEST'
  completedCycles: number
}

export interface ContinuousQueueMonitorPort {
  waitForResearch(page: Page, options?: CpiQueueMonitorOptions): Promise<CpiQueueMonitorResult>
}

export interface SingleResearchCyclePort {
  run(input: SingleResearchCycleInput): Promise<SingleResearchCycleResult>
}

export type SingleResearchCycleFactory = () => SingleResearchCyclePort

export interface ContinuousResearchRunnerDependencies {
  queueMonitor: ContinuousQueueMonitorPort
  cycleFactory: SingleResearchCycleFactory
}

export interface ContinuousResearchRunnerConfig extends SingleResearchCycleConfig {
  queueCheckIntervalMs: number
  queueFilterSettleDelayMs: number
}

export interface ContinuousResearchRunnerFactorySeam {
  createFilterController(options: CpiQueueFilterControllerOptions): CpiQueueRefresher
  createAvailabilityReader(readTimeoutMs: number): CpiQueueAvailabilitySource
  createQueueMonitor(
    refresher: CpiQueueRefresher,
    availabilitySource: CpiQueueAvailabilitySource,
    delay: CpiQueueDelay,
    intervalMs: number
  ): ContinuousQueueMonitorPort
  createSingleResearchCycle(config: SingleResearchCycleConfig): SingleResearchCyclePort
}

const DEFAULT_FACTORY_SEAM: ContinuousResearchRunnerFactorySeam = {
  createFilterController: (options) => new CpiQueueFilterController(options),
  createAvailabilityReader: (readTimeoutMs) => new CpiQueueAvailabilityReader(readTimeoutMs),
  createQueueMonitor: (refresher, availabilitySource, delay, intervalMs) =>
    new CpiQueueMonitor(refresher, availabilitySource, delay, intervalMs),
  createSingleResearchCycle
}

function toSingleResearchCycleConfig(
  config: ContinuousResearchRunnerConfig
): SingleResearchCycleConfig {
  return {
    cpiFrameSearchAttempts: config.cpiFrameSearchAttempts,
    deskDataPeopleUrl: config.deskDataPeopleUrl,
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
  config: ContinuousResearchRunnerConfig,
  factorySeam: ContinuousResearchRunnerFactorySeam
): ContinuousResearchRunnerDependencies {
  const filterController = factorySeam.createFilterController({
    frameSearchAttempts: config.cpiFrameSearchAttempts,
    frameSearchIntervalMs: config.cpiSearchPollingIntervalMs,
    actionTimeoutMs: config.actionTimeoutMs,
    settleDelayMs: config.queueFilterSettleDelayMs
  })

  return {
    queueMonitor: factorySeam.createQueueMonitor(
      filterController,
      factorySeam.createAvailabilityReader(config.readTimeoutMs),
      new NodeQueueDelay(),
      config.queueCheckIntervalMs
    ),

    cycleFactory: () => factorySeam.createSingleResearchCycle(toSingleResearchCycleConfig(config))
  }
}

export class ContinuousResearchRunner {
  constructor(
    private readonly dependencies: ContinuousResearchRunnerDependencies,
    private readonly queueCheckIntervalMs = 60_000
  ) {}

  async run(input: ContinuousResearchRunnerInput): Promise<ContinuousResearchRunResult> {
    let completedCycles = 0
    let stoppedByRequest = false

    while (!input.signal.aborted) {
      if (input.shouldStopBeforeNextCycle?.() === true) {
        stoppedByRequest = true

        break
      }

      input.onState?.({
        type: 'WAITING_QUEUE',
        checks: 0
      })

      const queueResult = await this.dependencies.queueMonitor.waitForResearch(input.cpiPage, {
        signal: input.signal,

        onState: (state, checks) => {
          this.reportQueueState(input, state, checks)
        }
      })

      if (queueResult.status === 'PAUSED') {
        break
      }

      if (input.shouldStopBeforeNextCycle?.() === true) {
        stoppedByRequest = true

        break
      }

      const cycleNumber = completedCycles + 1

      input.onState?.({
        type: 'RESEARCH_AVAILABLE',
        cycle: cycleNumber,
        checks: queueResult.checks
      })

      const cycle = this.dependencies.cycleFactory()

      const result = await cycle.run({
        context: input.context,
        cpiPage: input.cpiPage,
        deskDataPage: input.deskDataPage,
        signal: input.signal,

        hooks: {
          onStage: (stage) => {
            input.onCycleStage?.(cycleNumber, stage)
          },

          onIdentity: (maskedCpf) => {
            input.onCycleIdentity?.(cycleNumber, maskedCpf)
          }
        }
      })

      completedCycles = cycleNumber

      input.onState?.({
        type: 'CYCLE_COMPLETED',
        cycle: completedCycles,
        result
      })

      if (input.shouldStopBeforeNextCycle?.() === true) {
        stoppedByRequest = true

        break
      }
    }

    input.onState?.({
      type: 'STOPPED',
      cycles: completedCycles
    })

    return {
      status: stoppedByRequest ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL',

      completedCycles
    }
  }

  private reportQueueState(
    input: ContinuousResearchRunnerInput,
    state: CpiQueueAvailabilityState,
    checks: number
  ): void {
    input.onState?.({
      type: 'WAITING_QUEUE',
      checks
    })

    if (state !== 'EMPTY') {
      return
    }

    input.onState?.({
      type: 'IDLE',
      nextCheckInMs: this.queueCheckIntervalMs
    })
  }
}

export function createContinuousResearchRunner(
  config: ContinuousResearchRunnerConfig,
  factorySeam: ContinuousResearchRunnerFactorySeam = DEFAULT_FACTORY_SEAM
): ContinuousResearchRunner {
  return new ContinuousResearchRunner(
    createDefaultDependencies(config, factorySeam),
    config.queueCheckIntervalMs
  )
}
