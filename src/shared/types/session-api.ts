export const PLATFORM_SESSION_STATES = ['AUTHENTICATED', 'WAITING_LOGIN', 'INDETERMINATE'] as const

export type PlatformSessionState = (typeof PLATFORM_SESSION_STATES)[number]

export interface PlatformSessionDetail {
  state: PlatformSessionState
  url: string | null
}

export interface PlatformSessionsSnapshot {
  cpi: PlatformSessionDetail
  deskData: PlatformSessionDetail
  allAuthenticated: boolean
  checkedAt: string | null
}

export const SESSION_IPC_CHANNELS = {
  status: 'sessions:status'
} as const

export interface SessionApi {
  getStatus(): Promise<PlatformSessionsSnapshot>
}
