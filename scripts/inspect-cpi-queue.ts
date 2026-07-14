import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Frame, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'

interface InspectedControl {
  tag: string
  id: string
  name: string
  type: string
  className: string
  title: string
  ariaLabel: string
  role: string
  srcPath: string
  hrefPath: string
  text: string
  checked: boolean | null
  labelText: string
  parentTag: string
  parentId: string
  parentClassName: string
  parentTitle: string
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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeControlText(value: string): string {
  const normalized = normalizeText(value)

  if (!normalized) {
    return ''
  }

  const allowedPattern =
    /filtro|avançado|avancado|selecionar|mostrar tudo|processos judiciais criminal|nenhum registro|nenhum resultado|aguardando|pesquisa/i

  if (allowedPattern.test(normalized)) {
    return normalized.slice(0, 160)
  }

  return '[texto ocultado]'
}

function sanitizeHeader(value: string): string {
  const normalized = normalizeText(value)

  if (!normalized || normalized.includes('@') || /\d{3,}/.test(normalized)) {
    return ''
  }

  return normalized.slice(0, 80)
}

async function inspectControls(frame: Frame): Promise<InspectedControl[]> {
  const controls = await frame
    .locator(['button', 'a', 'input', 'select', '[role="button"]', 'img'].join(','))
    .evaluateAll((elements) => {
      return elements
        .map((element) => {
          const htmlElement = element as HTMLElement
          const inputElement = element as HTMLInputElement
          const anchorElement = element as HTMLAnchorElement
          const imageElement = element as HTMLImageElement
          const parentElement = element.parentElement

          const style = window.getComputedStyle(htmlElement)
          const rectangle = htmlElement.getBoundingClientRect()

          const visible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rectangle.width > 0 &&
            rectangle.height > 0

          let labelText = ''

          if (inputElement.id) {
            const labels = Array.from(document.querySelectorAll('label'))

            const associatedLabel = labels.find((label) => label.htmlFor === inputElement.id)

            labelText = associatedLabel?.textContent ?? ''
          }

          if (!labelText) {
            labelText = element.closest('label')?.textContent ?? ''
          }

          return {
            visible,
            tag: element.tagName.toLowerCase(),
            id: htmlElement.id ?? '',
            name: inputElement.name ?? '',
            type: inputElement.type ?? '',
            className: typeof htmlElement.className === 'string' ? htmlElement.className : '',
            title: htmlElement.getAttribute('title') ?? '',
            ariaLabel: htmlElement.getAttribute('aria-label') ?? '',
            role: htmlElement.getAttribute('role') ?? '',
            src: imageElement.src ?? '',
            href: anchorElement.href ?? '',
            text: htmlElement.innerText ?? htmlElement.textContent ?? '',
            checked: inputElement.type === 'checkbox' ? inputElement.checked : null,
            labelText,
            parentTag: parentElement?.tagName.toLowerCase() ?? '',
            parentId: parentElement?.id ?? '',
            parentClassName:
              typeof parentElement?.className === 'string' ? parentElement.className : '',
            parentTitle: parentElement?.getAttribute('title') ?? ''
          }
        })
        .filter((control) => {
          if (!control.visible) {
            return false
          }

          const searchableText = [
            control.id,
            control.name,
            control.type,
            control.className,
            control.title,
            control.ariaLabel,
            control.role,
            control.src,
            control.href,
            control.text,
            control.labelText,
            control.parentId,
            control.parentClassName,
            control.parentTitle
          ]
            .join(' ')
            .toLowerCase()

          return (
            control.type === 'checkbox' ||
            control.type === 'button' ||
            control.type === 'submit' ||
            control.tag === 'button' ||
            control.tag === 'select' ||
            control.role === 'button' ||
            /filtro|filter|engren|config|gear|cog|mostrar|todos|selecionar|processos|eye|olho|pesquisa/.test(
              searchableText
            )
          )
        })
    })
    .catch(() => [])

  return controls.map((control) => ({
    tag: control.tag,
    id: control.id,
    name: control.name,
    type: control.type,
    className: control.className,
    title: sanitizeControlText(control.title),
    ariaLabel: sanitizeControlText(control.ariaLabel),
    role: control.role,
    srcPath: sanitizeUrl(control.src),
    hrefPath: sanitizeUrl(control.href),
    text: sanitizeControlText(control.text),
    checked: control.checked,
    labelText: sanitizeControlText(control.labelText),
    parentTag: control.parentTag,
    parentId: control.parentId,
    parentClassName: control.parentClassName,
    parentTitle: sanitizeControlText(control.parentTitle)
  }))
}

async function inspectTables(frame: Frame): Promise<Record<string, unknown>[]> {
  const tables = frame.locator('table')
  const tableCount = await tables.count().catch(() => 0)

  const result: Record<string, unknown>[] = []

  for (let index = 0; index < Math.min(tableCount, 15); index += 1) {
    const table = tables.nth(index)

    const headers = (
      await table
        .locator('th')
        .allInnerTexts()
        .catch(() => [])
    )
      .map(sanitizeHeader)
      .filter(Boolean)

    result.push({
      index,
      id: (await table.getAttribute('id')) ?? '',
      className: (await table.getAttribute('class')) ?? '',
      rowCount: await table
        .locator('tr')
        .count()
        .catch(() => 0),
      bodyRowCount: await table
        .locator('tbody tr')
        .count()
        .catch(() => 0),
      checkboxCount: await table
        .locator('input[type="checkbox"]')
        .count()
        .catch(() => 0),
      headers
    })
  }

  return result
}

async function inspectFrame(frame: Frame): Promise<Record<string, unknown>> {
  const bodyText = await frame
    .locator('body')
    .innerText({
      timeout: 5_000
    })
    .catch(() => '')

  const normalizedBody = normalizeText(bodyText).toLowerCase()

  return {
    name: frame.name(),
    url: sanitizeUrl(frame.url()),

    signals: {
      hasTargetFilter: normalizedBody.includes('processos judiciais criminal'),
      hasSelectButton: normalizedBody.includes('selecionar'),
      hasShowAllText: normalizedBody.includes('mostrar tudo'),
      hasNoRecordsText:
        normalizedBody.includes('nenhum registro') ||
        normalizedBody.includes('nenhum resultado') ||
        normalizedBody.includes('não foram encontrados') ||
        normalizedBody.includes('nao foram encontrados')
    },

    controls: await inspectControls(frame),
    tables: await inspectTables(frame)
  }
}

function findCpiPage(pages: Page[]): Page | undefined {
  return pages.find((page) => page.url().includes('adm.cpicentral.com.br'))
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

  const profilePath = join(appData, 'AgenteCPI', 'browser-profile')

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  try {
    const pageManager = new PlatformPageManager()

    await pageManager.ensurePages(context)

    let cpiPage = findCpiPage(context.pages())

    if (!cpiPage) {
      throw new Error('A aba da CPI Central não foi localizada.')
    }

    if (!cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      await terminal.question('Faça o login manual na CPI, abra a fila e pressione ENTER...')

      cpiPage = findCpiPage(context.pages())
    }

    if (!cpiPage || !cpiPage.url().toLowerCase().includes('/mod_t_aguardando.aspx')) {
      throw new Error('A fila autenticada da CPI não foi confirmada.')
    }

    await cpiPage
      .waitForLoadState('domcontentloaded', {
        timeout: 30_000
      })
      .catch(() => undefined)

    await terminal.question(
      'Deixe a fila principal visível, sem abrir o filtro, e pressione ENTER...'
    )

    const mainQueueReport = await Promise.all(cpiPage.frames().map((frame) => inspectFrame(frame)))

    await terminal.question(
      'Clique manualmente na engrenagem, deixe o filtro aberto e pressione ENTER...'
    )

    await cpiPage.waitForTimeout(700)

    const advancedFilterReport = await Promise.all(
      cpiPage.frames().map((frame) => inspectFrame(frame))
    )

    console.dir(
      {
        platform: 'CPI Central',
        title: await cpiPage.title(),
        url: sanitizeUrl(cpiPage.url()),
        mainQueue: mainQueueReport,
        advancedFilter: advancedFilterReport
      },
      {
        depth: null,
        colors: true
      }
    )

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } finally {
    terminal.close()
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao inspecionar a CPI:', error)

  process.exitCode = 1
})
