import type {
  AgentWorkspacePort,
  ContinuousResearchExecutionPort
} from '@/application/ports/agent-runtime-ports'
import type { BrowserContext, Page } from 'playwright'
import type { PlaywrightAutomationConfig } from './playwright-automation-config'
import { createPlaywrightContinuousResearchExecutionAdapter } from './playwright-continuous-research-execution-adapter'

const CPI_HOSTNAME = 'adm.cpicentral.com.br'
const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'
const DESKDATA_HOSTNAME = 'app.deskdata.com.br'

export interface PlaywrightAgentWorkspaceBrowser {
  ensureStarted(): Promise<unknown>
  getContext(): BrowserContext
}

export interface PlaywrightAgentWorkspaceSessions {
  getSnapshot(): Promise<{ allAuthenticated: boolean }>
}

export interface PlaywrightAgentWorkspaceFilter {
  applyCriminalForumFilter(page: Page): Promise<void>
}

export class PlaywrightAgentWorkspaceAdapter implements AgentWorkspacePort {
  constructor(
    private readonly browser: PlaywrightAgentWorkspaceBrowser,
    private readonly sessions: PlaywrightAgentWorkspaceSessions,
    private readonly filter: PlaywrightAgentWorkspaceFilter,
    private readonly config: PlaywrightAutomationConfig
  ) {}

  async ensureStarted(): Promise<void> {
    await this.browser.ensureStarted()
  }

  async areSessionsAuthenticated(): Promise<boolean> {
    return (await this.sessions.getSnapshot()).allAuthenticated
  }

  async prepareContinuousExecution(): Promise<ContinuousResearchExecutionPort> {
    const context = this.browser.getContext()
    const cpiPage = this.findPage(context, CPI_HOSTNAME, CPI_QUEUE_PATH)
    const deskDataPage = this.findPage(context, DESKDATA_HOSTNAME)

    await this.filter.applyCriminalForumFilter(cpiPage)

    return createPlaywrightContinuousResearchExecutionAdapter({
      context,
      cpiPage,
      deskDataPage,
      config: this.config
    })
  }

  private findPage(context: BrowserContext, hostname: string, expectedPath?: string): Page {
    const page = context.pages().find((candidate) => {
      try {
        const url = new URL(candidate.url())

        return (
          url.hostname === hostname &&
          (expectedPath === undefined || url.pathname.toLowerCase() === expectedPath)
        )
      } catch {
        return false
      }
    })

    if (!page) {
      throw new Error(`A página autenticada de ${hostname} não foi localizada`)
    }

    return page
  }
}
