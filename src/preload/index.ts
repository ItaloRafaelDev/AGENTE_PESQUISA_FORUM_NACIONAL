import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AgentPublicState } from '../shared/types/agent-runtime-api'
import { AGENT_RUNTIME_IPC_CHANNELS } from '../shared/types/agent-runtime-api'
import type { AgentApi } from '../shared/types/agent-api'
import { BROWSER_IPC_CHANNELS } from '../shared/types/browser-api'
import type { ResearchHistoryRecord } from '../shared/types/history-api'
import { HISTORY_IPC_CHANNELS } from '../shared/types/history-api'
import { PDF_IPC_CHANNELS } from '../shared/types/pdf-api'
import { SESSION_IPC_CHANNELS } from '../shared/types/session-api'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

function subscribeSignal(channel: string, listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const agentApi: AgentApi = {
  browser: {
    start: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.start),

    stop: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.stop),

    getStatus: () => ipcRenderer.invoke(BROWSER_IPC_CHANNELS.status)
  },

  control: {
    getState: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.getState),

    start: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.start),

    pause: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.pause),

    resume: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.resume),

    stop: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.stop),

    loginCompleted: () => ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.loginCompleted),

    onStateChanged: (listener) =>
      subscribe<AgentPublicState>(AGENT_RUNTIME_IPC_CHANNELS.stateChanged, listener)
  },

  sessions: {
    getStatus: () => ipcRenderer.invoke(SESSION_IPC_CHANNELS.status)
  },

  history: {
    list: (input) => ipcRenderer.invoke(HISTORY_IPC_CHANNELS.list, input),

    clear: () => ipcRenderer.invoke(HISTORY_IPC_CHANNELS.clear),

    onRecordCreated: (listener) =>
      subscribe<ResearchHistoryRecord>(HISTORY_IPC_CHANNELS.recordCreated, listener),

    onRecordUpdated: (listener) =>
      subscribe<ResearchHistoryRecord>(HISTORY_IPC_CHANNELS.recordUpdated, listener),

    onCleared: (listener) => subscribeSignal(HISTORY_IPC_CHANNELS.cleared, listener)
  },

  pdf: {
    open: (path) => ipcRenderer.invoke(PDF_IPC_CHANNELS.open, path),

    reveal: (path) => ipcRenderer.invoke(PDF_IPC_CHANNELS.reveal, path)
  }
}

if (!process.contextIsolated) {
  throw new Error('O Agente CPI exige contextIsolation habilitado.')
}

contextBridge.exposeInMainWorld('electron', electronAPI)

contextBridge.exposeInMainWorld('agent', agentApi)
