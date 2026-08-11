import type { ExecutionToken } from '../agent/execution-control'
import type { ResearchCycleHooks } from './research-cycle-ports'
import type { ResearchCycleResult } from '../research/research-cycle-model'

export interface ResearchQueuePort {
  waitForResearch(input: {
    token: ExecutionToken
    onState(state: 'CHECKING' | 'EMPTY' | 'AVAILABLE', checks: number): void
  }): Promise<{ status: 'AVAILABLE' | 'CANCELLED'; checks: number }>
}

export interface ResearchCyclePort {
  execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult>
}

export interface ResearchCycleFactory {
  create(): ResearchCyclePort
}
