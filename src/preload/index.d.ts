import type { ElectronAPI } from '@electron-toolkit/preload'
import type { AgentApi } from '../shared/types/agent-api'

declare global {
  interface Window {
    electron: ElectronAPI
    agent: AgentApi
  }
}
