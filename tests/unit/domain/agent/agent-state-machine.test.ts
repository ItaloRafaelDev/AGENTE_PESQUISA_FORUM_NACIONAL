import { describe, expect, it } from 'vitest'
import { AgentStateMachine } from '@/domain/agent/agent-state-machine'

describe('AgentStateMachine', () => {
  it('deve iniciar no estado PARADO', () => {
    const machine = new AgentStateMachine()

    expect(machine.getState()).toBe('PARADO')
  })

  it('deve executar o fluxo operacional principal', () => {
    const machine = new AgentStateMachine()

    expect(machine.transitionTo('INICIALIZANDO')).toBe('INICIALIZANDO')
    expect(machine.transitionTo('PRONTO')).toBe('PRONTO')
    expect(machine.transitionTo('AGUARDANDO_NOVA_PESQUISA')).toBe('AGUARDANDO_NOVA_PESQUISA')
    expect(machine.transitionTo('PROCESSANDO')).toBe('PROCESSANDO')
    expect(machine.transitionTo('PAUSANDO')).toBe('PAUSANDO')
    expect(machine.transitionTo('PAUSADO')).toBe('PAUSADO')
    expect(machine.transitionTo('PROCESSANDO')).toBe('PROCESSANDO')
    expect(machine.transitionTo('ENCERRANDO')).toBe('ENCERRANDO')
    expect(machine.transitionTo('PARADO')).toBe('PARADO')
  })

  it('deve permitir aguardar login quando não houver sessão autenticada', () => {
    const machine = new AgentStateMachine()

    machine.transitionTo('INICIALIZANDO')
    machine.transitionTo('AGUARDANDO_LOGIN')
    machine.transitionTo('PRONTO')

    expect(machine.getState()).toBe('PRONTO')
  })

  it('deve permitir pausa de segurança e recuperação manual', () => {
    const machine = new AgentStateMachine()

    machine.transitionTo('INICIALIZANDO')
    machine.transitionTo('PRONTO')
    machine.transitionTo('PROCESSANDO')
    machine.transitionTo('PAUSADO_POR_SEGURANCA')
    machine.transitionTo('PRONTO')

    expect(machine.getState()).toBe('PRONTO')
  })

  it('deve permitir recuperação após erro temporário', () => {
    const machine = new AgentStateMachine()

    machine.transitionTo('INICIALIZANDO')
    machine.transitionTo('PRONTO')
    machine.transitionTo('PROCESSANDO')
    machine.transitionTo('ERRO_TEMPORARIO')
    machine.transitionTo('AGUARDANDO_NOVA_PESQUISA')

    expect(machine.getState()).toBe('AGUARDANDO_NOVA_PESQUISA')
  })

  it('deve informar se uma transição é permitida sem alterar o estado', () => {
    const machine = new AgentStateMachine()

    expect(machine.canTransitionTo('INICIALIZANDO')).toBe(true)
    expect(machine.canTransitionTo('PROCESSANDO')).toBe(false)
    expect(machine.getState()).toBe('PARADO')
  })

  it('deve rejeitar uma transição inválida', () => {
    const machine = new AgentStateMachine()

    expect(() => machine.transitionTo('PROCESSANDO')).toThrow(
      'Transição inválida do agente: PARADO -> PROCESSANDO'
    )

    expect(machine.getState()).toBe('PARADO')
  })

  it('deve rejeitar a repetição do mesmo estado', () => {
    const machine = new AgentStateMachine()

    expect(() => machine.transitionTo('PARADO')).toThrow(
      'Transição inválida do agente: PARADO -> PARADO'
    )
  })
})
