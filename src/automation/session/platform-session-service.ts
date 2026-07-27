import type { BrowserManagerSnapshot } from '../../shared/types/browser-api'
import type {
  PlatformSessionDetail,
  PlatformSessionsSnapshot
} from '../../shared/types/session-api'
import {
  detectCpiSession,
  detectDeskDataSession,
  type PageSessionEvidence
} from './platform-session-detector'

export interface SessionLocator {
  count(): Promise<number>
}

export interface SessionPage {
  url(): string
  isClosed(): boolean
  locator(selector: string): SessionLocator
}

export interface SessionBrowserContext {
  pages(): SessionPage[]
}

export interface SessionBrowserRuntime {
  getSnapshot(): BrowserManagerSnapshot
  getContext(): SessionBrowserContext
}

export class PlatformSessionService {
  constructor(private readonly browserRuntime: SessionBrowserRuntime) {}

  async getSnapshot(): Promise<PlatformSessionsSnapshot> {
    if (this.browserRuntime.getSnapshot().state !== 'RUNNING') {
      return {
        cpi: {
          state: 'INDETERMINATE',
          url: null
        },
        deskData: {
          state: 'INDETERMINATE',
          url: null
        },
        allAuthenticated: false,
        checkedAt: null
      }
    }

    const pages = this.browserRuntime
      .getContext()
      .pages()
      .filter((page) => !page.isClosed())

    const cpiPage = pages.find((page) => this.hasHostname(page.url(), 'adm.cpicentral.com.br'))

    const deskDataPage =
      pages.find((page) => this.hasHostname(page.url(), 'app.deskdata.com.br')) ??
      pages.find((page) => this.hasHostname(page.url(), 'deskdata.com.br'))

    const cpiEvidence = await this.inspectPage(cpiPage)
    const deskDataEvidence = await this.inspectPage(deskDataPage)

    const cpi: PlatformSessionDetail = {
      state: detectCpiSession(cpiEvidence),
      url: cpiEvidence?.url ?? null
    }

    const deskData: PlatformSessionDetail = {
      state: detectDeskDataSession(deskDataEvidence),
      url: deskDataEvidence?.url ?? null
    }

    return {
      cpi,
      deskData,
      allAuthenticated: cpi.state === 'AUTHENTICATED' && deskData.state === 'AUTHENTICATED',
      checkedAt: new Date().toISOString()
    }
  }

  private async inspectPage(page: SessionPage | undefined): Promise<PageSessionEvidence | null> {
    if (!page) {
      return null
    }

    const hasVisiblePasswordInput =
      (await page.locator('input[type="password"]:visible').count()) > 0

    return {
      url: page.url(),
      hasVisiblePasswordInput
    }
  }

  private hasHostname(pageUrl: string, hostname: string): boolean {
    try {
      return new URL(pageUrl).hostname === hostname
    } catch {
      return false
    }
  }
}
