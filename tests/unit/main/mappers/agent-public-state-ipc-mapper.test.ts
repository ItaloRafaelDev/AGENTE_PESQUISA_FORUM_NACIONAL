import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentLifecycleState, AgentState } from '@/application/agent/agent-state'
import { toAgentPublicState } from '@/main/mappers/agent-public-state-ipc-mapper'

const statusCases: ReadonlyArray<[AgentLifecycleState, string]> = [
  ['STOPPED', 'PARADO'],
  ['STARTING', 'INICIANDO'],
  ['WAITING_LOGIN', 'AGUARDANDO_LOGIN'],
  ['IDLE', 'OCIOSO'],
  ['RUNNING', 'EXECUTANDO'],
  ['PAUSE_REQUESTED', 'PAUSANDO'],
  ['PAUSED', 'PAUSADO'],
  ['STOP_REQUESTED', 'PARANDO'],
  ['FAILED', 'ERRO_E1']
]

describe('toAgentPublicState', () => {
  it.each(statusCases)('mapeia %s para o status público %s', (lifecycle, expected) => {
    expect(toAgentPublicState(createState(lifecycle)).status).toBe(expected)
  })

  it.each([
    ['UNKNOWN', 'DESCONHECIDA'],
    ['AVAILABLE', 'COM_PESQUISA'],
    ['EMPTY', 'VAZIA']
  ] as const)('mapeia queue %s para %s', (queue, expected) => {
    expect(toAgentPublicState({ ...createState('RUNNING'), queue }).queueStatus).toBe(expected)
  })

  it('preserva os campos de progresso e clona lastError', () => {
    const state: AgentState = {
      lifecycle: 'RUNNING',
      currentStage: 'SAVING_CPI',
      completedCycles: 3,
      queue: 'AVAILABLE',
      nextCheckAt: '2026-07-14T20:00:00.000Z',
      remainingSeconds: 15,
      currentMaskedCpf: '***.***.***-44',
      lastError: {
        stage: 'CONTINUOUS_RUNNER',
        message: 'Falha segura',
        occurredAt: '2026-07-14T19:00:00.000Z'
      }
    }

    const mapped = toAgentPublicState(state)
    mapped.lastError!.message = 'alterada externamente'

    expect(mapped).toEqual({
      status: 'EXECUTANDO',
      currentStage: 'SAVING_CPI',
      completedCycles: 3,
      queueStatus: 'COM_PESQUISA',
      nextCheckAt: '2026-07-14T20:00:00.000Z',
      remainingSeconds: 15,
      currentMaskedCpf: '***.***.***-44',
      lastError: {
        stage: 'CONTINUOUS_RUNNER',
        message: 'alterada externamente',
        occurredAt: '2026-07-14T19:00:00.000Z'
      }
    })
    expect(state.lastError?.message).toBe('Falha segura')
  })

  it('mantém o modelo application sem dependência do DTO shared', () => {
    const modelSource = readFileSync(resolve('src/application/agent/agent-state.ts'), 'utf8')
    const machineSource = readFileSync(
      resolve('src/application/agent/agent-state-machine.ts'),
      'utf8'
    )

    expect(`${modelSource}\n${machineSource}`).not.toMatch(/AgentPublicState|AgentPublicStatus/)
    expect(`${modelSource}\n${machineSource}`).not.toMatch(/shared\//)
  })
})

function createState(lifecycle: AgentLifecycleState): AgentState {
  return {
    lifecycle,
    currentStage: null,
    completedCycles: 0,
    queue: 'UNKNOWN',
    nextCheckAt: null,
    remainingSeconds: null,
    currentMaskedCpf: null,
    lastError: null
  }
}
