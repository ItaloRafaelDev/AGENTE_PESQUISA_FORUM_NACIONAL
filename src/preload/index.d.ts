import type { AgentApi } from '../shared/types/agent-api'

declare global {
  interface Window {
    agent: AgentApi
  }
}
