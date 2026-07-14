import type { BrowserContext, Page } from 'playwright'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'
import type { PlatformSessionsSnapshot } from '@/shared/types/session-api'
import { describe, expect, it } from 'vitest'
import {
  AgentRuntimeService,
  type AgentRuntimeBrowser,
  type AgentRuntimeFilter,
  type AgentRuntimeMonitor,
  type AgentRuntimeSessionService
} from '@/automation/workflow/agent-runtime-service'
import { AgentController } from '@/automation/workflow/agent-controller'
import type { CpiQueueMonitorOptions } from '@/automation/cpi/cpi-queue-monitor'

function createCpiPage(): Page {
  return {
    url: () =>
      'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
  } as unknown as Page
}

class FakeBrowser implements AgentRuntimeBrowser {
  constructor(
    private readonly page: Page,
    private readonly running = true
  ) {}

  getSnapshot(): BrowserManagerSnapshot {
    return {
      state: this.running ? ('RUNNING' as const) : ('STOPPED' as const),
      profilePath: 'C:\\AgenteCPI\\browser-profile',
      startedAt: this.running ? '2026-07-14T08:00:00.000Z' : null
    }
  }

  getContext(): BrowserContext {
    return {
      pages: () => [this.page]
    } as unknown as BrowserContext
  }
}

class FakeSessions implements AgentRuntimeSessionService {
  constructor(private readonly authenticated = true) {}

  async getSnapshot(): Promise<PlatformSessionsSnapshot> {
    return {
      cpi: {
        state: this.authenticated ? ('AUTHENTICATED' as const) : ('WAITING_LOGIN' as const),
        url: null
      },
      deskData: {
        state: 'AUTHENTICATED' as const,
        url: null
      },
      allAuthenticated: this.authenticated,
      checkedAt: '2026-07-14T08:00:00.000Z'
    }
  }
}

class FakeFilter implements AgentRuntimeFilter {
  public calls = 0

  async applyCriminalForumFilter(): Promise<void> {
    this.calls += 1
  }
}

class ControlledMonitor implements AgentRuntimeMonitor {
  public calls = 0
  public lastOptions: CpiQueueMonitorOptions | null = null

  private resolver:
    ((result: { status: 'RESEARCH_AVAILABLE' | 'PAUSED'; checks: number }) => void) | null = null

  waitForResearch(
    _page: Page,
    options: CpiQueueMonitorOptions
  ): Promise<{
    status: 'RESEARCH_AVAILABLE' | 'PAUSED'
    checks: number
  }> {
    this.calls += 1
    this.lastOptions = options

    return new Promise((resolve) => {
      this.resolver = resolve

      options.signal?.addEventListener(
        'abort',
        () => {
          resolve({
            status: 'PAUSED',
            checks: 1
          })
        },
        {
          once: true
        }
      )
    })
  }

  releaseResearch(): void {
    this.resolver?.({
      status: 'RESEARCH_AVAILABLE',
      checks: 1
    })
  }
}

describe('AgentRuntimeService', () => {
  it('deve aplicar o filtro e iniciar o monitor da fila', async () => {
    const controller = new AgentController()
    const filter = new FakeFilter()
    const monitor = new ControlledMonitor()

    const service = new AgentRuntimeService(
      controller,
      new FakeBrowser(createCpiPage()),
      new FakeSessions(),
      filter,
      monitor
    )

    const snapshot = await service.start()

    expect(snapshot.state).toBe('AGUARDANDO_NOVA_PESQUISA')
    expect(filter.calls).toBe(1)
    expect(monitor.calls).toBe(1)
  })

  it('deve mudar para PROCESSANDO quando uma pesquisa surgir', async () => {
    const controller = new AgentController()
    const monitor = new ControlledMonitor()

    const service = new AgentRuntimeService(
      controller,
      new FakeBrowser(createCpiPage()),
      new FakeSessions(),
      new FakeFilter(),
      monitor
    )

    await service.start()

    monitor.releaseResearch()

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(service.getSnapshot().state).toBe('PROCESSANDO')
  })

  it('deve pausar o monitor de forma segura', async () => {
    const controller = new AgentController()
    const monitor = new ControlledMonitor()

    const service = new AgentRuntimeService(
      controller,
      new FakeBrowser(createCpiPage()),
      new FakeSessions(),
      new FakeFilter(),
      monitor
    )

    await service.start()

    const snapshot = await service.pause()

    expect(snapshot.state).toBe('PAUSADO')
    expect(monitor.lastOptions?.signal?.aborted).toBe(true)
  })

  it('deve reiniciar o monitor ao continuar', async () => {
    const controller = new AgentController()
    const monitor = new ControlledMonitor()

    const service = new AgentRuntimeService(
      controller,
      new FakeBrowser(createCpiPage()),
      new FakeSessions(),
      new FakeFilter(),
      monitor
    )

    await service.start()
    await service.pause()
    await service.resume()

    expect(service.getSnapshot().state).toBe('AGUARDANDO_NOVA_PESQUISA')

    expect(monitor.calls).toBe(2)
  })

  it('deve impedir o início sem autenticação', async () => {
    const service = new AgentRuntimeService(
      new AgentController(),
      new FakeBrowser(createCpiPage()),
      new FakeSessions(false),
      new FakeFilter(),
      new ControlledMonitor()
    )

    await expect(service.start()).rejects.toThrow(
      'CPI Central e DeskData precisam estar autenticadas'
    )

    expect(service.getSnapshot().state).toBe('PARADO')
  })

  it('deve impedir o início com o navegador fechado', async () => {
    const service = new AgentRuntimeService(
      new AgentController(),
      new FakeBrowser(createCpiPage(), false),
      new FakeSessions(),
      new FakeFilter(),
      new ControlledMonitor()
    )

    await expect(service.start()).rejects.toThrow('O navegador precisa estar aberto')
  })

  it('deve parar o monitor e retornar para PARADO', async () => {
    const service = new AgentRuntimeService(
      new AgentController(),
      new FakeBrowser(createCpiPage()),
      new FakeSessions(),
      new FakeFilter(),
      new ControlledMonitor()
    )

    await service.start()

    const snapshot = await service.stop()

    expect(snapshot.state).toBe('PARADO')
  })
})
