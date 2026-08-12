import type { BrowserContext } from 'playwright'
import type { BrowserLauncher, BrowserManagerSnapshot, BrowserManagerState } from './browser-types'

const BROWSER_SHUTDOWN_MESSAGE = 'Navegador indisponível durante o encerramento seguro.'

export class BrowserManager {
  private state: BrowserManagerState = 'STOPPED'
  private context: BrowserContext | null = null
  private startedAt: Date | null = null
  private startOperation: Promise<BrowserManagerSnapshot> | null = null
  private stopOperation: Promise<BrowserManagerSnapshot> | null = null
  private shutdownOperation: Promise<void> | null = null
  private shutdownRequested = false

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

  start(): Promise<BrowserManagerSnapshot> {
    if (this.shutdownRequested) {
      return Promise.reject(new Error(BROWSER_SHUTDOWN_MESSAGE))
    }

    if (this.state !== 'STOPPED') {
      return Promise.reject(new Error(`Navegador não pode iniciar no estado ${this.state}`))
    }

    this.state = 'STARTING'
    this.startOperation = this.launchContext()

    return this.startOperation
  }

  private async launchContext(): Promise<BrowserManagerSnapshot> {
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
    } finally {
      this.startOperation = null
    }
  }

  stop(): Promise<BrowserManagerSnapshot> {
    if (this.state === 'STOPPED') {
      return Promise.resolve(this.getSnapshot())
    }

    if (this.state !== 'RUNNING') {
      return Promise.reject(new Error(`Navegador não pode parar no estado ${this.state}`))
    }

    this.state = 'STOPPING'
    this.stopOperation = this.closeContext()

    return this.stopOperation
  }

  private async closeContext(): Promise<BrowserManagerSnapshot> {
    const context = this.context

    try {
      await context?.close()
    } finally {
      this.context = null
      this.startedAt = null
      this.state = 'STOPPED'
      this.stopOperation = null
    }

    return this.getSnapshot()
  }

  shutdown(): Promise<void> {
    if (!this.shutdownOperation) {
      this.shutdownRequested = true
      this.shutdownOperation = this.waitForQuiescence()
    }

    return this.shutdownOperation
  }

  private async waitForQuiescence(): Promise<void> {
    try {
      await this.startOperation
    } catch {
      // A failed launch has no browser context to close.
    }

    if (this.stopOperation) {
      await this.stopOperation
      return
    }

    if (this.state === 'RUNNING') {
      await this.stop()
    }
  }
}
