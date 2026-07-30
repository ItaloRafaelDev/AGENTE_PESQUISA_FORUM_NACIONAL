import { describe, expect, it } from 'vitest'
import {
  PlatformPageManager,
  type ManagedBrowserContext,
  type ManagedPage
} from '@/automation/browser/platform-page-manager'

class FakePage implements ManagedPage {
  public readonly navigations: string[] = []
  public readonly navigationTimeouts: Array<number | undefined> = []
  public bringToFrontCalls = 0
  private closed = false

  constructor(private currentUrl: string) {}

  url(): string {
    return this.currentUrl
  }

  isClosed(): boolean {
    return this.closed
  }

  async goto(url: string, options?: { timeout?: number }): Promise<null> {
    this.currentUrl = url
    this.navigations.push(url)
    this.navigationTimeouts.push(options?.timeout)

    return null
  }

  async bringToFront(): Promise<void> {
    this.bringToFrontCalls += 1
  }
}

class FakeContext implements ManagedBrowserContext {
  public newPageCalls = 0

  constructor(public readonly pageList: FakePage[]) {}

  pages(): ManagedPage[] {
    return this.pageList
  }

  async newPage(): Promise<ManagedPage> {
    this.newPageCalls += 1

    const page = new FakePage('about:blank')

    this.pageList.push(page)

    return page
  }
}

const urls = {
  cpiQueueUrl: 'https://cpi.example.test/fila',
  deskDataPeopleUrl: 'https://deskdata.example.test/pessoas/'
}

describe('PlatformPageManager', () => {
  it('deve exigir URLs de plataforma configuradas', () => {
    expect(() => new PlatformPageManager(undefined as never, 45_000)).toThrow()
  })

  it('deve reutilizar a aba em branco para a CPI e criar uma aba para a DeskData', async () => {
    const blankPage = new FakePage('about:blank')
    const context = new FakeContext([blankPage])
    const manager = new PlatformPageManager(urls, 47_321)

    const snapshot = await manager.ensurePages(context)

    expect(context.pageList).toHaveLength(2)
    expect(context.newPageCalls).toBe(1)
    expect(snapshot).toEqual({
      cpiPageUrl: urls.cpiQueueUrl,
      deskDataPageUrl: urls.deskDataPeopleUrl
    })
    expect(context.pageList.flatMap((page) => page.navigationTimeouts)).toEqual([47_321, 47_321])
    expect(blankPage.bringToFrontCalls).toBe(1)
  })

  it('deve reutilizar abas das plataformas já existentes', async () => {
    const cpiPage = new FakePage('https://cpi.example.test/login')
    const deskDataPage = new FakePage('https://deskdata.example.test/dashboard')

    const context = new FakeContext([cpiPage, deskDataPage])
    const manager = new PlatformPageManager(urls, 45_000)

    await manager.ensurePages(context)

    expect(context.newPageCalls).toBe(0)
    expect(context.pageList).toHaveLength(2)
    expect(cpiPage.url()).toBe(urls.cpiQueueUrl)
    expect(deskDataPage.url()).toBe(urls.deskDataPeopleUrl)
  })

  it('não deve criar abas duplicadas em uma segunda execução', async () => {
    const context = new FakeContext([new FakePage('about:blank')])
    const manager = new PlatformPageManager(urls, 45_000)

    await manager.ensurePages(context)
    await manager.ensurePages(context)

    expect(context.pageList).toHaveLength(2)
    expect(context.newPageCalls).toBe(1)
  })
})
