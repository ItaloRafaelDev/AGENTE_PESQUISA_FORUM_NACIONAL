import type { AgentState } from '../../domain/agent/agent-state'

export interface AgentControlSnapshot {
  state: AgentState
  pauseRequested: boolean
  consecutiveErrors: number
  circuitOpen: boolean
  safeMode: boolean
}

export const AGENT_IPC_CHANNELS = {
  start: 'agent:start',
  pause: 'agent:pause',
  resume: 'agent:resume',
  stop: 'agent:stop',
  status: 'agent:status'
} as const

export interface AgentControlApi {
  start(): Promise<AgentControlSnapshot>
  pause(): Promise<AgentControlSnapshot>
  resume(): Promise<AgentControlSnapshot>
  stop(): Promise<AgentControlSnapshot>
  getStatus(): Promise<AgentControlSnapshot>
}
