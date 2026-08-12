import {
  AGENT_RUNTIME_IPC_CHANNELS,
  type AgentPublicState
} from '../../shared/types/agent-runtime-api'
import { parseNoIpcArguments } from './ipc-argument-contracts'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface ContinuousAgentIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void

  removeHandler(channel: string): void
}

export interface ContinuousAgentEventSender {
  send(channel: string, payload: unknown): void
}

export interface ContinuousAgentControlService {
  start(): Promise<AgentPublicState>
  pause(): Promise<AgentPublicState>
  resume(): Promise<AgentPublicState>
  stop(): Promise<AgentPublicState>

  loginCompleted(): Promise<AgentPublicState>

  getSnapshot(): AgentPublicState

  subscribe(listener: (state: AgentPublicState) => void): () => void
}

export function registerContinuousAgentIpcHandlers(
  ipcMain: ContinuousAgentIpcMainRegistrar,
  agentService: ContinuousAgentControlService,
  eventSender: ContinuousAgentEventSender
): () => void {
  const commandChannels = [
    AGENT_RUNTIME_IPC_CHANNELS.getState,
    AGENT_RUNTIME_IPC_CHANNELS.start,
    AGENT_RUNTIME_IPC_CHANNELS.pause,
    AGENT_RUNTIME_IPC_CHANNELS.resume,
    AGENT_RUNTIME_IPC_CHANNELS.stop,
    AGENT_RUNTIME_IPC_CHANNELS.loginCompleted
  ] as const

  commandChannels.forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.getState, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.getSnapshot()
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.start, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.start()
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.pause, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.pause()
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.resume, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.resume()
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.stop, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.stop()
  })

  ipcMain.handle(AGENT_RUNTIME_IPC_CHANNELS.loginCompleted, (_event, ...rawArguments) => {
    parseNoIpcArguments(rawArguments)

    return agentService.loginCompleted()
  })

  const unsubscribe = agentService.subscribe((state) => {
    eventSender.send(AGENT_RUNTIME_IPC_CHANNELS.stateChanged, state)
  })

  return () => {
    unsubscribe()

    commandChannels.forEach((channel) => {
      ipcMain.removeHandler(channel)
    })
  }
}
