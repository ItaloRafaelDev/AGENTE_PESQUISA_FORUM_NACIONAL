import type {
  AgentErrorState,
  AgentLifecycleState,
  AgentProgressPatch,
  AgentState
} from './agent-state'

export type {
  AgentErrorState,
  AgentLifecycleState,
  AgentProgressPatch,
  AgentQueueState,
  AgentState
} from './agent-state'

type AgentStateListener = (state: AgentState) => void

const MASKED_CPF_PATTERN = /^\*{3}\.\*{3}\.\*{3}-\d{2}$/

const INITIAL_STATE: AgentState = {
  lifecycle: 'STOPPED',
  currentStage: null,
  completedCycles: 0,
  queue: 'UNKNOWN',
  nextCheckAt: null,
  remainingSeconds: null,
  currentMaskedCpf: null,
  lastError: null
}

export function validateAgentProgressPatch(patch: AgentProgressPatch): void {
  const maskedCpf = patch.currentMaskedCpf

  if (maskedCpf !== undefined && maskedCpf !== null && !MASKED_CPF_PATTERN.test(maskedCpf)) {
    throw new Error('CPF público precisa estar mascarado')
  }
}

export class AgentStateMachine {
  private state: AgentState = cloneState(INITIAL_STATE)

  private readonly listeners = new Set<AgentStateListener>()

  private readonly pendingNotifications: AgentState[] = []

  private publishing = false

  getSnapshot(): AgentState {
    return cloneState(this.state)
  }

