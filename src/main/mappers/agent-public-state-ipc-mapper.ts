import type {
  AgentLifecycleState,
  AgentQueueState,
  AgentState
} from '../../application/agent/agent-state'
import type { AgentPublicState } from '../../shared/types/agent-runtime-api'

const statusMap: Record<AgentLifecycleState, AgentPublicState['status']> = {
  STOPPED: 'PARADO',
  STARTING: 'INICIANDO',
  WAITING_LOGIN: 'AGUARDANDO_LOGIN',
  IDLE: 'OCIOSO',
  RUNNING: 'EXECUTANDO',
  PAUSE_REQUESTED: 'PAUSANDO',
  PAUSED: 'PAUSADO',
  STOP_REQUESTED: 'PARANDO',
  FAILED: 'ERRO_E1'
}

const queueMap: Record<AgentQueueState, AgentPublicState['queueStatus']> = {
  UNKNOWN: 'DESCONHECIDA',
  AVAILABLE: 'COM_PESQUISA',
  EMPTY: 'VAZIA'
}

export function toAgentPublicState(state: AgentState): AgentPublicState {
  return {
    status: statusMap[state.lifecycle],
    currentStage: state.currentStage,
    completedCycles: state.completedCycles,
    queueStatus: queueMap[state.queue],
    nextCheckAt: state.nextCheckAt,
    remainingSeconds: state.remainingSeconds,
    currentMaskedCpf: state.currentMaskedCpf,
    lastError: state.lastError ? { ...state.lastError } : null
  }
}
