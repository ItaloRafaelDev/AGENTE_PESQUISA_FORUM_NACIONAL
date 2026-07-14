import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright'
import { PlatformPageManager } from '../src/automation/browser/platform-page-manager'

interface RawElement {
  tag: string
  id: string
  name: string
  type: string
  ariaLabel: string
  placeholder: string
  href: string
  text: string
  visible: boolean
}

function sanitizeLabel(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (!normalized || normalized.length > 80) {
    return ''
  }

  if (/[\d@]/.test(normalized)) {
    return ''
  }

  return normalized
}

function sanitizeHref(value: string): string {
  if (!value) {
    return ''
  }

  try {
    return new URL(value).pathname
  } catch {
    return ''
  }
}

async function inspectPage(platform: string, page: Page): Promise<Record<string, unknown>> {
  await page
    .waitForLoadState('domcontentloaded', {
      timeout: 30_000
    })
    .catch(() => undefined)

  const rawElements = await page
    .locator('input, button, select, textarea, a')
    .evaluateAll((elements): RawElement[] => {
      return elements.slice(0, 150).map((element) => {
        const htmlElement = element as HTMLElement
        const inputElement = element as HTMLInputElement
        const anchorElement = element as HTMLAnchorElement
        const style = window.getComputedStyle(htmlElement)
        const rectangle = htmlElement.getBoundingClientRect()

        return {
          tag: element.tagName.toLowerCase(),
          id: htmlElement.id ?? '',
          name: inputElement.name ?? '',
          type: inputElement.type ?? '',
          ariaLabel: htmlElement.getAttribute('aria-label') ?? '',
          placeholder: inputElement.placeholder ?? '',
          href: anchorElement.href ?? '',
          text: htmlElement.innerText ?? '',
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rectangle.width > 0 &&
            rectangle.height > 0
        }
      })
    })

  const candidates = rawElements
    .filter((element) => element.visible)
    .map((element) => ({
      tag: element.tag,
      id: element.id,
      name: element.name,
      type: element.type,
      ariaLabel: sanitizeLabel(element.ariaLabel),
      placeholder: sanitizeLabel(element.placeholder),
      hrefPath: sanitizeHref(element.href),
      text: sanitizeLabel(element.text)
    }))
    .filter((element) =>
      Boolean(
        element.id ||
        element.name ||
        element.ariaLabel ||
        element.placeholder ||
        element.hrefPath ||
        element.text
      )
    )
    .slice(0, 60)

  return {
    platform,
    title: await page.title(),
    url: page.url(),
    hasVisiblePasswordInput: (await page.locator('input[type="password"]:visible').count()) > 0,
    candidates
  }
}

async function main(): Promise<void> {
  const appData = process.env.APPDATA

  if (!appData) {
    throw new Error('Variável APPDATA não encontrada.')
  }

  const profilePath = join(appData, 'AgenteCPI', 'browser-profile')

  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    acceptDownloads: true,
    args: ['--start-maximized']
  })

  const terminal = createInterface({
    input: stdin,
    output: stdout
  })

  try {
    const pageManager = new PlatformPageManager()

    await pageManager.ensurePages(context)

    const pages = context.pages()

    const cpiPage = pages.find((page) => page.url().includes('cpicentral.com.br'))

    const deskDataPage = pages.find((page) => page.url().includes('deskdata.com.br'))

    if (!cpiPage || !deskDataPage) {
      throw new Error('Não foi possível localizar as abas da CPI Central e da DeskData.')
    }

    const report = {
      cpi: await inspectPage('CPI Central', cpiPage),
      deskData: await inspectPage('DeskData', deskDataPage)
    }

    console.dir(report, {
      depth: null,
      colors: true
    })

    await terminal.question('Pressione ENTER para fechar o navegador com segurança...')
  } finally {
    terminal.close()
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error('Falha ao inspecionar as sessões:', error)

  process.exitCode = 1
})
