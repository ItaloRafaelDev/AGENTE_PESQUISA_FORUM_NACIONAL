import type { AgentRuntimeApi } from './agent-runtime-api'
import type { BrowserApi } from './browser-api'
import type { HistoryApi } from './history-api'
import type { PdfApi } from './pdf-api'
import type { SessionApi } from './session-api'

export interface AgentApi {
  browser: BrowserApi
  control: AgentRuntimeApi
  sessions: SessionApi
  history: HistoryApi
  pdf: PdfApi
}
