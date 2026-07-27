import { describe, expect, it } from 'vitest'
import {
  PlatformSessionService,
  type SessionBrowserContext,
  type SessionBrowserRuntime,
  type SessionPage
} from '@/automation/session/platform-session-service'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'

class FakePage implements SessionPage {
  constructor(
    private readonly pageUrl: string,
    private readonly passwordVisible = false
  ) {}

  url(): string {
    return this.pageUrl
  }

  isClosed(): boolean {
    return false
  }

  locator(): {
    count(): Promise<number>
  } {
    return {
      count: async () => (this.passwordVisible ? 1 : 0)
    }
  }
}

class FakeContext implements SessionBrowserContext {
  constructor(private readonly pageList: SessionPage[]) {}

  pages(): SessionPage[] {
    return this.pageList
  }
}

class FakeBrowserRuntime implements SessionBrowserRuntime {
  constructor(
    private readonly state: BrowserManagerSnapshot['state'],
    private readonly context: SessionBrowserContext
  ) {}

  getSnapshot(): BrowserManagerSnapshot {
    return {
      state: this.state,
      profilePath: 'C:\\AgenteCPI\\browser-profile',
      startedAt: this.state === 'RUNNING' ? '2026-07-13T22:00:00.000Z' : null
    }
  }

  getContext(): SessionBrowserContext {
    return this.context
  }
}

describe('PlatformSessionService', () => {
  it('deve reconhecer as duas plataformas autenticadas', async () => {
    const context = new FakeContext([
      new FakePage(
        'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
      ),
      new FakePage('https://app.deskdata.com.br/pessoas/')
    ])

    const service = new PlatformSessionService(new FakeBrowserRuntime('RUNNING', context))

    const snapshot = await service.getSnapshot()

    expect(snapshot.cpi.state).toBe('AUTHENTICATED')
    expect(snapshot.deskData.state).toBe('AUTHENTICATED')
    expect(snapshot.allAuthenticated).toBe(true)
    expect(snapshot.checkedAt).toEqual(expect.any(String))
  })

  it('deve reconhecer a CPI aguardando login manual', async () => {
    const context = new FakeContext([
      new FakePage('https://adm.cpicentral.com.br/access_fault.aspx'),
      new FakePage('https://app.deskdata.com.br/pessoas/')
    ])

    const service = new PlatformSessionService(new FakeBrowserRuntime('RUNNING', context))

    const snapshot = await service.getSnapshot()

    expect(snapshot.cpi.state).toBe('WAITING_LOGIN')
    expect(snapshot.deskData.state).toBe('AUTHENTICATED')
    expect(snapshot.allAuthenticated).toBe(false)
  })

  it('deve retornar indeterminado quando o navegador estiver fechado', async () => {
    const service = new PlatformSessionService(
      new FakeBrowserRuntime('STOPPED', new FakeContext([]))
    )

    await expect(service.getSnapshot()).resolves.toMatchObject({
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
    })
  })

  it('deve identificar campo de senha visível', async () => {
    const context = new FakeContext([
      new FakePage('https://adm.cpicentral.com.br/login', true),
      new FakePage('https://deskdata.com.br/login', true)
    ])

    const service = new PlatformSessionService(new FakeBrowserRuntime('RUNNING', context))

    const snapshot = await service.getSnapshot()

    expect(snapshot.cpi.state).toBe('WAITING_LOGIN')
    expect(snapshot.deskData.state).toBe('WAITING_LOGIN')
  })
})
