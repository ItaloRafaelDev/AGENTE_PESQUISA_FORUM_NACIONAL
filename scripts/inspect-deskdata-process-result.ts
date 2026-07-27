import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join, resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { isValidCpf, maskCpfForLog } from '../src/shared/utils/cpf'
import { DeskDataCpfFormController } from '../src/automation/deskdata/deskdata-cpf-form-controller'
import { DeskDataDatasetController } from '../src/automation/deskdata/deskdata-dataset-controller'
import { DeskDataSearchSubmitController } from '../src/automation/deskdata/deskdata-search-submit-controller'
import {
  DeskDataProcessResultInspector,
  type DeskDataInspectionScenario,
  type RawDeskDataProcessInspection
} from '../src/automation/deskdata/deskdata-process-result-inspector'

import { DeskDataProcessDomCapture } from '../src/automation/deskdata/deskdata-process-dom-capture'
import { parseDeskDataInspectionScenario } from '../src/automation/deskdata/deskdata-inspection-scenario-parser'
import { findDeskDataPeoplePage } from '../src/automation/deskdata/deskdata-page-finder'
import { DeskDataSafeClassificationReportBuilder } from '../src/automation/deskdata/deskdata-safe-classification-report-builder'
import { PlaywrightDeskDataProcessPageAdapter } from '../src/automation/deskdata/playwright-deskdata-process-page-adapter'
import { DeskDataProcessCollector } from '../src/automation/deskdata/deskdata-process-collector'
import { classifyDeskDataSpheres } from '../src/domain/research/classify-deskdata-spheres'
const DESKDATA_PEOPLE_URL = 'https://app.deskdata.com.br/pessoas/'

const HEADING_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'legend',
  '[role="heading"]',
  '.card-header',
  '.panel-heading',
  '.accordion-button'
].join(', ')

async function captureRawInspection(
  page: Page,
  scenario: DeskDataInspectionScenario
): Promise<RawDeskDataProcessInspection> {
  const domCapture = new DeskDataProcessDomCapture()
  const bodyText = await page.locator('body').innerText({
    timeout: 10_000
  })

  const headings = await page.locator(HEADING_SELECTOR).allTextContents()

  return {
    scenario,
    capturedAt: new Date().toISOString(),
    sourceUrl: page.url(),
    pageTitle: await page.title(),
    bodyText,
    headings,
    tables: await domCapture.captureTables(page),
    candidates: await domCapture.captureCandidates(page)
  }
}

async function main(): Promise<void> {
  const legacyInspection = process.argv.includes('--legacy-inspection')

  const scenario = parseDeskDataInspectionScenario(
    process.argv.slice(2).filter((argument) => argument !== '--legacy-inspection')
  )
  const appData = process.env.APPDATA

  if (!appData) {
    throw new Error('Variável APPDATA não encontrada.')
  }

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const context = await chromium.launchPersistentContext(
    join(appData, 'AgenteCPI', 'browser-profile'),
    {
      headless: false,
      viewport: null,
      acceptDownloads: true,
      args: ['--start-maximized']
    }
  )

  try {
    const pageManager = new PlatformPageManager()

    await pageManager.ensurePages(context)

    let deskDataPage = findDeskDataPeoplePage(context.pages())

    if (!deskDataPage) {
      throw new Error('A aba da DeskData não foi localizada.')
    }

    await deskDataPage.goto(DESKDATA_PEOPLE_URL, {
      waitUntil: 'domcontentloaded'
    })

    if ((await deskDataPage.locator('input[type="password"]:visible').count()) > 0) {
      await terminal.question(
        'Faça o login manual na DeskData, abra Consultar pessoas e pressione ENTER...'
      )

      deskDataPage = findDeskDataPeoplePage(context.pages())
    }

    if (!deskDataPage) {
      throw new Error('A página da DeskData não foi confirmada.')
    }

    if (!deskDataPage.url().includes('/pessoas')) {
      await deskDataPage.goto(DESKDATA_PEOPLE_URL, {
        waitUntil: 'domcontentloaded'
      })
    }

    const rawCpf = (await terminal.question(`Informe o CPF para ${scenario}: `)).trim()

    const cpf = rawCpf.replace(/\D/g, '')

    if (!isValidCpf(cpf)) {
      throw new Error('O CPF informado é inválido.')
    }

    await new DeskDataCpfFormController().fillCpf(deskDataPage, cpf)

    const datasetResult = await new DeskDataDatasetController().applyDatasetIds(deskDataPage, [
      'processes'
    ])

    await deskDataPage.bringToFront()

    console.log(`CPF preparado: ${maskCpfForLog(cpf)}`)

    console.log(`Conjuntos selecionados: ${datasetResult.selectedIds.join(', ')}`)

    console.log('A consulta ainda NÃO foi enviada.')

    const confirmation = (
      await terminal.question('Digite CONFIRMAR para consumir uma consulta somente de Processos: ')
    )
      .trim()
      .toUpperCase()

    if (confirmation !== 'CONFIRMAR') {
      console.log('Captura cancelada sem realizar consulta.')

      return
    }

    await new DeskDataSearchSubmitController().submitOnce(deskDataPage)

    await deskDataPage
      .waitForLoadState('networkidle', {
        timeout: 30_000
      })
      .catch(() => undefined)

    await deskDataPage.waitForTimeout(3_000)

    await deskDataPage.bringToFront()

    await terminal.question(
      'Quando o resultado estiver totalmente carregado, pressione ENTER para capturar...'
    )

    // STRUCTURED_SPHERE_INSPECTION_START
    if (!legacyInspection) {
      const processPageAdapter = new PlaywrightDeskDataProcessPageAdapter(deskDataPage)

      const processes = await new DeskDataProcessCollector(processPageAdapter).collect()

      const classification = classifyDeskDataSpheres(processes)

      const pageCount = processes.reduce(
        (maximum, process) => Math.max(maximum, process.sourcePage),
        processes.length > 0 ? 1 : 0
      )

      const safeOutput = {
        scenario,
        processCount: classification.totalProcesses,
        pageCount,
        normalizedSpheres: classification.normalizedSpheres,
        result: classification.result,
        reason: classification.reason
      }

      console.log(JSON.stringify(safeOutput, null, 2))

      await terminal.question(
        'Inspeção estruturada concluída. Pressione ENTER para fechar o navegador...'
      )

      return
    }
    // STRUCTURED_SPHERE_INSPECTION_END

    const inspector = new DeskDataProcessResultInspector()

    const snapshot = inspector.build(await captureRawInspection(deskDataPage, scenario))

    const safeReportLines = new DeskDataSafeClassificationReportBuilder().build(snapshot)

    const outputDirectory = resolve('artifacts', 'deskdata-inspection')

    await mkdir(outputDirectory, {
      recursive: true
    })

    const jsonPath = join(outputDirectory, `${scenario}.json`)

    const textPath = join(outputDirectory, `${scenario}.txt`)

    await writeFile(jsonPath, JSON.stringify(snapshot, null, 2), 'utf8')

    await writeFile(textPath, inspector.toText(snapshot), 'utf8')

    console.log('Captura concluída.')
    console.log(`JSON: ${jsonPath}`)
    console.log(`TXT: ${textPath}`)
    console.log('O CPF não foi gravado nos arquivos.')

    safeReportLines.forEach((line) => console.log(line))

    await terminal.question('Pressione ENTER para fechar o navegador...')
  } catch (error: unknown) {
    console.error('Falha na inspeção da DeskData:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
