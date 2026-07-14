import type { AgentState } from './agent-state'

export const ALLOWED_AGENT_TRANSITIONS: Readonly<Record<AgentState, readonly AgentState[]>> = {
  PARADO: ['INICIALIZANDO'],

  INICIALIZANDO: ['AGUARDANDO_LOGIN', 'PRONTO', 'PAUSADO_POR_SEGURANCA', 'ENCERRANDO'],

  AGUARDANDO_LOGIN: ['PRONTO', 'PAUSANDO', 'PAUSADO_POR_SEGURANCA', 'ENCERRANDO'],

  PRONTO: [
    'PROCESSANDO',
    'AGUARDANDO_NOVA_PESQUISA',
    'PAUSANDO',
    'PAUSADO_POR_SEGURANCA',
    'ENCERRANDO'
  ],

  PROCESSANDO: [
    'AGUARDANDO_NOVA_PESQUISA',
    'PAUSANDO',
    'ERRO_TEMPORARIO',
    'PAUSADO_POR_SEGURANCA',
    'ENCERRANDO'
  ],

  PAUSANDO: ['PAUSADO', 'PAUSADO_POR_SEGURANCA', 'ENCERRANDO'],

  PAUSADO: ['AGUARDANDO_LOGIN', 'PRONTO', 'PROCESSANDO', 'AGUARDANDO_NOVA_PESQUISA', 'ENCERRANDO'],

  AGUARDANDO_NOVA_PESQUISA: [
    'PROCESSANDO',
    'PAUSANDO',
    'ERRO_TEMPORARIO',
    'PAUSADO_POR_SEGURANCA',
    'ENCERRANDO'
  ],

  ERRO_TEMPORARIO: [
    'PROCESSANDO',
    'AGUARDANDO_NOVA_PESQUISA',
    'PAUSANDO',
    'PAUSADO_POR_SEGURANCA',
    'ENCERRANDO'
  ],

  PAUSADO_POR_SEGURANCA: ['AGUARDANDO_LOGIN', 'PRONTO', 'PAUSADO', 'ENCERRANDO'],

  ENCERRANDO: ['PARADO']
}

export class AgentStateMachine {
  private currentState: AgentState

  constructor(initialState: AgentState = 'PARADO') {
    this.currentState = initialState
  }

  getState(): AgentState {
    return this.currentState
  }

  canTransitionTo(nextState: AgentState): boolean {
    return ALLOWED_AGENT_TRANSITIONS[this.currentState].includes(nextState)
  }

  transitionTo(nextState: AgentState): AgentState {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(`Transição inválida do agente: ${this.currentState} -> ${nextState}`)
    }

    this.currentState = nextState

    return this.currentState
  }
}
