import { AGENT_IPC_CHANNELS, type AgentControlSnapshot } from '../../shared/types/agent-control-api'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export interface AgentIpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}

export interface AgentControlService {
  start(): Promise<AgentControlSnapshot>
  pause(): Promise<AgentControlSnapshot>
  resume(): Promise<AgentControlSnapshot>
  stop(): Promise<AgentControlSnapshot>
  getSnapshot(): AgentControlSnapshot
}

export function registerAgentIpcHandlers(
  ipcMain: AgentIpcMainRegistrar,
  agentService: AgentControlService
): void {
  Object.values(AGENT_IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel)
  })

  ipcMain.handle(AGENT_IPC_CHANNELS.start, () => {
    return agentService.start()
  })

  ipcMain.handle(AGENT_IPC_CHANNELS.pause, () => {
    return agentService.pause()
  })

  ipcMain.handle(AGENT_IPC_CHANNELS.resume, () => {
    return agentService.resume()
  })

  ipcMain.handle(AGENT_IPC_CHANNELS.stop, () => {
    return agentService.stop()
  })

  ipcMain.handle(AGENT_IPC_CHANNELS.status, () => {
    return agentService.getSnapshot()
  })
}
