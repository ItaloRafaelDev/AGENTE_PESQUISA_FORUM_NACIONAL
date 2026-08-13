import type { AgentApi } from '../../../shared/types/agent-api'

export function getAgentApi(): AgentApi {
  return window.agent
}
