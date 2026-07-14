import { describe, expect, it } from 'vitest'
import {
  registerAgentIpcHandlers,
  type AgentControlService,
  type AgentIpcMainRegistrar
} from '@/main/ipc/register-agent-ipc-handlers'
import { AGENT_IPC_CHANNELS, type AgentControlSnapshot } from '@/shared/types/agent-control-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

class FakeIpcMain implements AgentIpcMainRegistrar {
  public readonly handlers = new Map<string, IpcHandler>()

  handle(channel: string, listener: IpcHandler): void {
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
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

class FakeAgentService implements AgentControlService {
  private snapshot: AgentControlSnapshot = {
    state: 'PARADO',
    pauseRequested: false,
    consecutiveErrors: 0,
    circuitOpen: false,
    safeMode: true
  }

  async start(): Promise<AgentControlSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      state: 'AGUARDANDO_NOVA_PESQUISA'
    }

    return this.snapshot
  }

  async pause(): Promise<AgentControlSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      state: 'PAUSADO',
      pauseRequested: true
    }

    return this.snapshot
  }

  async resume(): Promise<AgentControlSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      state: 'AGUARDANDO_NOVA_PESQUISA',
      pauseRequested: false
    }

    return this.snapshot
  }

  async stop(): Promise<AgentControlSnapshot> {
    this.snapshot = {
      ...this.snapshot,
      state: 'PARADO',
      pauseRequested: false
    }

    return this.snapshot
  }

  getSnapshot(): AgentControlSnapshot {
    return this.snapshot
  }
}

describe('registerAgentIpcHandlers', () => {
  it('deve controlar o ciclo completo do agente', async () => {
    const ipcMain = new FakeIpcMain()

    registerAgentIpcHandlers(ipcMain, new FakeAgentService())

    await expect(ipcMain.invoke(AGENT_IPC_CHANNELS.start)).resolves.toMatchObject({
      state: 'AGUARDANDO_NOVA_PESQUISA'
    })

    await expect(ipcMain.invoke(AGENT_IPC_CHANNELS.pause)).resolves.toMatchObject({
      state: 'PAUSADO'
    })

    await expect(ipcMain.invoke(AGENT_IPC_CHANNELS.resume)).resolves.toMatchObject({
      state: 'AGUARDANDO_NOVA_PESQUISA'
    })

    await expect(ipcMain.invoke(AGENT_IPC_CHANNELS.stop)).resolves.toMatchObject({
      state: 'PARADO'
    })
  })
})
