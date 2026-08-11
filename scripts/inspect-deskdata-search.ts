import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { chromium, type Locator, type Page } from 'playwright'
import { PlatformPageManager } from '../src/infrastructure/automation/browser/platform-page-manager'
import { resolveWindowsOperationalConfig } from './support/windows-operational-config'

interface InspectedControl {
  tag: string
  id: string
  name: string
  type: string
  className: string
  placeholder: string
  ariaLabel: string
  title: string
  associatedLabel: string
  formId: string
  formName: string
  text: string
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sanitizeText(value: string): string {
  const normalized = normalizeText(value)

  if (!normalized) {
    return ''
  }

  if (normalized.includes('@') || /\d{3,}/.test(normalized)) {
    return '[ocultado]'
  }

  return normalized.slice(0, 120)
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

function findDeskDataPage(pages: Page[]): Page | undefined {
  return pages.find((page) => {
    try {
      const hostname = new URL(page.url()).hostname

      return hostname === 'deskdata.com.br' || hostname.endsWith('.deskdata.com.br')
    } catch {
      return false
    }
  })
}

async function readAssociatedLabel(page: Page, control: Locator, id: string): Promise<string> {
  if (id) {
    const escapedId = id.replace(/["\\]/g, '\\$&')

    const associatedLabel = page.locator(`label[for="${escapedId}"]`).first()

    if ((await associatedLabel.count()) > 0) {
      return associatedLabel
        .innerText({
          timeout: 500
        })
        .catch(() => '')
    }
  }

  const wrappingLabel = control.locator('xpath=ancestor::label[1]').first()

  if ((await wrappingLabel.count()) > 0) {
    return wrappingLabel
      .innerText({
        timeout: 500
      })
      .catch(() => '')
  }

  return ''
}

async function inspectControl(
  page: Page,
  control: Locator,
  tag: string
): Promise<InspectedControl | null> {
  if (!(await control.isVisible())) {
    return null
  }

  const id = (await control.getAttribute('id')) ?? ''

  const form = control.locator('xpath=ancestor::form[1]')

  const formExists = (await form.count()) > 0

  const associatedLabel = await readAssociatedLabel(page, control, id)

  const text =
    tag === 'button' || tag === 'a'
      ? await control.innerText().catch(() => '')
      : ((await control.getAttribute('value')) ?? '')

  return {
    tag,
    id: sanitizeText(id),
    name: sanitizeText((await control.getAttribute('name')) ?? ''),
    type: (await control.getAttribute('type')) ?? '',
    className: (await control.getAttribute('class')) ?? '',
    placeholder: sanitizeText((await control.getAttribute('placeholder')) ?? ''),
    ariaLabel: sanitizeText((await control.getAttribute('aria-label')) ?? ''),
    title: sanitizeText((await control.getAttribute('title')) ?? ''),
    associatedLabel: sanitizeText(associatedLabel),
    formId: formExists ? sanitizeText((await form.getAttribute('id')) ?? '') : '',
    formName: formExists ? sanitizeText((await form.getAttribute('name')) ?? '') : '',
    text: tag === 'input' ? '' : sanitizeText(text)
  }
}

async function inspectPage(page: Page): Promise<Record<string, unknown>> {
  const controls: InspectedControl[] = []

  const groups = [
    {
      tag: 'input',
      selector: 'input'
    },
    {
      tag: 'select',
      selector: 'select'
    },
    {
      tag: 'textarea',
      selector: 'textarea'
    },
    {
      tag: 'button',
      selector: 'button'
    },
    {
      tag: 'a',
      selector: 'a'
    }
  ]

  for (const group of groups) {
    const locator = page.locator(group.selector)

    const count = Math.min(await locator.count(), 100)

    for (let index = 0; index < count; index += 1) {
      const inspected = await inspectControl(page, locator.nth(index), group.tag)

      if (!inspected) {
        continue
      }

      const searchable = [
        inspected.id,
        inspected.name,
        inspected.placeholder,
        inspected.ariaLabel,
        inspected.title,
        inspected.associatedLabel,
        inspected.text
      ]
        .join(' ')
        .toLowerCase()

      if (
        /cpf|documento|pessoa|consultar|consulta|buscar|pesquisar|nome/.test(searchable) ||
        inspected.tag === 'input'
      ) {
        controls.push(inspected)
      }
    }
  }

  const forms: Array<Record<string, string>> = []

  const formLocator = page.locator('form')

  const formCount = await formLocator.count()

  for (let index = 0; index < formCount; index += 1) {
    const form = formLocator.nth(index)

    forms.push({
      id: sanitizeText((await form.getAttribute('id')) ?? ''),
      name: sanitizeText((await form.getAttribute('name')) ?? ''),
      method: (await form.getAttribute('method')) ?? '',
      actionPath: sanitizeUrl((await form.getAttribute('action')) ?? '')
    })
  }

  return {
    platform: 'DeskData',
    title: await page.title(),
    url: sanitizeUrl(page.url()),
    forms,
    controls
  }
}

async function main(): Promise<void> {
  const { config, paths } = resolveWindowsOperationalConfig()
  const profilePath = paths.browserProfileDir

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  try {
    const pageManager = new PlatformPageManager(
      config.platform,
      config.timing.platformPageNavigationTimeoutMs
    )

    await pageManager.ensurePages(context)

    let deskDataPage = findDeskDataPage(context.pages())

    if (!deskDataPage) {
      throw new Error('A aba da DeskData não foi localizada.')
    }

    const passwordVisible =
      (await deskDataPage.locator('input[type="password"]:visible').count()) > 0

    if (passwordVisible) {
      await terminal.question(
        'Faça o login manual na DeskData, abra Consultar pessoas e pressione ENTER...'
      )

      deskDataPage = findDeskDataPage(context.pages())
    }

    if (!deskDataPage) {
      throw new Error('A página autenticada da DeskData não foi confirmada.')
    }

    await deskDataPage.bringToFront()

    console.dir(await inspectPage(deskDataPage), {
      depth: null,
      colors: true
    })

    console.log('Nenhum CPF foi preenchido ou pesquisado.')

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } catch (error: unknown) {
    console.error('Falha ao inspecionar a DeskData:', error)

    await terminal.question('O navegador permanecerá aberto. Pressione ENTER para encerrar...')

    process.exitCode = 1
  } finally {
    terminal.close()
    await context.close()
  }
}

void main()
