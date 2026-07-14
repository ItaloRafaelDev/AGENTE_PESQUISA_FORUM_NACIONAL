import { describe, expect, it } from 'vitest'
import {
  BrowserWorkspaceService,
  type BrowserRuntimeManager,
  type PlatformPagesInitializer
} from '@/automation/browser/browser-workspace-service'
import type { ManagedBrowserContext } from '@/automation/browser/platform-page-manager'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'

const context = {
  pages: () => [],
  newPage: async () => {
    throw new Error('Não utilizado neste teste')
  }
} as ManagedBrowserContext

class FakeBrowserManager implements BrowserRuntimeManager {
  public startCalls = 0
  public stopCalls = 0
  private state: BrowserManagerSnapshot['state'] = 'STOPPED'

  async start(): Promise<BrowserManagerSnapshot> {
    this.startCalls += 1
    this.state = 'RUNNING'

    return this.getSnapshot()
  }

  async stop(): Promise<BrowserManagerSnapshot> {
    this.stopCalls += 1
    this.state = 'STOPPED'

    return this.getSnapshot()
  }

  getContext(): ManagedBrowserContext {
    return context
  }

  getSnapshot(): BrowserManagerSnapshot {
    return {
      state: this.state,
      profilePath: 'C:\\AgenteCPI\\browser-profile',
      startedAt: this.state === 'RUNNING' ? '2026-07-13T22:00:00.000Z' : null
    }
  }
}

class FakePagesInitializer implements PlatformPagesInitializer {
  public calls = 0

  constructor(private readonly error?: Error) {}

  async ensurePages(): Promise<void> {
    this.calls += 1

    if (this.error) {
      throw this.error
    }
  }
}

describe('BrowserWorkspaceService', () => {
  it('deve abrir o navegador e preparar as páginas das plataformas', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    const snapshot = await service.start()

    expect(snapshot.state).toBe('RUNNING')
    expect(browserManager.startCalls).toBe(1)
    expect(pageManager.calls).toBe(1)
  })

  it('deve fechar o navegador quando a preparação das páginas falhar', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer(new Error('Falha ao abrir plataformas'))

    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await expect(service.start()).rejects.toThrow('Falha ao abrir plataformas')

    expect(browserManager.stopCalls).toBe(1)
    expect(browserManager.getSnapshot().state).toBe('STOPPED')
  })

  it('deve delegar o encerramento ao gerenciador do navegador', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await service.start()
    const snapshot = await service.stop()

    expect(snapshot.state).toBe('STOPPED')
    expect(browserManager.stopCalls).toBe(1)
  })
})
