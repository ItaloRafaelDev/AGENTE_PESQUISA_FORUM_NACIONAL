import type { BrowserContext, Page } from 'playwright'
import type { CpiQueueAvailabilityState } from '../cpi/cpi-queue-availability'
import { CpiQueueAvailabilityReader } from '../cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../cpi/cpi-queue-filter-controller'
import {
  CpiQueueMonitor,
  type CpiQueueMonitorOptions,
  type CpiQueueMonitorResult
} from '../cpi/cpi-queue-monitor'
import {
  SingleResearchCycle,
  type SingleResearchCycleInput,
  type SingleResearchCycleResult
} from './single-research-cycle'

export const CONTINUOUS_QUEUE_INTERVAL_MS = 60_000 as const

export interface ContinuousResearchRunnerInput {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  signal: AbortSignal
  onState?: (state: ContinuousResearchRunnerState) => void
}

export type ContinuousResearchRunnerState =
  | {
      type: 'WAITING_QUEUE'
      checks: number
    }
  | {
      type: 'IDLE'
      nextCheckInMs: typeof CONTINUOUS_QUEUE_INTERVAL_MS
    }
  | {
      type: 'RESEARCH_AVAILABLE'
      cycle: number
      checks: number
    }
  | {
      type: 'CYCLE_COMPLETED'
      cycle: number
    }
  | {
      type: 'STOPPED'
      cycles: number
    }

export interface ContinuousResearchRunResult {
  status: 'STOPPED_BY_SIGNAL'
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

function createDefaultDependencies(): ContinuousResearchRunnerDependencies {
  const filterController = new CpiQueueFilterController()

  return {
    queueMonitor: new CpiQueueMonitor(filterController, new CpiQueueAvailabilityReader()),
    cycleFactory: () => new SingleResearchCycle()
  }
}

export class ContinuousResearchRunner {
  constructor(
    private readonly dependencies: ContinuousResearchRunnerDependencies = createDefaultDependencies()
  ) {}

  async run(input: ContinuousResearchRunnerInput): Promise<ContinuousResearchRunResult> {
    let completedCycles = 0

    while (!input.signal.aborted) {
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

      const cycleNumber = completedCycles + 1

      input.onState?.({
        type: 'RESEARCH_AVAILABLE',
        cycle: cycleNumber,
        checks: queueResult.checks
      })

      const cycle = this.dependencies.cycleFactory()

      await cycle.run({
        context: input.context,
        cpiPage: input.cpiPage,
        deskDataPage: input.deskDataPage,
        signal: input.signal
      })

      completedCycles = cycleNumber

      input.onState?.({
        type: 'CYCLE_COMPLETED',
        cycle: completedCycles
      })
    }

    input.onState?.({
      type: 'STOPPED',
      cycles: completedCycles
    })

    return {
      status: 'STOPPED_BY_SIGNAL',
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
      nextCheckInMs: CONTINUOUS_QUEUE_INTERVAL_MS
    })
  }
}
