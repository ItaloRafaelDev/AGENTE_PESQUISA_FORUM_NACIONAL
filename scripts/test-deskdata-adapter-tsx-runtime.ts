import { chromium } from 'playwright'
import { PlaywrightDeskDataProcessPageAdapter } from '../src/automation/deskdata/playwright-deskdata-process-page-adapter'
import { DeskDataProcessCollector } from '../src/automation/deskdata/deskdata-process-collector'
import { classifyDeskDataSpheres } from '../src/domain/research/classify-deskdata-spheres'

async function main(): Promise<void> {
  const browser = await chromium.launch({
    headless: true
  })

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

    const adapter = new PlaywrightDeskDataProcessPageAdapter(page, 2_000)

    const processes = await new DeskDataProcessCollector(adapter).collect()

    const classification = classifyDeskDataSpheres(processes)

    const output = {
      processCount: classification.totalProcesses,
      normalizedSpheres: classification.normalizedSpheres,
      result: classification.result,
      reason: classification.reason
    }

    console.log(JSON.stringify(output, null, 2))

    if (
      output.processCount !== 1 ||
      output.result !== 'SIM_CONSTA_RESTRICAO' ||
      output.reason !== 'CRIMINAL_SPHERE_FOUND' ||
      output.normalizedSpheres[0] !== 'especial criminal'
    ) {
      throw new Error('O smoke test não produziu a classificação esperada.')
    }
  } finally {
    await page.close()
    await browser.close()
  }
}

void main()
