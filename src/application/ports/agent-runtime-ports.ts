import type { AgentStateMachine } from '../agent/agent-state-machine'
import type { ResearchHistoryRecord } from '../history/research-history-model'
import type {
  ContinuousResearchInput,
  ContinuousResearchResult
} from '../research/run-continuous-research'
import type { ResearchCycleResult } from '../research/research-cycle-model'
import type { ApplicationClock } from './application-clock-port'
import type { SafeMessageSanitizer } from './safe-message-sanitizer-port'

export interface AgentWorkspacePort {
  ensureStarted(): Promise<void>
  areSessionsAuthenticated(): Promise<boolean>
  prepareContinuousExecution(): Promise<ContinuousResearchExecutionPort>
}

export interface ContinuousResearchExecutionPort {
  execute(input: ContinuousResearchInput): Promise<ContinuousResearchResult>
}

export interface AgentHistoryPort {
  beginCycle(): ResearchHistoryRecord
  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
  completeCycle(id: string, result: ResearchCycleResult): ResearchHistoryRecord
  failCycle(id: string, stage: string, error: unknown): ResearchHistoryRecord
}

export interface ContinuousAgentCoordinatorDependencies {
  state: AgentStateMachine
  workspace: AgentWorkspacePort
  history: AgentHistoryPort
  clock: ApplicationClock
  sanitizer: SafeMessageSanitizer
}
