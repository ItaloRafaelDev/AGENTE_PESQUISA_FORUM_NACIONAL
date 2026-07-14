import type { AgentState } from '../../domain/agent/agent-state'
import { AgentStateMachine } from '../../domain/agent/agent-state-machine'
import { parseAppConfig, type AppConfig } from '../../infrastructure/config/app-config'
import type { AgentControlSnapshot } from '../../shared/types/agent-control-api'
import { CircuitBreaker } from './circuit-breaker'
import { PauseController } from './pause-controller'

export type AgentSnapshot = AgentControlSnapshot

export class AgentController {
  private readonly config: AppConfig
  private readonly stateMachine: AgentStateMachine
  private readonly pauseController: PauseController
  private readonly circuitBreaker: CircuitBreaker
  private resumeState: AgentState = 'PRONTO'

  constructor(configInput: unknown = {}) {
    this.config = parseAppConfig(configInput)
    this.stateMachine = new AgentStateMachine()
    this.pauseController = new PauseController()
    this.circuitBreaker = new CircuitBreaker(this.config.maxConsecutiveErrors)
  }

  getState(): AgentState {
    return this.stateMachine.getState()
  }

  getSnapshot(): AgentSnapshot {
    return {
      state: this.getState(),
      pauseRequested: this.pauseController.isPauseRequested(),
      consecutiveErrors: this.circuitBreaker.getFailureCount(),
      circuitOpen: this.circuitBreaker.isOpen(),
      safeMode: this.config.safeMode
    }
  }

  start(): AgentState {
    return this.stateMachine.transitionTo('INICIALIZANDO')
  }

  markWaitingForLogin(): AgentState {
    return this.stateMachine.transitionTo('AGUARDANDO_LOGIN')
  }

  markReady(): AgentState {
    return this.stateMachine.transitionTo('PRONTO')
  }

  beginWaitingForResearch(): AgentState {
    return this.stateMachine.transitionTo('AGUARDANDO_NOVA_PESQUISA')
  }

  beginProcessing(): AgentState {
    return this.stateMachine.transitionTo('PROCESSANDO')
  }

  markTemporaryError(): AgentState {
    return this.stateMachine.transitionTo('ERRO_TEMPORARIO')
  }

  requestPause(): AgentState {
    this.resumeState = this.getState()
    this.pauseController.requestPause()
    this.stateMachine.transitionTo('PAUSANDO')

    return this.checkpoint()
  }

  checkpoint(): AgentState {
    if (this.getState() === 'PAUSANDO' && this.pauseController.shouldPauseAtCheckpoint()) {
      return this.stateMachine.transitionTo('PAUSADO')
    }

    return this.getState()
  }

  enterAtomicSection(): void {
    this.pauseController.enterAtomicSection()
  }

  leaveAtomicSection(): AgentState {
    this.pauseController.leaveAtomicSection()

    return this.checkpoint()
  }

  resume(): AgentState {
    if (this.getState() !== 'PAUSADO') {
      throw new Error(`Não é possível continuar o agente no estado ${this.getState()}`)
    }

    this.pauseController.resume()

    const targetState = this.stateMachine.canTransitionTo(this.resumeState)
      ? this.resumeState
      : 'PRONTO'

    return this.stateMachine.transitionTo(targetState)
  }

  stopSafely(): AgentState {
    if (this.getState() === 'PARADO') {
      return 'PARADO'
    }

    if (this.getState() !== 'ENCERRANDO') {
      this.stateMachine.transitionTo('ENCERRANDO')
    }

    this.pauseController.resume()

    return this.stateMachine.transitionTo('PARADO')
  }

  recordFailure(): AgentSnapshot {
    this.circuitBreaker.recordFailure()

    if (
      this.circuitBreaker.isOpen() &&
      this.getState() !== 'PAUSADO_POR_SEGURANCA' &&
      this.stateMachine.canTransitionTo('PAUSADO_POR_SEGURANCA')
    ) {
      this.stateMachine.transitionTo('PAUSADO_POR_SEGURANCA')
    }

    return this.getSnapshot()
  }

  recordSuccess(): AgentSnapshot {
    this.circuitBreaker.recordSuccess()

    return this.getSnapshot()
  }
}
