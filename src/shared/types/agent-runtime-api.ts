export const CONTINUOUS_RESEARCH_STAGES = [
  'WAITING_QUEUE',
  'OPENING_CPI_RESEARCH',
  'READING_CPI_IDENTITY',
  'PREPARING_DESKDATA',
  'SUBMITTING_DESKDATA',
  'WAITING_DESKDATA_RESULT',
  'CLASSIFYING_RESULT',
  'DOWNLOADING_PDF',
  'PREPARING_CPI_RESULT',
  'ATTACHING_PDF',
  'SAVING_CPI',
  'PREPARING_NEXT_SEARCH',
  'RETURNING_TO_QUEUE'
] as const

export type ContinuousResearchStage = (typeof CONTINUOUS_RESEARCH_STAGES)[number]

export const AGENT_PUBLIC_STATUSES = [
  'PARADO',
  'INICIANDO',
  'AGUARDANDO_LOGIN',
  'EXECUTANDO',
  'PAUSANDO',
  'PAUSADO',
  'PARANDO',
  'OCIOSO',
  'ERRO_E1'
] as const

export type AgentPublicStatus = (typeof AGENT_PUBLIC_STATUSES)[number]

export const AGENT_QUEUE_STATUSES = ['DESCONHECIDA', 'COM_PESQUISA', 'VAZIA'] as const

export type AgentQueueStatus = (typeof AGENT_QUEUE_STATUSES)[number]

export interface AgentPublicError {
  stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  message: string
  occurredAt: string
}

export interface AgentPublicState {
  status: AgentPublicStatus
  currentStage: ContinuousResearchStage | null
  completedCycles: number
  queueStatus: AgentQueueStatus
  nextCheckAt: string | null
  remainingSeconds: number | null
  currentMaskedCpf: string | null
  lastError: AgentPublicError | null
}

export function createInitialAgentPublicState(): AgentPublicState {
  return {
    status: 'PARADO',
    currentStage: null,
    completedCycles: 0,
    queueStatus: 'DESCONHECIDA',
    nextCheckAt: null,
    remainingSeconds: null,
    currentMaskedCpf: null,
    lastError: null
  }
}

export const AGENT_RUNTIME_IPC_CHANNELS = {
  getState: 'agent:get-state',
  start: 'agent:start',
  pause: 'agent:pause',
  resume: 'agent:resume',
  stop: 'agent:stop',
  loginCompleted: 'agent:login-completed',
  stateChanged: 'agent:state-changed'
} as const

export interface AgentRuntimeApi {
  getState(): Promise<AgentPublicState>
  start(): Promise<AgentPublicState>
  pause(): Promise<AgentPublicState>
  resume(): Promise<AgentPublicState>
  stop(): Promise<AgentPublicState>
  loginCompleted(): Promise<AgentPublicState>
  onStateChanged(listener: (state: AgentPublicState) => void): () => void
}
