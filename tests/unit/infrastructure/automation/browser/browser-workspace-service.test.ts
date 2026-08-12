import type { BrowserContext } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  BrowserWorkspaceService,
  type BrowserRuntimeManager,
  type PlatformPagesInitializer
} from '@/infrastructure/automation/browser/browser-workspace-service'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'

const context = {
  pages: () => [],
  newPage: async () => {
    throw new Error('Não utilizado neste teste')
  }
} as unknown as BrowserContext

class FakeBrowserManager implements BrowserRuntimeManager {
  public startCalls = 0
  public stopCalls = 0
  public shutdownCalls = 0

  private state: BrowserManagerSnapshot['state']

  constructor(initialState: BrowserManagerSnapshot['state'] = 'STOPPED') {
    this.state = initialState
  }

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

  async shutdown(): Promise<void> {
    this.shutdownCalls += 1
    this.state = 'STOPPED'
  }

  getContext(): BrowserContext {
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
  it('abre o navegador e prepara as páginas das plataformas', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    const snapshot = await service.start()

    expect(snapshot.state).toBe('RUNNING')
    expect(browserManager.startCalls).toBe(1)
    expect(pageManager.calls).toBe(1)
  })

  it('reutiliza o navegador aberto sem lançar uma segunda instância', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    const firstSnapshot = await service.ensureStarted()
    const secondSnapshot = await service.ensureStarted()

    expect(firstSnapshot.state).toBe('RUNNING')
    expect(secondSnapshot.state).toBe('RUNNING')
    expect(browserManager.startCalls).toBe(1)
    expect(pageManager.calls).toBe(2)
  })

  it('prepara novamente as páginas ao reutilizar navegador já aberto', async () => {
    const browserManager = new FakeBrowserManager('RUNNING')
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    const snapshot = await service.ensureStarted()

    expect(snapshot.state).toBe('RUNNING')
    expect(browserManager.startCalls).toBe(0)
    expect(pageManager.calls).toBe(1)
  })

  it('fecha navegador recém-aberto quando a preparação das páginas falha', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer(new Error('Falha ao abrir plataformas'))
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await expect(service.ensureStarted()).rejects.toThrow('Falha ao abrir plataformas')

    expect(browserManager.stopCalls).toBe(1)
    expect(browserManager.getSnapshot().state).toBe('STOPPED')
  })

  it('preserva navegador reutilizado quando a preparação das páginas falha', async () => {
    const browserManager = new FakeBrowserManager('RUNNING')
    const pageManager = new FakePagesInitializer(new Error('Falha ao validar plataformas'))
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await expect(service.ensureStarted()).rejects.toThrow('Falha ao validar plataformas')

    expect(browserManager.startCalls).toBe(0)
    expect(browserManager.stopCalls).toBe(0)
    expect(browserManager.getSnapshot().state).toBe('RUNNING')
  })

  it('expõe o contexto controlado do navegador', () => {
    const browserManager = new FakeBrowserManager('RUNNING')
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    expect(service.getContext()).toBe(context)
  })

  it('delega o encerramento ao gerenciador do navegador', async () => {
    const browserManager = new FakeBrowserManager()
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await service.start()

    const snapshot = await service.stop()

    expect(snapshot.state).toBe('STOPPED')
    expect(browserManager.stopCalls).toBe(1)
  })

  it('delega o shutdown quiescente ao gerenciador do navegador', async () => {
    const browserManager = new FakeBrowserManager('STARTING')
    const pageManager = new FakePagesInitializer()
    const service = new BrowserWorkspaceService(browserManager, pageManager)

    await service.shutdown()

    expect(browserManager.shutdownCalls).toBe(1)
    expect(browserManager.getSnapshot().state).toBe('STOPPED')
  })
})
