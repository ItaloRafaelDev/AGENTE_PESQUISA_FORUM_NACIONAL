import {
  createInitialAgentPublicState,
  type AgentPublicState,
  type AgentPublicStatus
} from '../../../../shared/types/agent-runtime-api'
import type {
  BrowserManagerSnapshot,
  BrowserManagerState
} from '../../../../shared/types/browser-api'
import type {
  PlatformSessionState,
  PlatformSessionsSnapshot
} from '../../../../shared/types/session-api'

export type DashboardActionName =
  | 'browser-start'
  | 'browser-stop'
  | 'agent-start'
  | 'agent-pause'
  | 'agent-resume'
  | 'agent-stop'
  | 'login-completed'

export interface OperationalLogEntry {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: string
}

export interface DashboardControlState {
  browserRunning: boolean
  operationBusy: boolean
  canStartAgent: boolean
  canPauseAgent: boolean
  canResumeAgent: boolean
  canStopAgent: boolean
  waitingLogin: boolean
}

export type ReadonlyPlatformSessionsSnapshot = Readonly<
  Omit<PlatformSessionsSnapshot, 'cpi' | 'deskData'>
> & {
  readonly cpi: Readonly<PlatformSessionsSnapshot['cpi']>
  readonly deskData: Readonly<PlatformSessionsSnapshot['deskData']>
}

export const INITIAL_BROWSER_SNAPSHOT: Readonly<BrowserManagerSnapshot> = Object.freeze({
  state: 'STOPPED',
  profilePath: '',
  startedAt: null
})

export const INITIAL_AGENT_SNAPSHOT: Readonly<AgentPublicState> = Object.freeze(
  createInitialAgentPublicState()
)

const INITIAL_CPI_SESSION_SNAPSHOT: Readonly<PlatformSessionsSnapshot['cpi']> = Object.freeze({
  state: 'INDETERMINATE',
  url: null
})

const INITIAL_DESKDATA_SESSION_SNAPSHOT: Readonly<PlatformSessionsSnapshot['deskData']> =
  Object.freeze({
    state: 'INDETERMINATE',
    url: null
  })

export const INITIAL_SESSIONS_SNAPSHOT: ReadonlyPlatformSessionsSnapshot = Object.freeze({
  cpi: INITIAL_CPI_SESSION_SNAPSHOT,
  deskData: INITIAL_DESKDATA_SESSION_SNAPSHOT,
  allAuthenticated: false,
  checkedAt: null
})

export function formatDashboardState(state: string): string {
  return state.replaceAll('_', ' ')
}

export function formatSessionState(state: PlatformSessionState): string {
  const labels: Record<PlatformSessionState, string> = {
    AUTHENTICATED: 'Autenticado',
    WAITING_LOGIN: 'Aguardando login',
    INDETERMINATE: 'Indeterminado'
  }

  return labels[state]
}

export function formatLogTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function getDashboardControlState(
  browserState: BrowserManagerState,
  agentStatus: AgentPublicStatus,
  busyAction: DashboardActionName | null
): DashboardControlState {
  return {
    browserRunning: browserState === 'RUNNING',
    operationBusy: busyAction !== null,
    canStartAgent: agentStatus === 'PARADO' || agentStatus === 'ERRO_E1',
    canPauseAgent: agentStatus === 'EXECUTANDO' || agentStatus === 'OCIOSO',
    canResumeAgent: agentStatus === 'PAUSADO',
    canStopAgent: agentStatus !== 'PARADO' && agentStatus !== 'PARANDO',
    waitingLogin: agentStatus === 'AGUARDANDO_LOGIN'
  }
}
