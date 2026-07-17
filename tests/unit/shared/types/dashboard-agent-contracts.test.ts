import { describe, expect, it } from 'vitest'
import {
  AGENT_PUBLIC_STATUSES,
  AGENT_QUEUE_STATUSES,
  AGENT_RUNTIME_IPC_CHANNELS,
  createInitialAgentPublicState
} from '@/shared/types/agent-runtime-api'
import { HISTORY_IPC_CHANNELS, RESEARCH_HISTORY_STATUSES } from '@/shared/types/history-api'
import { PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'

describe('contratos públicos do dashboard contínuo', () => {
  it('expõe somente os estados públicos aprovados', () => {
    expect(AGENT_PUBLIC_STATUSES).toEqual([
      'PARADO',
      'INICIANDO',
      'AGUARDANDO_LOGIN',
      'EXECUTANDO',
      'PAUSANDO',
      'PAUSADO',
      'PARANDO',
      'OCIOSO',
      'ERRO_E1'
    ])

    expect(AGENT_QUEUE_STATUSES).toEqual(['DESCONHECIDA', 'COM_PESQUISA', 'VAZIA'])
  })

  it('cria o estado inicial parado e sem dados pessoais', () => {
    expect(createInitialAgentPublicState()).toEqual({
      status: 'PARADO',
      currentStage: null,
      completedCycles: 0,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  })

  it('define os canais fixos do runtime sem comando arbitrário', () => {
    expect(AGENT_RUNTIME_IPC_CHANNELS).toEqual({
      getState: 'agent:get-state',
      start: 'agent:start',
      pause: 'agent:pause',
      resume: 'agent:resume',
      stop: 'agent:stop',
      loginCompleted: 'agent:login-completed',
      stateChanged: 'agent:state-changed'
    })
  })

  it('define os status e canais do histórico persistente', () => {
    expect(RESEARCH_HISTORY_STATUSES).toEqual([
      'EM_ANDAMENTO',
      'CONCLUIDO',
      'ERRO_E1',
      'INTERROMPIDO'
    ])

    expect(HISTORY_IPC_CHANNELS).toEqual({
      list: 'history:list',
      clear: 'history:clear',
      recordCreated: 'history:record-created',
      recordUpdated: 'history:record-updated',
      cleared: 'history:cleared'
    })
  })

  it('define somente as ações permitidas para PDF', () => {
    expect(PDF_IPC_CHANNELS).toEqual({
      open: 'pdf:open',
      reveal: 'pdf:reveal'
    })
  })
})
