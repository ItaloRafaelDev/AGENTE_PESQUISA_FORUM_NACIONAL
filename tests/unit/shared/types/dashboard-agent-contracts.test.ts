import { describe, expect, it } from 'vitest'
import {
  AGENT_PUBLIC_STATUSES,
  AGENT_QUEUE_STATUSES,
  AGENT_RUNTIME_IPC_CHANNELS,
  createInitialAgentPublicState
} from '@/shared/types/agent-runtime-api'
import { BROWSER_IPC_CHANNELS, BROWSER_MANAGER_STATES } from '@/shared/types/browser-api'
import { HISTORY_IPC_CHANNELS, RESEARCH_HISTORY_STATUSES } from '@/shared/types/history-api'
import { PDF_ACTION_STATUSES, PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'
import { PLATFORM_SESSION_STATES, SESSION_IPC_CHANNELS } from '@/shared/types/session-api'

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
    expect(PDF_ACTION_STATUSES).toEqual(['OPENED', 'REVEALED', 'NOT_FOUND'])

    expect(PDF_IPC_CHANNELS).toEqual({
      open: 'pdf:open',
      reveal: 'pdf:reveal'
    })
  })

  it('preserva estados e canais públicos do navegador', () => {
    expect(BROWSER_MANAGER_STATES).toEqual(['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'])
    expect(BROWSER_IPC_CHANNELS).toEqual({
      start: 'browser:start',
      stop: 'browser:stop',
      status: 'browser:status'
    })
  })

  it('preserva estados e canal público das sessões', () => {
    expect(PLATFORM_SESSION_STATES).toEqual(['AUTHENTICATED', 'WAITING_LOGIN', 'INDETERMINATE'])
    expect(SESSION_IPC_CHANNELS).toEqual({
      status: 'sessions:status'
    })
  })
})
