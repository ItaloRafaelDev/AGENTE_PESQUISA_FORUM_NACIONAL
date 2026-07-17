import { describe, expect, it } from 'vitest'
import {
  registerContinuousAgentIpcHandlers,
  type ContinuousAgentControlService,
  type ContinuousAgentEventSender,
  type ContinuousAgentIpcMainRegistrar
} from '@/main/ipc/register-continuous-agent-ipc-handlers'
import {
  AGENT_RUNTIME_IPC_CHANNELS,
  createInitialAgentPublicState,
  type AgentPublicState
} from '@/shared/types/agent-runtime-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

class FakeIpcMain implements ContinuousAgentIpcMainRegistrar {
  public readonly handlers = new Map<string, IpcHandler>()

  public readonly removedChannels: string[] = []

  handle(channel: string, listener: IpcHandler): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.removedChannels.push(channel)
    this.handlers.delete(channel)
  }

  async invoke(channel: string): Promise<unknown> {
    const handler = this.handlers.get(channel)

    if (!handler) {
      throw new Error(`Handler não registrado: ${channel}`)
    }

    return handler({})
  }
}

class FakeAgentService implements ContinuousAgentControlService {
  public startCalls = 0
  public pauseCalls = 0
  public resumeCalls = 0
  public stopCalls = 0
  public loginCalls = 0
  public unsubscribeCalls = 0

  private state: AgentPublicState = createInitialAgentPublicState()

  private listener: ((state: AgentPublicState) => void) | null = null

  async start(): Promise<AgentPublicState> {
    this.startCalls += 1

    return this.setStatus('OCIOSO')
  }

  async pause(): Promise<AgentPublicState> {
    this.pauseCalls += 1

    return this.setStatus('PAUSADO')
  }

  async resume(): Promise<AgentPublicState> {
    this.resumeCalls += 1

    return this.setStatus('OCIOSO')
  }

  async stop(): Promise<AgentPublicState> {
    this.stopCalls += 1

    return this.setStatus('PARADO')
  }

  async loginCompleted(): Promise<AgentPublicState> {
    this.loginCalls += 1

    return this.setStatus('OCIOSO')
  }

  getSnapshot(): AgentPublicState {
    return {
      ...this.state,
      lastError: this.state.lastError
        ? {
            ...this.state.lastError
          }
        : null
    }
  }

  subscribe(listener: (state: AgentPublicState) => void): () => void {
    this.listener = listener

    return () => {
      this.unsubscribeCalls += 1
      this.listener = null
    }
  }

  emit(state: AgentPublicState): void {
    this.listener?.(state)
  }

  private setStatus(status: AgentPublicState['status']): AgentPublicState {
    this.state = {
      ...this.state,
      status
    }

    return this.getSnapshot()
  }
}

class FakeEventSender implements ContinuousAgentEventSender {
  public readonly events: Array<{
    channel: string
    payload: unknown
  }> = []

  send(channel: string, payload: unknown): void {
    this.events.push({
      channel,
      payload
    })
  }
}

describe('registerContinuousAgentIpcHandlers', () => {
  it('registra todos os comandos aprovados', () => {
    const ipcMain = new FakeIpcMain()

    registerContinuousAgentIpcHandlers(ipcMain, new FakeAgentService(), new FakeEventSender())

    expect([...ipcMain.handlers.keys()]).toEqual([
      AGENT_RUNTIME_IPC_CHANNELS.getState,
      AGENT_RUNTIME_IPC_CHANNELS.start,
      AGENT_RUNTIME_IPC_CHANNELS.pause,
      AGENT_RUNTIME_IPC_CHANNELS.resume,
      AGENT_RUNTIME_IPC_CHANNELS.stop,
      AGENT_RUNTIME_IPC_CHANNELS.loginCompleted
    ])
  })

  it('remove handlers antigos antes de registrar', () => {
    const ipcMain = new FakeIpcMain()

    registerContinuousAgentIpcHandlers(ipcMain, new FakeAgentService(), new FakeEventSender())

    expect(ipcMain.removedChannels).toEqual([
      AGENT_RUNTIME_IPC_CHANNELS.getState,
      AGENT_RUNTIME_IPC_CHANNELS.start,
      AGENT_RUNTIME_IPC_CHANNELS.pause,
      AGENT_RUNTIME_IPC_CHANNELS.resume,
      AGENT_RUNTIME_IPC_CHANNELS.stop,
      AGENT_RUNTIME_IPC_CHANNELS.loginCompleted
    ])
  })

  it('encaminha os comandos ao serviço', async () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeAgentService()

    registerContinuousAgentIpcHandlers(ipcMain, service, new FakeEventSender())

    await ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.start)

    await ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.pause)

    await ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.resume)

    await ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.stop)

    await ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.loginCompleted)

    await expect(ipcMain.invoke(AGENT_RUNTIME_IPC_CHANNELS.getState)).resolves.toEqual(
      expect.objectContaining({
        status: 'OCIOSO'
      })
    )

    expect(service.startCalls).toBe(1)
    expect(service.pauseCalls).toBe(1)
    expect(service.resumeCalls).toBe(1)
    expect(service.stopCalls).toBe(1)
    expect(service.loginCalls).toBe(1)
  })

  it('emite agent:state-changed em tempo real', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeAgentService()
    const sender = new FakeEventSender()

    registerContinuousAgentIpcHandlers(ipcMain, service, sender)

    const state = {
      ...createInitialAgentPublicState(),
      status: 'EXECUTANDO' as const,
      currentStage: 'PREPARING_DESKDATA' as const,
      currentMaskedCpf: '***.***.***-44'
    }

    service.emit(state)

    expect(sender.events).toEqual([
      {
        channel: AGENT_RUNTIME_IPC_CHANNELS.stateChanged,
        payload: state
      }
    ])
  })

  it('descarta listener e handlers', () => {
    const ipcMain = new FakeIpcMain()
    const service = new FakeAgentService()

    const dispose = registerContinuousAgentIpcHandlers(ipcMain, service, new FakeEventSender())

    dispose()

    expect(service.unsubscribeCalls).toBe(1)

    expect(ipcMain.handlers.size).toBe(0)
  })
})
