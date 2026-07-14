import type { AgentControlApi } from './agent-control-api'
import type { BrowserApi } from './browser-api'
import type { SessionApi } from './session-api'

export interface AgentApi {
  browser: BrowserApi
  control: AgentControlApi
  sessions: SessionApi
}
