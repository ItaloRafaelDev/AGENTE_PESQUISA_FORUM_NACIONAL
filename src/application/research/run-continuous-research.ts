import type { ExecutionToken } from '../agent/execution-control'
import type { ContinuousResearchStage } from '../agent/continuous-research-stage'
import type { ResearchCycleFactory, ResearchQueuePort } from '../ports/continuous-research-ports'
import type { ResearchCycleResult } from './research-cycle-model'

export type ContinuousResearchState =
  | { type: 'WAITING_QUEUE'; checks: number }
  | { type: 'IDLE'; nextCheckInMs: number }
  | { type: 'RESEARCH_AVAILABLE'; cycle: number; checks: number }
  | { type: 'CYCLE_COMPLETED'; cycle: number; result: ResearchCycleResult }
  | { type: 'STOPPED'; cycles: number }

export interface ContinuousResearchInput {
  token: ExecutionToken
  onState?(state: ContinuousResearchState): void
  onCycleStage?(cycle: number, stage: ContinuousResearchStage): void
  onCycleIdentity?(cycle: number, maskedCpf: string): void
}

export interface ContinuousResearchResult {
  status: 'STOPPED_BY_SIGNAL' | 'STOPPED_BY_REQUEST'
  completedCycles: number
}

export interface RunContinuousResearchDependencies {
  queue: ResearchQueuePort
  cycleFactory: ResearchCycleFactory
}

export class RunContinuousResearch {
  constructor(
    private readonly dependencies: RunContinuousResearchDependencies,
    private readonly queueCheckIntervalMs = 60_000
  ) {}

  async execute(input: ContinuousResearchInput): Promise<ContinuousResearchResult> {
    let completedCycles = 0

    while (input.token.directive === 'NONE') {
      input.onState?.({
        type: 'WAITING_QUEUE',
        checks: 0
      })

      if (input.token.directive !== 'NONE') {
        break
      }

      const queueResult = await this.dependencies.queue.waitForResearch({
        token: input.token,
        onState: (state, checks) => this.reportQueueState(input, state, checks)
      })

      if (input.token.directive !== 'NONE') {
        break
      }

      if (queueResult.status === 'CANCELLED') {
        return this.complete(input, completedCycles, 'STOPPED_BY_SIGNAL')
      }

      const cycle = completedCycles + 1

      input.onState?.({
        type: 'RESEARCH_AVAILABLE',
        cycle,
        checks: queueResult.checks
      })

      if (input.token.directive !== 'NONE') {
        break
      }

      const result = await this.dependencies.cycleFactory.create().execute({
        token: input.token,
        hooks: {
          onStage: (stage) => input.onCycleStage?.(cycle, stage),
          onIdentity: (maskedCpf) => input.onCycleIdentity?.(cycle, maskedCpf)
        }
      })

      completedCycles = cycle

      input.onState?.({
        type: 'CYCLE_COMPLETED',
        cycle: completedCycles,
        result
      })

      if (input.token.directive !== 'NONE') {
        break
      }
    }

    return this.complete(
      input,
      completedCycles,
      input.token.directive === 'STOP' ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL'
    )
  }

  private complete(
    input: ContinuousResearchInput,
    completedCycles: number,
    status: ContinuousResearchResult['status']
  ): ContinuousResearchResult {
    input.onState?.({
      type: 'STOPPED',
      cycles: completedCycles
    })

    return {
      status,
      completedCycles
    }
  }

  private reportQueueState(
    input: ContinuousResearchInput,
    state: 'CHECKING' | 'EMPTY' | 'AVAILABLE',
    checks: number
  ): void {
    input.onState?.({
      type: 'WAITING_QUEUE',
      checks
    })

    if (state === 'EMPTY') {
      input.onState?.({
        type: 'IDLE',
        nextCheckInMs: this.queueCheckIntervalMs
      })
    }
  }
}
