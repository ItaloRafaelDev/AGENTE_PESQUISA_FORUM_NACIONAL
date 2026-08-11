import { chromium, type BrowserContext } from 'playwright'
import type { BrowserLauncher } from './browser-types'

export type ChromiumDriver = Pick<typeof chromium, 'launchPersistentContext'>

export class PlaywrightBrowserLauncher implements BrowserLauncher {
  constructor(private readonly driver: ChromiumDriver = chromium) {}

  async launchPersistentContext(profilePath: string): Promise<BrowserContext> {
    return this.driver.launchPersistentContext(profilePath, {
      headless: false,
      acceptDownloads: true,
      viewport: null,
      args: ['--start-maximized']
    })
  }
}
