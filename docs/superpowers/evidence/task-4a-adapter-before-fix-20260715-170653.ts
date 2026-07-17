import type { Locator, Page } from 'playwright'
import type {
  DeskDataProcessCardSnapshot,
  DeskDataProcessPagePort,
  DeskDataProcessPageSnapshot
} from './deskdata-process-page-port'
import { DeskDataProcessCollectionError } from './deskdata-process-collection-error'

const PROCESS_SECTION_MARKER = 'data-agent-cpi-process-section'

const NEXT_PAGE_MARKER = 'data-agent-cpi-next-page'

const PROCESS_HEADING_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'legend',
  '[role="heading"]',
  '[data-section-title]',
  '.card-header',
  '.panel-heading',
  '.accordion-header'
].join(', ')

function collectionError(
  code: ConstructorParameters<typeof DeskDataProcessCollectionError>[0],
  message: string
): DeskDataProcessCollectionError {
  return new DeskDataProcessCollectionError(code, message)
}

export class PlaywrightDeskDataProcessPageAdapter implements DeskDataProcessPagePort {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs = 15_000
  ) {}

  async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + this.timeoutMs

    while (Date.now() < deadline) {
      const resolved = await this.tryMarkProcessSection()

      if (resolved) {
        const section = this.processSectionLocator()

        if (await section.isVisible()) {
          return
        }
      }

      await this.page.waitForTimeout(100)
    }

    throw collectionError('PROCESS_SECTION_NOT_FOUND', 'A seção Processos não foi localizada.')
  }

  async expandAllCards(): Promise<void> {
    await this.ensureProcessSection()

    const section = this.processSectionLocator()

    const details = section.locator('details:not([open])')

    for (let index = 0; index < (await details.count()); index += 1) {
      await details.nth(index).evaluate((element) => {
        ;(element as HTMLDetailsElement).open = true
      })
    }

    const triggers = section.locator(
      ['button[aria-expanded="false"]', '[role="button"][aria-expanded="false"]'].join(', ')
    )

    for (let index = 0; index < (await triggers.count()); index += 1) {
      const trigger = triggers.nth(index)

      if (await trigger.isDisabled().catch(() => false)) {
        continue
      }

      try {
        await trigger.click()

        await this.page.waitForFunction(
          (element) => {
            const expanded = element.getAttribute('aria-expanded')

            if (expanded === 'true') {
              return true
            }

            const controls = element.getAttribute('aria-controls')

            if (controls) {
              const controlled = document.getElementById(controls)

              if (controlled && !controlled.hasAttribute('hidden')) {
                return true
              }
            }

            const sibling = element.nextElementSibling

            return Boolean(sibling && !sibling.hasAttribute('hidden'))
          },
          await trigger.elementHandle(),
          {
            timeout: this.timeoutMs
          }
        )
      } catch {
        throw collectionError(
          'PROCESS_CARD_EXPANSION_FAILED',
          'Um cartão de processo não pôde ser expandido.'
        )
      }
    }
  }

  async readCurrentPage(): Promise<DeskDataProcessPageSnapshot> {
    await this.ensureProcessSection()

    const section = this.processSectionLocator()

    return section.evaluate((root) => {
      const normalize = (value: string | null | undefined): string =>
        (value ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLocaleLowerCase('pt-BR')
          .replace(/\s+/g, ' ')
          .trim()

      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim()

      const hash = (value: string): string => {
        let result = 2166136261

        for (let index = 0; index < value.length; index += 1) {
          result ^= value.charCodeAt(index)

          result = Math.imul(result, 16777619)
        }

        return (result >>> 0).toString(16)
      }

      const exactNextNames = new Set(['proximo', 'proxima', 'next', '>', '›', '»'])

      const isDisabled = (element: Element): boolean =>
        element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true' ||
        element.classList.contains('disabled')

      const rootText = clean((root as HTMLElement).innerText)

      const empty = /(não|nao|nenhum|nenhuma|sem).{0,60}(processo|processos|registro)/i.test(
        rootText
      )

      const cardSelectors = [
        '[data-process-card]',
        '[data-process-id]',
        '.process-card',
        '.accordion-item',
        'article'
      ]

      let cardElements = [...root.querySelectorAll(cardSelectors.join(', '))]

      if (cardElements.length === 0 && !empty) {
        const sphereLabels = [
          ...root.querySelectorAll(
            ['dt', 'th', 'label', '[data-field-label]', 'strong', 'b', 'span'].join(', ')
          )
        ].filter((element) => normalize(element.textContent) === 'esfera')

        cardElements = [
          ...new Set(
            sphereLabels
              .map((element) =>
                element.closest(
                  [
                    '[data-process-card]',
                    '[data-process-id]',
                    '.process-card',
                    '.accordion-item',
                    'article',
                    '.card',
                    '.panel',
                    'tr',
                    'li'
                  ].join(', ')
                )
              )
              .filter((element): element is Element => Boolean(element))
          )
        ]
      }

      const cards: DeskDataProcessCardSnapshot[] = cardElements.map((card, cardIndex) => {
        const fields: Array<{
          label: string
          value: string | null
        }> = []

        const pushField = (label: string | null, value: string | null): void => {
          const cleanLabel = clean(label)

          const cleanValue = clean(value)

          if (!cleanLabel) {
            return
          }

          const duplicate = fields.some(
            (field) =>
              normalize(field.label) === normalize(cleanLabel) &&
              normalize(field.value) === normalize(cleanValue)
          )

          if (!duplicate) {
            fields.push({
              label: cleanLabel,
              value: cleanValue || null
            })
          }
        }

        for (const definition of [...card.querySelectorAll('dt')]) {
          const value = definition.nextElementSibling

          if (value?.tagName.toLowerCase() === 'dd') {
            pushField(definition.textContent, value.textContent)
          }
        }

        for (const row of [...card.querySelectorAll('tr')]) {
          const cells = [...row.querySelectorAll(':scope > th, :scope > td')]

          if (cells.length >= 2) {
            pushField(cells[0].textContent, cells[1].textContent)
          }
        }

        for (const labelElement of [...card.querySelectorAll('[data-field-label]')]) {
          const explicitValue = labelElement.parentElement?.querySelector('[data-field-value]')

          pushField(
            labelElement.getAttribute('data-field-label') || labelElement.textContent,
            explicitValue?.textContent || labelElement.nextElementSibling?.textContent || null
          )
        }

        const cardText = clean((card as HTMLElement).innerText)

        const processNumber =
          fields.find((field) =>
            /^(numero do processo|número do processo|processo)$/i.test(field.label)
          )?.value ??
          cardText.match(/\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)?.[0] ??
          null

        const normalizedNumber = processNumber?.replace(/\D/g, '') ?? ''

        const stableIdentifier =
          card.getAttribute('data-process-card') || card.getAttribute('data-process-id') || card.id

        const processKey =
          normalizedNumber ||
          clean(stableIdentifier) ||
          `card-${hash(
            JSON.stringify({
              cardIndex,
              fields
            })
          )}`

        return {
          processKey,
          processNumber,
          fields
        }
      })

      const currentPageElement = root.querySelector(
        [
          '[aria-current="page"]',
          '[data-current-page]',
          '.pagination .active',
          '.pager .active'
        ].join(', ')
      )

      const currentPageText = clean(
        currentPageElement?.getAttribute('data-current-page') || currentPageElement?.textContent
      )

      const currentPageMatch = currentPageText.match(/\d+/)

      const rangeMatch = rootText.match(/\b(\d+)\s*(?:\/|de)\s*(\d+)\b/i)

      const pageNumber = Number(currentPageMatch?.[0] || rangeMatch?.[1] || 1) || 1

      const totalPages = rangeMatch ? Number(rangeMatch[2]) : null

      const countMatch = rootText.match(/\b(\d+)\s+processos?\b/i)

      const expectedProcessCount = countMatch ? Number(countMatch[1]) : empty ? 0 : null

      const navigationScope = root.parentElement || root

      const hasNextPage = [...navigationScope.querySelectorAll('button, a, [role="button"]')].some(
        (element) => {
          const accessibleName = normalize(
            element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              element.textContent
          )

          return exactNextNames.has(accessibleName) && !isDisabled(element)
        }
      )

      const pageSignature = hash(
        JSON.stringify({
          pageNumber,
          empty,
          cards
        })
      )

      return {
        pageNumber,
        pageSignature,
        expectedProcessCount,
        totalPages,
        empty,
        cards,
        hasNextPage
      }
    })
  }

  async goToNextPage(previousSignature: string): Promise<void> {
    await this.ensureProcessSection()

    const section = this.processSectionLocator()

    const marked = await section.evaluate((root, nextPageMarker) => {
      const normalize = (value: string | null | undefined): string =>
        (value ?? '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLocaleLowerCase('pt-BR')
          .replace(/\s+/g, ' ')
          .trim()

      const exactNames = new Set(['proximo', 'proxima', 'next', '>', '›', '»'])

      const navigationScope = root.parentElement || root

      for (const element of [...navigationScope.querySelectorAll('button, a, [role="button"]')]) {
        element.removeAttribute(nextPageMarker)
      }

      const candidate = [...navigationScope.querySelectorAll('button, a, [role="button"]')].find(
        (element) => {
          const name = normalize(
            element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              element.textContent
          )

          const disabled =
            element.hasAttribute('disabled') ||
            element.getAttribute('aria-disabled') === 'true' ||
            element.classList.contains('disabled')

          return exactNames.has(name) && !disabled
        }
      )

      if (!candidate) {
        return false
      }

      candidate.setAttribute(nextPageMarker, 'true')

      return true
    }, NEXT_PAGE_MARKER)

    if (!marked) {
      throw collectionError(
        'PROCESS_PAGINATION_STALLED',
        'O controle de próxima página não foi localizado.'
      )
    }

    await this.page.locator(`[${NEXT_PAGE_MARKER}="true"]`).click()

    const deadline = Date.now() + this.timeoutMs

    while (Date.now() < deadline) {
      await this.page.waitForTimeout(100)

      const snapshot = await this.readCurrentPage()

      if (snapshot.pageSignature !== previousSignature) {
        return
      }
    }

    throw collectionError(
      'PROCESS_PAGINATION_STALLED',
      'A próxima página não alterou o conteúdo da seção Processos.'
    )
  }

  private processSectionLocator(): Locator {
    return this.page.locator(`[${PROCESS_SECTION_MARKER}="true"]`)
  }

  private async ensureProcessSection(): Promise<void> {
    if (!(await this.tryMarkProcessSection())) {
      throw collectionError('PROCESS_SECTION_NOT_FOUND', 'A seção Processos não foi localizada.')
    }
  }

  private async tryMarkProcessSection(): Promise<boolean> {
    return this.page.evaluate(
      ({ headingSelector, marker }) => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pt-BR')
            .replace(/\s+/g, ' ')
            .trim()

        const isVisible = (element: Element): boolean => {
          const style = window.getComputedStyle(element)

          return style.display !== 'none' && style.visibility !== 'hidden'
        }

        document
          .querySelectorAll(`[${marker}]`)
          .forEach((element) => element.removeAttribute(marker))

        const headings = [...document.querySelectorAll(headingSelector)].filter(
          (element) => normalize(element.textContent) === 'processos' && isVisible(element)
        )

        const candidates: Element[] = []

        for (const heading of headings) {
          let ancestor = heading.parentElement

          while (ancestor && ancestor !== document.body) {
            const text = (ancestor as HTMLElement).innerText || ''

            const hasEmptyMessage =
              /(não|nao|nenhum|nenhuma|sem).{0,60}(processo|processos|registro)/i.test(text)

            const hasSphereLabel = [
              ...ancestor.querySelectorAll(
                ['dt', 'th', 'label', '[data-field-label]', 'strong', 'b', 'span'].join(', ')
              )
            ].some((element) => normalize(element.textContent) === 'esfera')

            const hasCard = Boolean(
              ancestor.querySelector(
                [
                  '[data-process-card]',
                  '[data-process-id]',
                  '.process-card',
                  '.accordion-item',
                  'article'
                ].join(', ')
              )
            )

            if (hasEmptyMessage || hasSphereLabel || hasCard) {
              candidates.push(ancestor)
              break
            }

            ancestor = ancestor.parentElement
          }
        }

        const uniqueCandidates = [...new Set(candidates)]

        if (uniqueCandidates.length !== 1) {
          return false
        }

        uniqueCandidates[0].setAttribute(marker, 'true')

        return true
      },
      {
        headingSelector: PROCESS_HEADING_SELECTOR,
        marker: PROCESS_SECTION_MARKER
      }
    )
  }
}
