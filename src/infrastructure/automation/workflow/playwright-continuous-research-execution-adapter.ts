import type { ContinuousResearchExecutionPort } from '@/application/ports/agent-runtime-ports'
import type {
  ContinuousResearchInput,
  ContinuousResearchResult
} from '@/application/research/run-continuous-research'
import { RunContinuousResearch } from '@/application/research/run-continuous-research'
import type { BrowserContext, Page } from 'playwright'
import { CpiQueueAvailabilityReader } from '../cpi/cpi-queue-availability'
import { CpiQueueFilterController } from '../cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor, NodeQueueDelay } from '../cpi/cpi-queue-monitor'
import type { PlaywrightAutomationConfig } from './playwright-automation-config'
import { PlaywrightResearchQueueAdapter } from './playwright-research-queue-adapter'
import { createPlaywrightResearchCycleAdapter } from './playwright-research-cycle-adapter'

function isRecognizedAbortCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { name?: unknown; code?: unknown }

  return candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR'
}

export interface PlaywrightContinuousResearchExecutionAdapterInput {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  config: PlaywrightAutomationConfig
}

type ExecutionOutcome =
  { kind: 'SUCCEEDED'; result: ContinuousResearchResult } | { kind: 'FAILED'; error: unknown }

type CleanupOutcome = { kind: 'CLEAN' } | { kind: 'FAILED'; error: unknown }

export class PlaywrightContinuousResearchExecutionAdapter implements ContinuousResearchExecutionPort {
  constructor(private readonly input: PlaywrightContinuousResearchExecutionAdapterInput) {}

  async execute(input: ContinuousResearchInput): Promise<ContinuousResearchResult> {
    const abortController = new AbortController()
    let cycleActive = false
    let completedCycles = 0

    const abortAtSafeCheckpoint = (): void => {
      if (input.token.directive !== 'NONE' && !cycleActive) {
        abortController.abort()
      }
    }

    const unsubscribe = input.token.subscribe(abortAtSafeCheckpoint)
    abortAtSafeCheckpoint()
    let executionOutcome: ExecutionOutcome

    try {
      const result = await new RunContinuousResearch(
        {
          queue: new PlaywrightResearchQueueAdapter(
            this.createQueueMonitor(),
            this.input.cpiPage,
            abortController.signal
          ),
          cycleFactory: {
            create: () =>
              createPlaywrightResearchCycleAdapter({
                context: this.input.context,
                cpiPage: this.input.cpiPage,
                deskDataPage: this.input.deskDataPage,
                config: this.input.config
              })
          }
        },
        this.input.config.queueCheckIntervalMs
      ).execute({
        ...input,
        onState: (state) => {
          if (state.type === 'RESEARCH_AVAILABLE') {
            cycleActive = true
          }

          input.onState?.(state)

          if (state.type === 'CYCLE_COMPLETED') {
            completedCycles = state.cycle
            cycleActive = false
            abortAtSafeCheckpoint()
          } else if (state.type === 'STOPPED') {
            cycleActive = false
          }
        }
      })

      executionOutcome = {
        kind: 'SUCCEEDED',
        result
      }
    } catch (error: unknown) {
      if (
        abortController.signal.aborted &&
        input.token.directive !== 'NONE' &&
        isRecognizedAbortCancellation(error)
      ) {
        executionOutcome = {
          kind: 'SUCCEEDED',
          result: {
            status: input.token.directive === 'STOP' ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL',
            completedCycles
          }
        }
      } else {
        executionOutcome = {
          kind: 'FAILED',
          error
        }
      }
    }

    let cleanupOutcome: CleanupOutcome = { kind: 'CLEAN' }

    try {
      unsubscribe()
    } catch (error: unknown) {
      cleanupOutcome = {
        kind: 'FAILED',
        error
      }
    }

    if (executionOutcome.kind === 'FAILED') {
      throw executionOutcome.error
    }

    if (cleanupOutcome.kind === 'FAILED') {
      throw cleanupOutcome.error
    }

    return executionOutcome.result
  }

  private createQueueMonitor(): CpiQueueMonitor {
    const config = this.input.config
    const filterController = new CpiQueueFilterController({
      frameSearchAttempts: config.cpiFrameSearchAttempts,
      frameSearchIntervalMs: config.cpiSearchPollingIntervalMs,
      actionTimeoutMs: config.actionTimeoutMs,
      settleDelayMs: config.queueFilterSettleDelayMs
    })

    return new CpiQueueMonitor(
      filterController,
      new CpiQueueAvailabilityReader(config.readTimeoutMs),
      new NodeQueueDelay(),
      config.queueCheckIntervalMs
    )
  }
}

export function createPlaywrightContinuousResearchExecutionAdapter(
  input: PlaywrightContinuousResearchExecutionAdapterInput
): PlaywrightContinuousResearchExecutionAdapter {
  return new PlaywrightContinuousResearchExecutionAdapter(input)
}
