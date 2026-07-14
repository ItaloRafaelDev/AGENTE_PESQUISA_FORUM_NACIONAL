export const BROWSER_MANAGER_STATES = ['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'] as const

export type BrowserManagerState = (typeof BROWSER_MANAGER_STATES)[number]

export interface BrowserManagerSnapshot {
  state: BrowserManagerState
  profilePath: string
  startedAt: string | null
}

export const BROWSER_IPC_CHANNELS = {
  start: 'browser:start',
  stop: 'browser:stop',
  status: 'browser:status'
} as const

export interface BrowserApi {
  start(): Promise<BrowserManagerSnapshot>
  stop(): Promise<BrowserManagerSnapshot>
  getStatus(): Promise<BrowserManagerSnapshot>
}