  subscribe(listener: AgentStateListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  beginStart(): AgentState {
    if (this.state.lifecycle !== 'STOPPED' && this.state.lifecycle !== 'FAILED') {
      throw new Error('O agente já está em execução')
    }

    return this.changeState({
      ...INITIAL_STATE,
      lifecycle: 'STARTING',
      completedCycles: this.state.completedCycles
    })
  }

  waitForLogin(): AgentState {
    return this.transitionFrom(['STARTING'], 'WAITING_LOGIN')
  }

  beginRun(progress: AgentProgressPatch = {}): AgentState {
    return this.transitionFrom(['STARTING', 'WAITING_LOGIN'], 'IDLE', progress)
  }

  markIdle(progress: AgentProgressPatch = {}): AgentState {
    if (this.state.lifecycle === 'IDLE') {
      return this.changeState(this.applyProgress(progress))
    }

    return this.transitionFrom(['RUNNING'], 'IDLE', progress)
  }

  markRunning(progress: AgentProgressPatch = {}): AgentState {
    if (this.state.lifecycle === 'RUNNING') {
      return this.changeState(this.applyProgress(progress))
    }

    return this.transitionFrom(['IDLE'], 'RUNNING', progress)
  }

  requestPause(progress: AgentProgressPatch = {}): AgentState {
    if (
      this.state.lifecycle === 'PAUSE_REQUESTED' ||
      this.state.lifecycle === 'PAUSED' ||
      this.state.lifecycle === 'STOP_REQUESTED'
    ) {
      return this.getSnapshot()
    }

    return this.transition('PAUSE_REQUESTED', progress)
  }

  markPaused(progress: AgentProgressPatch = {}): AgentState {
    if (this.state.lifecycle === 'STOP_REQUESTED') {
      return this.getSnapshot()
    }

    return this.transitionFrom(['PAUSE_REQUESTED'], 'PAUSED', progress)
  }

  resume(): AgentState {
    if (this.state.lifecycle !== 'PAUSED') {
      throw new Error('O agente não está pausado')
    }

    return this.transition('STARTING')
  }

  requestStop(progress: AgentProgressPatch = {}): AgentState {
    if (this.state.lifecycle === 'STOPPED' || this.state.lifecycle === 'STOP_REQUESTED') {
      return this.getSnapshot()
    }

    return this.transition('STOP_REQUESTED', progress)
  }

  markStopped(progress: AgentProgressPatch = {}): AgentState {
    return this.transitionFrom(['STOP_REQUESTED'], 'STOPPED', progress)
  }

  markFailed(error: AgentErrorState, progress: AgentProgressPatch = {}): AgentState {
    return this.changeState({
      ...this.applyProgress(progress),
      lifecycle: 'FAILED',
      lastError: cloneError(error)
    })
  }

  updateProgress(patch: AgentProgressPatch): AgentState {
    validateAgentProgressPatch(patch)

    return this.changeState(this.applyProgress(patch))
  }

  private transitionFrom(
    allowedStates: readonly AgentLifecycleState[],
    lifecycle: AgentLifecycleState,
    progress: AgentProgressPatch = {}
  ): AgentState {
    if (!allowedStates.includes(this.state.lifecycle)) {
      throw new Error(`Transição inválida de ${this.state.lifecycle} para ${lifecycle}`)
    }

    return this.transition(lifecycle, progress)
  }

  private transition(
    lifecycle: AgentLifecycleState,
    progress: AgentProgressPatch = {}
  ): AgentState {
    return this.changeState({
      ...this.applyProgress(progress),
      lifecycle
    })
  }

  private applyProgress(patch: AgentProgressPatch): AgentState {
    validateAgentProgressPatch(patch)

    return {
      ...this.state,
      currentStage: patch.currentStage === undefined ? this.state.currentStage : patch.currentStage,
      completedCycles: patch.completedCycles ?? this.state.completedCycles,
      queue: patch.queue ?? this.state.queue,
      nextCheckAt: patch.nextCheckAt === undefined ? this.state.nextCheckAt : patch.nextCheckAt,
      remainingSeconds:
        patch.remainingSeconds === undefined ? this.state.remainingSeconds : patch.remainingSeconds,
      currentMaskedCpf:
        patch.currentMaskedCpf === undefined ? this.state.currentMaskedCpf : patch.currentMaskedCpf,
      lastError:
        patch.lastError === undefined
          ? this.state.lastError
          : patch.lastError
            ? cloneError(patch.lastError)
            : null
    }
  }

  private changeState(nextState: AgentState): AgentState {
    if (statesAreEqual(this.state, nextState)) {
      return this.getSnapshot()
    }

    this.state = cloneState(nextState)
    const changedSnapshot = this.getSnapshot()

    this.pendingNotifications.push(changedSnapshot)
    this.publishPendingNotifications()

    return cloneState(changedSnapshot)
  }

  private publishPendingNotifications(): void {
    if (this.publishing) {
      return
    }

    this.publishing = true

    try {
      while (this.pendingNotifications.length > 0) {
        const changedSnapshot = this.pendingNotifications.shift()!

        for (const listener of this.listeners) {
          try {
            listener(cloneState(changedSnapshot))
          } catch {
            // Observers cannot interrupt lifecycle transitions.
          }
        }
      }
    } finally {
      this.publishing = false
    }
  }
}

function cloneError(error: AgentErrorState): AgentErrorState {
  return { ...error }
}

function cloneState(state: AgentState): AgentState {
  return {
    ...state,
    lastError: state.lastError ? cloneError(state.lastError) : null
  }
}

function statesAreEqual(current: AgentState, next: AgentState): boolean {
  return (
    current.lifecycle === next.lifecycle &&
    current.currentStage === next.currentStage &&
    current.completedCycles === next.completedCycles &&
    current.queue === next.queue &&
    current.nextCheckAt === next.nextCheckAt &&
    current.remainingSeconds === next.remainingSeconds &&
    current.currentMaskedCpf === next.currentMaskedCpf &&
    errorsAreEqual(current.lastError, next.lastError)
  )
}

function errorsAreEqual(current: AgentErrorState | null, next: AgentErrorState | null): boolean {
  if (current === null || next === null) {
    return current === next
  }

  return (
    current.stage === next.stage &&
    current.message === next.message &&
    current.occurredAt === next.occurredAt
  )
}
