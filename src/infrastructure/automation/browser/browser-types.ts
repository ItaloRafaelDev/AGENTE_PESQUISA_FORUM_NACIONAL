import type { BrowserContext } from 'playwright'

export const BROWSER_MANAGER_STATES = ['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'] as const

export type BrowserManagerState = (typeof BROWSER_MANAGER_STATES)[number]

export interface BrowserManagerSnapshot {
  state: BrowserManagerState
  profilePath: string
  startedAt: string | null
}

export interface BrowserLauncher {
  launchPersistentContext(profilePath: string): Promise<BrowserContext>
}
