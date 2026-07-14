import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'
import { CpiQueueAvailabilityReader } from '../src/automation/cpi/cpi-queue-availability'
import { CpiFirstResearchOpener } from '../src/automation/cpi/cpi-first-research-opener'
import { CpiQueueFilterController } from '../src/automation/cpi/cpi-queue-filter-controller'
import { CpiQueueMonitor } from '../src/automation/cpi/cpi-queue-monitor'
import { evaluateCpiFieldStructures } from '../src/automation/cpi/cpi-field-structure-evaluator'

interface RawForm {
  id: string
  name: string
  method: string
  action: string
}

interface RawControl {
  tag: string
  id: string
  name: string
  type: string
  className: string
  title: string
  ariaLabel: string
  placeholder: string
  associatedLabel: string
  disabled: boolean
  readOnly: boolean
  required: boolean
  valueLength: number
  optionTexts: string[]
  selectedOptionText: string
}

interface RawFieldStructure {
  label: string
  tag: string
  id: string
  className: string
  directTextLength: number
  fullTextLength: number
  childCount: number
  parentTag: string
  parentId: string
  parentClassName: string
  parentTextLength: number
  nextSiblingTag: string
  nextSiblingId: string
  nextSiblingClassName: string
  nextSiblingTextLength: number
}

const DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

const FIELD_LABELS = [
  'Pesquisa',
  'CPF',
  'Nome do Pesquisado',
  'RG',
  'Órgão Emissor RG',
  'Data de Expedição RG',
  'Nascimento',
  'Pai',
  'Mãe',
  'Valor',
  'Pesquisador/Fonte',
  'Pesquisador/Fonte 1º',
  'Status'
]

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeUrl(value: string): string {
  if (!value) {
    return ''
  }

  try {
    const url = new URL(value)

    return `${url.origin}${url.pathname}`
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

function sanitizeLabel(value: string): string {
  const normalized = normalizeText(value)

  if (!normalized) {
    return ''
  }

  if (normalized.includes('@') || /\d{3,}/.test(normalized)) {
    return '[ocultado]'
  }

  return normalized.slice(0, 120)
}

function sanitizeOption(value: string): string {
  const normalized = normalizeText(value)

  if (!normalized) {
    return ''
  }

  if (normalized.includes('@') || /\d{3,}/.test(normalized)) {
    return '[opção ocultada]'
  }

  return normalized.slice(0, 120)
}

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => {
    try {
      return new URL(page.url()).hostname === 'adm.cpicentral.com.br'
    } catch {
      return false
    }
  })
}

function findDetailFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => {
    try {
      return new URL(frame.url()).pathname.toLowerCase() === DETAIL_FRAME_PATH
    } catch {
      return false
    }
  })
}

async function inspectForms(frame: Frame): Promise<Array<Record<string, unknown>>> {
  const rawForms = await frame.locator('form').evaluateAll((elements): RawForm[] =>
    elements.map((element) => {
      const form = element as HTMLFormElement

      return {
        id: form.id ?? '',
        name: form.name ?? '',
        method: form.method ?? '',
        action: form.action ?? ''
      }
    })
  )

  return rawForms.map((form) => ({
    id: form.id,
    name: form.name,
    method: form.method,
    actionPath: sanitizeUrl(form.action)
  }))
}

async function inspectControls(frame: Frame): Promise<Array<Record<string, unknown>>> {
  const rawControls = await frame
    .locator('input, select, textarea, button, a')
    .evaluateAll((elements): RawControl[] =>
      elements.map((element) => {
        const htmlElement = element as HTMLElement

        const input = element as HTMLInputElement

        const select = element as HTMLSelectElement

        let associatedLabel = ''

        if (htmlElement.id) {
          const label = document.querySelector(`label[for="${CSS.escape(htmlElement.id)}"]`)

          associatedLabel = label?.textContent ?? ''
        }

        if (!associatedLabel) {
          associatedLabel = element.closest('label')?.textContent ?? ''
        }

        const optionTexts =
          element.tagName === 'SELECT'
            ? Array.from(select.options).map((option) => option.textContent ?? '')
            : []

        const selectedOptionText =
          element.tagName === 'SELECT' ? (select.selectedOptions[0]?.textContent ?? '') : ''

        return {
          tag: element.tagName.toLowerCase(),
          id: htmlElement.id ?? '',
          name: input.name ?? '',
          type: input.type ?? '',
          className: typeof htmlElement.className === 'string' ? htmlElement.className : '',
          title: htmlElement.getAttribute('title') ?? '',
          ariaLabel: htmlElement.getAttribute('aria-label') ?? '',
          placeholder: input.placeholder ?? '',
          associatedLabel,
          disabled: input.disabled ?? false,
          readOnly: input.readOnly ?? false,
          required: input.required ?? false,
          valueLength: typeof input.value === 'string' ? input.value.length : 0,
          optionTexts,
          selectedOptionText
        }
      })
    )

  return rawControls.map((control) => ({
    tag: control.tag,
    id: sanitizeLabel(control.id),
    name: sanitizeLabel(control.name),
    type: control.type,
    className: control.className,
    title: sanitizeLabel(control.title),
    ariaLabel: sanitizeLabel(control.ariaLabel),
    placeholder: sanitizeLabel(control.placeholder),
    associatedLabel: sanitizeLabel(control.associatedLabel),
    disabled: control.disabled,
    readOnly: control.readOnly,
    required: control.required,
    hasValue: control.valueLength > 0,
    valueLength: control.valueLength,
    optionCount: control.optionTexts.length,
    optionTexts: control.optionTexts.map(sanitizeOption),
    selectedOptionText: sanitizeOption(control.selectedOptionText)
  }))
}

async function inspectFieldStructures(frame: Frame): Promise<RawFieldStructure[]> {
  return frame.locator('body').evaluate(evaluateCpiFieldStructures, FIELD_LABELS)
}
async function main(): Promise<void> {
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

    let cpiPage = findCpiPage(context.pages())

    if (!cpiPage) {
      throw new Error('A aba da CPI Central não foi localizada.')
    }

    if (!cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      await terminal.question(
        'Faça o login manual na CPI, deixe a fila aberta e pressione ENTER...'
      )

      cpiPage = findCpiPage(context.pages())
    }

    if (!cpiPage || !cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
    }

    await cpiPage.bringToFront()

    const filterController = new CpiQueueFilterController()

    const monitor = new CpiQueueMonitor(filterController, new CpiQueueAvailabilityReader())

    console.log('Aplicando filtro 29...')

    await filterController.applyCriminalForumFilter(cpiPage)

    console.log('Aguardando pesquisa disponível...')

    const monitorResult = await monitor.waitForResearch(cpiPage)

    if (monitorResult.status !== 'RESEARCH_AVAILABLE') {
      throw new Error('Nenhuma pesquisa disponível foi confirmada.')
    }

    const opener = new CpiFirstResearchOpener()

    await opener.openFirst(cpiPage)

    const detailFrame = findDetailFrame(cpiPage)

    if (!detailFrame) {
      throw new Error('O formulário interno da pesquisa não foi localizado.')
    }

    const report = {
      framePath: sanitizeUrl(detailFrame.url()),
      forms: await inspectForms(detailFrame),
      controls: await inspectControls(detailFrame),
      fieldStructures: await inspectFieldStructures(detailFrame)
    }

    console.dir(report, {
      depth: null,
      colors: true
    })

    console.log('Nenhum campo foi preenchido, alterado ou salvo.')

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } catch (error: unknown) {
    console.error('Falha ao inspecionar o formulário:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()

    console.log('Navegador encerrado com segurança.')
  }
}

void main()
