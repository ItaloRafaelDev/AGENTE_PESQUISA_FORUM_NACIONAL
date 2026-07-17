import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { PlaywrightDeskDataProcessPageAdapter } from '../../../../src/automation/deskdata/playwright-deskdata-process-page-adapter'

describe('runtime de avaliação do adaptador', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true
    })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('instala o helper exigido pelo código serializado pelo tsx', async () => {
    const page = await browser.newPage()

    try {
      await page.setContent(`
            <section>
              <h2>Processos</h2>
              <p>
                Não foram encontrados processos.
              </p>
            </section>
          `)

      const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 1_000)

      await adapter.waitUntilReady()

      await expect(page.evaluate('typeof globalThis.__name')).resolves.toBe('function')
    } finally {
      await page.close()
    }
  })
})
