import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { PlaywrightDeskDataProcessPageAdapter } from '../../../../src/automation/deskdata/playwright-deskdata-process-page-adapter'

describe('PlaywrightDeskDataProcessPageAdapter', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true
    })
  })

  afterAll(async () => {
    await browser.close()
  })

  beforeEach(async () => {
    page = await browser.newPage()
  })

  afterEach(async () => {
    await page.close()
  })

  it('isola Processos, expande o cartão e lê campos estruturados', async () => {
    await page.setContent(`
          <main>
            <section>
              <h2>Dados básicos</h2>
              <p>Texto sem relação com processos.</p>
            </section>

            <section aria-labelledby="processos-title">
              <h2 id="processos-title">Processos</h2>

              <article data-process-card="proc-1">
                <button
                  id="toggle-1"
                  aria-expanded="false"
                  aria-controls="panel-1"
                >
                  Processo 1
                </button>

                <div id="panel-1" hidden>
                  <dl>
                    <dt>Número do processo</dt>
                    <dd>0000001-00.2024.0.00.0001</dd>

                    <dt>Vara</dt>
                    <dd>Juizado Especial Cível e Criminal</dd>

                    <dt>Esfera</dt>
                    <dd>Civil</dd>

                    <dt>Status</dt>
                    <dd>Arquivado</dd>
                  </dl>
                </div>
              </article>
            </section>

            <script>
              document
                .querySelector('#toggle-1')
                .addEventListener('click', (event) => {
                  const button = event.currentTarget
                  const panel =
                    document.querySelector('#panel-1')

                  button.setAttribute(
                    'aria-expanded',
                    'true'
                  )

                  panel.hidden = false
                })
            </script>
        `)

    const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 2_000)

    await adapter.waitUntilReady()
    await adapter.expandAllCards()

    await expect(page.locator('#toggle-1').getAttribute('aria-expanded')).resolves.toBe('true')

    const snapshot = await adapter.readCurrentPage()

    expect(snapshot.empty).toBe(false)
    expect(snapshot.cards).toHaveLength(1)

    expect(snapshot.cards[0]).toMatchObject({
      processKey: '000000100202400000001',
      processNumber: '0000001-00.2024.0.00.0001'
    })

    expect(snapshot.cards[0].fields).toEqual(
      expect.arrayContaining([
        {
          label: 'Vara',
          value: 'Juizado Especial Cível e Criminal'
        },
        {
          label: 'Esfera',
          value: 'Civil'
        },
        {
          label: 'Status',
          value: 'Arquivado'
        }
      ])
    )
  })

  it('reconhece ausência explícita de processos', async () => {
    await page.setContent(`
          <section>
            <h2>Processos</h2>
            <p>Não foram encontrados processos.</p>
          </section>
        `)

    const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 1_000)

    await adapter.waitUntilReady()

    await expect(adapter.readCurrentPage()).resolves.toMatchObject({
      empty: true,
      cards: [],
      hasNextPage: false
    })
  })

  it('falha quando a seção Processos não existe', async () => {
    await page.setContent(`
          <main>
            <h1>Resultado da consulta</h1>
            <section>
              <h2>Dados básicos</h2>
            </section>
          </main>
        `)

    const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 300)

    await expect(adapter.waitUntilReady()).rejects.toMatchObject({
      code: 'PROCESS_SECTION_NOT_FOUND'
    })
  })

  it('falha quando Próximo não muda o conteúdo', async () => {
    await page.setContent(`
          <section>
            <h2>Processos</h2>

            <article data-process-card="proc-1">
              <dl>
                <dt>Esfera</dt>
                <dd>Civil</dd>
              </dl>
            </article>

            <button aria-label="Próximo">
              Próximo
            </button>
          </section>
        `)

    const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 400)

    await adapter.waitUntilReady()

    const snapshot = await adapter.readCurrentPage()

    expect(snapshot.hasNextPage).toBe(true)

    await expect(adapter.goToNextPage(snapshot.pageSignature)).rejects.toMatchObject({
      code: 'PROCESS_PAGINATION_STALLED'
    })
  })
})
