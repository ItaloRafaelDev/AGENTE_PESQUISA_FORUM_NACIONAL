import type { ContinuousResearchStage } from './continuous-research-stage'

export type AgentLifecycleState =
  | 'STOPPED'
  | 'STARTING'
  | 'WAITING_LOGIN'
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSE_REQUESTED'
  | 'PAUSED'
  | 'STOP_REQUESTED'
  | 'FAILED'

export type AgentQueueState = 'UNKNOWN' | 'AVAILABLE' | 'EMPTY'

export interface AgentErrorState {
  stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  message: string
  occurredAt: string
}

export interface AgentState {
  lifecycle: AgentLifecycleState
  currentStage: ContinuousResearchStage | null
  completedCycles: number
  queue: AgentQueueState
  nextCheckAt: string | null
  remainingSeconds: number | null
  currentMaskedCpf: string | null
  lastError: AgentErrorState | null
}

export type AgentProgressPatch = Partial<
  Pick<
    AgentState,
    | 'currentStage'
    | 'completedCycles'
    | 'queue'
    | 'nextCheckAt'
    | 'remainingSeconds'
    | 'currentMaskedCpf'
    | 'lastError'
  >
>
