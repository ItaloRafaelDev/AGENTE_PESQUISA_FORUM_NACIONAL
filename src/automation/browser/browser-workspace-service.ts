import type { BrowserManagerSnapshot } from '../../shared/types/browser-api'
import type { ManagedBrowserContext, PlatformPageManager } from './platform-page-manager'

export interface BrowserRuntimeManager {
  start(): Promise<BrowserManagerSnapshot>
  stop(): Promise<BrowserManagerSnapshot>
  getSnapshot(): BrowserManagerSnapshot
  getContext(): ManagedBrowserContext
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
    const snapshot = await this.browserManager.start()

    try {
      await this.pageManager.ensurePages(this.browserManager.getContext())

      return snapshot
    } catch (error) {
      await this.browserManager.stop().catch(() => undefined)

      throw error
    }
  }

  async stop(): Promise<BrowserManagerSnapshot> {
    return this.browserManager.stop()
  }

  getSnapshot(): BrowserManagerSnapshot {
    return this.browserManager.getSnapshot()
  }
}

export type { PlatformPageManager }
