import type { BrowserContext } from 'playwright'
import type { BrowserManagerSnapshot } from './browser-types'
import type { ManagedBrowserContext, PlatformPageManager } from './platform-page-manager'

export interface BrowserRuntimeManager {
  start(): Promise<BrowserManagerSnapshot>
  stop(): Promise<BrowserManagerSnapshot>
  getSnapshot(): BrowserManagerSnapshot
  getContext(): BrowserContext
}

export interface PlatformPagesInitializer {
  ensurePages(context: ManagedBrowserContext): Promise<unknown>
}

export class BrowserWorkspaceService {
  constructor(
    private readonly browserManager: BrowserRuntimeManager,
    private readonly pageManager: PlatformPagesInitializer
  ) {}

  async start(): Promise<BrowserManagerSnapshot> {
    return this.ensureStarted()
  }

  async ensureStarted(): Promise<BrowserManagerSnapshot> {
    const currentSnapshot = this.browserManager.getSnapshot()

    const wasAlreadyRunning = currentSnapshot.state === 'RUNNING'

    const runningSnapshot = wasAlreadyRunning ? currentSnapshot : await this.browserManager.start()

    try {
      await this.pageManager.ensurePages(this.browserManager.getContext())

      return runningSnapshot
    } catch (error) {
      if (!wasAlreadyRunning) {
        await this.browserManager.stop().catch(() => undefined)
      }

      throw error
    }
  }

  async stop(): Promise<BrowserManagerSnapshot> {
    return this.browserManager.stop()
  }

  getSnapshot(): BrowserManagerSnapshot {
    return this.browserManager.getSnapshot()
  }

  getContext(): BrowserContext {
    return this.browserManager.getContext()
  }
}

export type { PlatformPageManager }
