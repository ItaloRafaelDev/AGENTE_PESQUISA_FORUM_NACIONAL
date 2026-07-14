import type { BrowserContext } from 'playwright'

export { BROWSER_MANAGER_STATES } from '../../shared/types/browser-api'

export type { BrowserManagerSnapshot, BrowserManagerState } from '../../shared/types/browser-api'

export interface BrowserLauncher {
  launchPersistentContext(profilePath: string): Promise<BrowserContext>
}
