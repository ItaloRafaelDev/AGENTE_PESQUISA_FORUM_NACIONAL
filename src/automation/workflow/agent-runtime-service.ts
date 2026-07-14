import type { BrowserContext, Page } from 'playwright'
import type { CpiQueueMonitorOptions, CpiQueueMonitorResult } from '../cpi/cpi-queue-monitor'
import type { BrowserManagerSnapshot } from '../../shared/types/browser-api'
import type { PlatformSessionsSnapshot } from '../../shared/types/session-api'
import type { AgentControlSnapshot } from '../../shared/types/agent-control-api'
import { AgentController } from './agent-controller'

export interface AgentRuntimeBrowser {
  getSnapshot(): BrowserManagerSnapshot
  getContext(): BrowserContext
}

export interface AgentRuntimeSessionService {
  getSnapshot(): Promise<PlatformSessionsSnapshot>
}

export interface AgentRuntimeFilter {
  applyCriminalForumFilter(page: Page): Promise<void>
}

export interface AgentRuntimeMonitor {
  waitForResearch(page: Page, options?: CpiQueueMonitorOptions): Promise<CpiQueueMonitorResult>
}

export class AgentRuntimeService {
  private abortController: AbortController | null = null
  private monitorPromise: Promise<void> | null = null
  private cpiPage: Page | null = null

  constructor(
    private readonly controller: AgentController,
    private readonly browser: AgentRuntimeBrowser,
    private readonly sessions: AgentRuntimeSessionService,
    private readonly filter: AgentRuntimeFilter,
    private readonly monitor: AgentRuntimeMonitor
  ) {}

  getSnapshot(): AgentControlSnapshot {
    return this.controller.getSnapshot()
  }

  async start(): Promise<AgentControlSnapshot> {
    if (this.controller.getState() !== 'PARADO') {
      throw new Error(`O agente não pode iniciar no estado ${this.controller.getState()}`)
    }

    if (this.browser.getSnapshot().state !== 'RUNNING') {
      throw new Error('O navegador precisa estar aberto')
    }

    const sessions = await this.sessions.getSnapshot()

    if (!sessions.allAuthenticated) {
      throw new Error('CPI Central e DeskData precisam estar autenticadas')
    }

    const cpiPage = this.findCpiQueuePage()

    this.controller.start()

    try {
      await this.filter.applyCriminalForumFilter(cpiPage)

      this.controller.markReady()
      this.controller.beginWaitingForResearch()

      this.cpiPage = cpiPage
      this.startQueueMonitor(cpiPage)

      return this.getSnapshot()
    } catch (error) {
      this.cpiPage = null
      this.controller.stopSafely()

      throw error
    }
  }

  async pause(): Promise<AgentControlSnapshot> {
    if (this.controller.getState() === 'PARADO') {
      throw new Error('O agente já está parado')
    }

    this.controller.requestPause()
    await this.abortCurrentMonitor()

    return this.getSnapshot()
  }

  async resume(): Promise<AgentControlSnapshot> {
    const resumedState = this.controller.resume()

    if (resumedState === 'AGUARDANDO_NOVA_PESQUISA' && this.cpiPage) {
      this.startQueueMonitor(this.cpiPage)
    }

    return this.getSnapshot()
  }

  async stop(): Promise<AgentControlSnapshot> {
    await this.abortCurrentMonitor()

    this.cpiPage = null
    this.controller.stopSafely()

    return this.getSnapshot()
  }

  private findCpiQueuePage(): Page {
    const page = this.browser
      .getContext()
      .pages()
      .find((candidate) => {
        try {
          const url = new URL(candidate.url())

          return (
            url.hostname === 'adm.cpicentral.com.br' &&
            url.pathname
              .toLowerCase()
              .endsWith('/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx')
          )
        } catch {
          return false
        }
      })

    if (!page) {
      throw new Error('A página autenticada da fila da CPI não foi localizada')
    }

    return page
  }

  private startQueueMonitor(page: Page): void {
    if (this.monitorPromise) {
      throw new Error('O monitor da fila já está em execução')
    }

    const abortController = new AbortController()

    this.abortController = abortController

    const monitorPromise = this.monitor
      .waitForResearch(page, {
        signal: abortController.signal,

        isPauseRequested: () =>
          this.controller.getState() === 'PAUSADO' || this.controller.getState() === 'PAUSANDO'
      })
      .then((result) => {
        if (
          result.status === 'RESEARCH_AVAILABLE' &&
          !abortController.signal.aborted &&
          this.controller.getState() === 'AGUARDANDO_NOVA_PESQUISA'
        ) {
          this.controller.beginProcessing()
        }
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return
        }

        if (this.controller.getState() === 'AGUARDANDO_NOVA_PESQUISA') {
          this.controller.markTemporaryError()
          this.controller.recordFailure()
        }

        console.error('Falha no monitoramento da fila da CPI:', error)
      })
      .finally(() => {
        if (this.abortController === abortController) {
          this.abortController = null
        }

        if (this.monitorPromise === monitorPromise) {
          this.monitorPromise = null
        }
      })

    this.monitorPromise = monitorPromise
  }

  private async abortCurrentMonitor(): Promise<void> {
    const currentPromise = this.monitorPromise

    this.abortController?.abort()

    if (currentPromise) {
      await currentPromise
    }

    this.abortController = null
    this.monitorPromise = null
  }
}
