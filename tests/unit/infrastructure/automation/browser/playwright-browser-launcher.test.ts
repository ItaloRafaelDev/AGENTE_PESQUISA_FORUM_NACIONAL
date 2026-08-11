import type { BrowserContext } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  PlaywrightBrowserLauncher,
  type ChromiumDriver
} from '@/infrastructure/automation/browser/playwright-browser-launcher'

function createFakeContext(): BrowserContext {
  return {
    close: async () => undefined
  } as unknown as BrowserContext
}

describe('PlaywrightBrowserLauncher', () => {
  it('deve abrir um contexto persistente, visível e maximizado', async () => {
    const context = createFakeContext()

    let receivedProfilePath: string | undefined
    let receivedOptions: Record<string, unknown> | undefined

    const driver = {
      launchPersistentContext: async (
        profilePath: string,
        options?: Record<string, unknown>
      ): Promise<BrowserContext> => {
        receivedProfilePath = profilePath
        receivedOptions = options

        return context
      }
    } as ChromiumDriver

    const launcher = new PlaywrightBrowserLauncher(driver)

    const result = await launcher.launchPersistentContext('E:\\AgenteCPI\\browser-profile')

    expect(result).toBe(context)
    expect(receivedProfilePath).toBe('E:\\AgenteCPI\\browser-profile')
    expect(receivedOptions).toMatchObject({
      headless: false,
      acceptDownloads: true,
      viewport: null,
      args: ['--start-maximized']
    })
  })
})
