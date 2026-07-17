import { describe, expect, it, vi } from 'vitest'
import { AgentPublicStateStore } from '@/automation/workflow/agent-public-state-store'

describe('AgentPublicStateStore', () => {
  it('inicia parado e sem dados pessoais', () => {
    const store = new AgentPublicStateStore()

    expect(store.getSnapshot()).toEqual({
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

  it('emite o novo estado para os inscritos', () => {
    const store = new AgentPublicStateStore()
    const listener = vi.fn()

    store.subscribe(listener)

    const snapshot = store.patch({
      status: 'OCIOSO',
      currentStage: 'WAITING_QUEUE',
      queueStatus: 'VAZIA',
      nextCheckAt: '2026-07-14T20:00:00.000Z',
      remainingSeconds: 60
    })

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: 'OCIOSO',
        currentStage: 'WAITING_QUEUE',
        queueStatus: 'VAZIA',
        remainingSeconds: 60
      })
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(snapshot)
  })

  it('remove a inscrição corretamente', () => {
    const store = new AgentPublicStateStore()
    const listener = vi.fn()

    const unsubscribe = store.subscribe(listener)

    store.patch({
      status: 'OCIOSO'
    })

    unsubscribe()

    store.patch({
      status: 'PAUSADO'
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejeita CPF público não mascarado', () => {
    const store = new AgentPublicStateStore()

    expect(() =>
      store.patch({
        currentMaskedCpf: '12345678901'
      })
    ).toThrow('CPF público precisa estar mascarado')
  })

  it('aceita somente o formato mascarado aprovado', () => {
    const store = new AgentPublicStateStore()

    expect(
      store.patch({
        currentMaskedCpf: '***.***.***-01'
      }).currentMaskedCpf
    ).toBe('***.***.***-01')
  })

  it('não permite mutação externa do estado interno', () => {
    const store = new AgentPublicStateStore()

    store.patch({
      status: 'ERRO_E1',
      lastError: {
        stage: 'SAVING_CPI',
        message: 'Falha segura',
        occurredAt: '2026-07-14T20:00:00.000Z'
      }
    })

    const firstSnapshot = store.getSnapshot()

    firstSnapshot.status = 'PARADO'

    if (firstSnapshot.lastError) {
      firstSnapshot.lastError.message = 'Mensagem alterada externamente'
    }

    const secondSnapshot = store.getSnapshot()

    expect(secondSnapshot.status).toBe('ERRO_E1')
    expect(secondSnapshot.lastError?.message).toBe('Falha segura')
  })

  it('reinicia a execução sem apagar a contagem concluída', () => {
    const store = new AgentPublicStateStore()

    store.patch({
      status: 'ERRO_E1',
      completedCycles: 7,
      queueStatus: 'VAZIA',
      currentMaskedCpf: '***.***.***-01',
      lastError: {
        stage: 'SAVING_CPI',
        message: 'Falha segura',
        occurredAt: '2026-07-14T20:00:00.000Z'
      }
    })

    expect(store.resetForStart()).toEqual({
      status: 'INICIANDO',
      currentStage: null,
      completedCycles: 7,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  })
})
