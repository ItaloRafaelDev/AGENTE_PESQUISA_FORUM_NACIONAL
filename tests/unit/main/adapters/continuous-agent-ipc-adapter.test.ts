import { describe, expect, it } from 'vitest'
import type { AgentState } from '@/application/agent/agent-state'
import type { ContinuousAgentCoordinator } from '@/application/agent/continuous-agent-coordinator'
import { ContinuousAgentIpcAdapter } from '@/main/adapters/continuous-agent-ipc-adapter'

function createState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    lifecycle: 'STOPPED',
    currentStage: null,
    completedCycles: 0,
    queue: 'UNKNOWN',
    nextCheckAt: null,
    remainingSeconds: null,
    currentMaskedCpf: null,
    lastError: null,
    ...overrides
  }
}

class CoordinatorDouble {
  private state = createState()
  private listener: ((state: AgentState) => void) | null = null

  getSnapshot(): AgentState {
    return this.state
  }

  async start(): Promise<AgentState> {
    return this.setState(createState({ lifecycle: 'STARTING' }))
  }

  async pause(): Promise<AgentState> {
    return this.setState(createState({ lifecycle: 'PAUSED' }))
  }

  async resume(): Promise<AgentState> {
    return this.setState(createState({ lifecycle: 'RUNNING' }))
  }

  async stop(): Promise<AgentState> {
    return this.setState(createState({ lifecycle: 'STOPPED' }))
  }

  async loginCompleted(): Promise<AgentState> {
    return this.setState(createState({ lifecycle: 'IDLE', queue: 'EMPTY' }))
  }

  subscribe(listener: (state: AgentState) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emit(state: AgentState): void {
    this.state = state
    this.listener?.(state)
  }

  private setState(state: AgentState): AgentState {
    this.state = state
    return state
  }
}

describe('ContinuousAgentIpcAdapter', () => {
  it('projeta cada comando do coordenador no DTO público compatível', async () => {
    const coordinator = new CoordinatorDouble()
    const adapter = new ContinuousAgentIpcAdapter(
      coordinator as unknown as ContinuousAgentCoordinator
    )

    await expect(adapter.start()).resolves.toMatchObject({ status: 'INICIANDO' })
    await expect(adapter.pause()).resolves.toMatchObject({ status: 'PAUSADO' })
    await expect(adapter.resume()).resolves.toMatchObject({ status: 'EXECUTANDO' })
    await expect(adapter.stop()).resolves.toMatchObject({ status: 'PARADO' })
    await expect(adapter.loginCompleted()).resolves.toMatchObject({
      status: 'OCIOSO',
      queueStatus: 'VAZIA'
    })
  })

  it('entrega DTOs novos e isolados para snapshots e eventos', () => {
    const coordinator = new CoordinatorDouble()
    const adapter = new ContinuousAgentIpcAdapter(
      coordinator as unknown as ContinuousAgentCoordinator
    )
    const received: ReturnType<typeof adapter.getSnapshot>[] = []
    const unsubscribe = adapter.subscribe((state) => received.push(state))
    const source = createState({
      lifecycle: 'FAILED',
      lastError: {
        stage: 'CONTINUOUS_RUNNER',
        message: 'falha segura',
        occurredAt: '2026-07-27T00:00:00.000Z'
      }
    })

    coordinator.emit(source)
    received[0]!.lastError!.message = 'alterada externamente'
    coordinator.emit(source)
    const snapshot = adapter.getSnapshot()

    expect(received).toEqual([
      expect.objectContaining({
        status: 'ERRO_E1',
        lastError: expect.objectContaining({ message: 'alterada externamente' })
      }),
      expect.objectContaining({
        status: 'ERRO_E1',
        lastError: expect.objectContaining({ message: 'falha segura' })
      })
    ])
    expect(snapshot).toMatchObject({
      status: 'ERRO_E1',
      lastError: { message: 'falha segura' }
    })
    expect(snapshot).not.toBe(received[1])
    expect(source.lastError?.message).toBe('falha segura')

    unsubscribe()
  })
})
