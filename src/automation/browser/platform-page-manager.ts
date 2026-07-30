export interface PlatformUrls {
  cpiQueueUrl: string
  deskDataPeopleUrl: string
}

export interface ManagedPage {
  url(): string
  isClosed(): boolean
  goto(
    url: string,
    options?: {
      waitUntil?: 'domcontentloaded'
      timeout?: number
    }
  ): Promise<unknown>
  bringToFront(): Promise<void>
}

export interface ManagedBrowserContext {
  pages(): ManagedPage[]
  newPage(): Promise<ManagedPage>
}

export interface PlatformPagesSnapshot {
  cpiPageUrl: string
  deskDataPageUrl: string
}

export class PlatformPageManager {
  constructor(
    private readonly urls: PlatformUrls,
    private readonly navigationTimeoutMs: number
  ) {
    if (!urls) {
      throw new Error('URLs das plataformas não informadas')
    }
  }

  async ensurePages(context: ManagedBrowserContext): Promise<PlatformPagesSnapshot> {
    const usedPages = new Set<ManagedPage>()

    const cpiPage = await this.resolvePage(context, this.urls.cpiQueueUrl, usedPages)

    usedPages.add(cpiPage)

    const deskDataPage = await this.resolvePage(context, this.urls.deskDataPeopleUrl, usedPages)

    await cpiPage.bringToFront()

    return {
      cpiPageUrl: cpiPage.url(),
      deskDataPageUrl: deskDataPage.url()
    }
  }

  private async resolvePage(
    context: ManagedBrowserContext,
    targetUrl: string,
    usedPages: ReadonlySet<ManagedPage>
  ): Promise<ManagedPage> {
    const availablePages = context
      .pages()
      .filter((page) => !page.isClosed() && !usedPages.has(page))

    const matchingPage = availablePages.find((page) => this.hasSameHostname(page.url(), targetUrl))

    const blankPage = availablePages.find((page) => page.url() === 'about:blank')

    const page = matchingPage ?? blankPage ?? (await context.newPage())

    if (page.url() !== targetUrl) {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.navigationTimeoutMs
      })
    }

    return page
  }

  private hasSameHostname(currentUrl: string, targetUrl: string): boolean {
    try {
      return new URL(currentUrl).hostname === new URL(targetUrl).hostname
    } catch {
      return false
    }
  }
}
