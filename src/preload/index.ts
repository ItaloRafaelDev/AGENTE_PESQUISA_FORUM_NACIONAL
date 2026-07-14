import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { AGENT_IPC_CHANNELS } from '../shared/types/agent-control-api'
import type { AgentApi } from '../shared/types/agent-api'
import { BROWSER_IPC_CHANNELS } from '../shared/types/browser-api'
import { SESSION_IPC_CHANNELS } from '../shared/types/session-api'

const agentApi: AgentApi = {
  browser: {
    start: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.start),
    stop: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.stop),
    getStatus: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.status)
  },

  control: {
    start: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.start),
    pause: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.pause),
    resume: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.resume),
    stop: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.stop),
    getStatus: () => ipcRenderer.invoke(AGENT_IPC_CHANNELS.status)
  },

  sessions: {
    getStatus: () => ipcRenderer.invoke(SESSION_IPC_CHANNELS.status)
  }
}

if (!process.contextIsolated) {
  throw new Error('O Agente CPI exige contextIsolation habilitado.')
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('agent', agentApi)
