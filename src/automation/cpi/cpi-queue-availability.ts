import type { Page } from 'playwright'

export const CPI_QUEUE_AVAILABILITY_STATES = ['EMPTY', 'HAS_RESEARCH', 'INDETERMINATE'] as const

export type CpiQueueAvailabilityState = (typeof CPI_QUEUE_AVAILABILITY_STATES)[number]

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCpiQueueTotal(pageText: string): number | null {
  const normalized = normalizeText(pageText)

  const match = normalized.match(
    /Mostrando:\s*\d+\s*a\s*\d+\s*\(\s*de\s*(\d+)\s*registro(?:s)?\s*\)/i
  )

  if (!match) {
    return null
  }

  const total = Number(match[1])

  return Number.isInteger(total) && total >= 0 ? total : null
}

export function classifyCpiQueueText(pageText: string): CpiQueueAvailabilityState {
  const total = parseCpiQueueTotal(pageText)

  if (total === null) {
    return 'INDETERMINATE'
  }

  return total === 0 ? 'EMPTY' : 'HAS_RESEARCH'
}

export class CpiQueueAvailabilityReader {
  constructor(private readonly readTimeoutMs = 5_000) {}

  async read(page: Page): Promise<CpiQueueAvailabilityState> {
    for (const frame of page.frames()) {
      const bodyText = await frame
        .locator('body')
        .innerText({
          timeout: this.readTimeoutMs
        })
        .catch(() => '')

      const state = classifyCpiQueueText(bodyText)

      if (state !== 'INDETERMINATE') {
        return state
      }
    }

    return 'INDETERMINATE'
  }
}
