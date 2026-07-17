import {
  createInitialAgentPublicState,
  type AgentPublicState,
  type AgentPublicStatus
} from '../../shared/types/agent-runtime-api'

type AgentPublicStateListener = (state: AgentPublicState) => void

const MASKED_CPF_PATTERN = /^\*{3}\.\*{3}\.\*{3}-\d{2}$/

function cloneState(state: AgentPublicState): AgentPublicState {
  return {
    ...state,
    lastError: state.lastError
      ? {
          ...state.lastError
        }
      : null
  }
}

export class AgentPublicStateStore {
  private state: AgentPublicState = createInitialAgentPublicState()

  private readonly listeners = new Set<AgentPublicStateListener>()

  getSnapshot(): AgentPublicState {
    return cloneState(this.state)
  }

  getStatus(): AgentPublicStatus {
    return this.state.status
  }

  patch(patch: Partial<AgentPublicState>): AgentPublicState {
    this.assertMaskedCpf(patch.currentMaskedCpf)

    this.state = {
      ...this.state,
      ...patch,
      lastError:
        patch.lastError === undefined
          ? this.state.lastError
          : patch.lastError
            ? {
                ...patch.lastError
              }
            : null
    }

    const snapshot = this.getSnapshot()

    this.listeners.forEach((listener) => {
      listener(cloneState(snapshot))
    })

    return snapshot
  }

  resetForStart(): AgentPublicState {
    return this.patch({
      status: 'INICIANDO',
      currentStage: null,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  }

  subscribe(listener: AgentPublicStateListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private assertMaskedCpf(maskedCpf: AgentPublicState['currentMaskedCpf'] | undefined): void {
    if (maskedCpf !== undefined && maskedCpf !== null && !MASKED_CPF_PATTERN.test(maskedCpf)) {
      throw new Error('CPF público precisa estar mascarado')
    }
  }
}
