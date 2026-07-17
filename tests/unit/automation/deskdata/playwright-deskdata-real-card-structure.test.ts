import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { PlaywrightDeskDataProcessPageAdapter } from '../../../../src/automation/deskdata/playwright-deskdata-process-page-adapter'
import { DeskDataProcessCollector } from '../../../../src/automation/deskdata/deskdata-process-collector'
import { classifyDeskDataSpheres } from '../../../../src/domain/research/classify-deskdata-spheres'

describe('estrutura real de cartão da DeskData', () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true
    })
  })

  afterAll(async () => {
    await browser.close()
  })

  it('lê Esfera em td.w-label dentro de div.card', async () => {
    const page = await browser.newPage()

    try {
      await page.setContent(`
            <main>
              <section>
                <h2>Processos</h2>

                <div class="card">
                  <div id="head-synthetic">
                    <h2 class="mb-0">
                      <button
                        class="btn btn-link btn-block text-left"
                        type="button"
                        data-toggle="collapse"
                        data-target="#body-synthetic"
                        aria-expanded="true"
                        aria-controls="body-synthetic"
                      >
                        0000001-00.2024.0.00.0001
                      </button>
                    </h2>
                  </div>

                  <div
                    id="body-synthetic"
                    class="collapse show"
                    aria-labelledby="head-synthetic"
                  >
                    <h6>Resumo</h6>

                    <table
                      class="table custom-table-hover table-sm"
                    >
                      <tbody>
                        <tr>
                          <td class="w-label">
                            Esfera
                          </td>

                          <td>
                            Especial criminal
                          </td>
                        </tr>

                        <tr>
                          <td class="w-label">
                            Status
                          </td>

                          <td>
                            Arquivado
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </main>
          `)

      const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 1_500)

      const processes = await new DeskDataProcessCollector(adapter).collect()

      expect(processes).toEqual([
        {
          processKey: '00000010020240000001',
          processNumber: '0000001-00.2024.0.00.0001',
          sphereRaw: 'Especial criminal',
          sourcePage: 1
        }
      ])

      expect(classifyDeskDataSpheres(processes)).toMatchObject({
        result: 'SIM_CONSTA_RESTRICAO',
        reason: 'CRIMINAL_SPHERE_FOUND',
        normalizedSpheres: ['especial criminal']
      })
    } finally {
      await page.close()
    }
  })
})
