import type { ExecutionToken } from '@/application/agent/execution-control'
import type { ResearchQueuePort } from '@/application/ports/continuous-research-ports'
import type { Page } from 'playwright'
import type { CpiQueueMonitorOptions, CpiQueueMonitorResult } from '../cpi/cpi-queue-monitor'

export interface CpiQueueMonitorPort {
  waitForResearch(page: Page, options?: CpiQueueMonitorOptions): Promise<CpiQueueMonitorResult>
}

export class PlaywrightResearchQueueAdapter implements ResearchQueuePort {
  constructor(
    private readonly queueMonitor: CpiQueueMonitorPort,
    private readonly page: Page,
    private readonly signal: AbortSignal
  ) {}

  async waitForResearch(input: {
    token: ExecutionToken
    onState(state: 'CHECKING' | 'EMPTY' | 'AVAILABLE', checks: number): void
  }): Promise<{ status: 'AVAILABLE' | 'CANCELLED'; checks: number }> {
    const result = await this.queueMonitor.waitForResearch(this.page, {
      signal: this.signal,
      isPauseRequested: () => input.token.directive !== 'NONE',
      onState: (state, checks) =>
        input.onState(
          state === 'HAS_RESEARCH' ? 'AVAILABLE' : state === 'EMPTY' ? 'EMPTY' : 'CHECKING',
          checks
        )
    })

    return {
      status: result.status === 'RESEARCH_AVAILABLE' ? 'AVAILABLE' : 'CANCELLED',
      checks: result.checks
    }
  }
}
