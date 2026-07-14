import type { BrowserContext } from 'playwright'
import type { BrowserLauncher, BrowserManagerSnapshot, BrowserManagerState } from './browser-types'

export class BrowserManager {
  private state: BrowserManagerState = 'STOPPED'
  private context: BrowserContext | null = null
  private startedAt: Date | null = null

  constructor(
    private readonly launcher: BrowserLauncher,
    private readonly profilePath: string
  ) {}

  getSnapshot(): BrowserManagerSnapshot {
    return {
      state: this.state,
      profilePath: this.profilePath,
      startedAt: this.startedAt?.toISOString() ?? null
    }
  }

  getContext(): BrowserContext {
    if (this.state !== 'RUNNING' || !this.context) {
      throw new Error('Contexto do navegador indisponível')
    }

    return this.context
  }

  async start(): Promise<BrowserManagerSnapshot> {
    if (this.state !== 'STOPPED') {
      throw new Error(`Navegador não pode iniciar no estado ${this.state}`)
    }

    this.state = 'STARTING'

    try {
      this.context = await this.launcher.launchPersistentContext(this.profilePath)

      this.startedAt = new Date()
      this.state = 'RUNNING'

      return this.getSnapshot()
    } catch (error) {
      this.context = null
      this.startedAt = null
      this.state = 'STOPPED'

      throw error
    }
  }

  async stop(): Promise<BrowserManagerSnapshot> {
    if (this.state === 'STOPPED') {
      return this.getSnapshot()
    }

    if (this.state !== 'RUNNING') {
      throw new Error(`Navegador não pode parar no estado ${this.state}`)
    }

    this.state = 'STOPPING'

    const context = this.context

    try {
      await context?.close()
    } finally {
      this.context = null
      this.startedAt = null
      this.state = 'STOPPED'
    }

    return this.getSnapshot()
  }
}
