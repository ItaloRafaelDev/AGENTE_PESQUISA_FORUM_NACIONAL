import type {
  RawDeskDataInspectionCandidate,
  RawDeskDataInspectionTable
} from './deskdata-process-result-inspector'

export const DESKDATA_PROCESS_CAPTURE_SELECTORS = {
  tables: 'table',
  candidates: [
    'section',
    'article',
    'fieldset',
    'table',
    '.card',
    '.panel',
    '.accordion-item',
    '.row',
    '[class*="process" i]',
    '[id*="process" i]'
  ].join(', ')
} as const

export interface DeskDataProcessCaptureLocator {
  count(): Promise<number>

  nth(index: number): DeskDataProcessCaptureLocator

  innerText(options?: { timeout?: number }): Promise<string>

  getAttribute(name: string): Promise<string | null>
}

export interface DeskDataProcessCapturePage {
  locator(selector: string): DeskDataProcessCaptureLocator
}

const PROCESS_EVIDENCE_PATTERN =
  /\b(process|processo|processos|criminal|penal|cível|civel|civil|trabalhista|inquérito|inquerito|ação|acao|execução|execucao|tribunal|vara|comarca)\b/i

const PROCESS_ABSENCE_PATTERN =
  /(nenhum|nenhuma|não|nao|sem).{0,50}(process|registro|resultado|informação|informacao)/i

const PROCESS_NUMBER_PATTERN = /\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/

export class DeskDataProcessDomCapture {
  async captureTables(page: DeskDataProcessCapturePage): Promise<RawDeskDataInspectionTable[]> {
    const locator = page.locator(DESKDATA_PROCESS_CAPTURE_SELECTORS.tables)

    const count = Math.min(await locator.count(), 30)

    const tables: RawDeskDataInspectionTable[] = []

    for (let index = 0; index < count; index += 1) {
      const table = locator.nth(index)

      const text = await table
        .innerText({
          timeout: 2_000
        })
        .catch(() => '')

      if (!text.trim()) {
        continue
      }

      tables.push({
        index,
        text,
        html: ''
      })
    }

    return tables
  }

  async captureCandidates(
    page: DeskDataProcessCapturePage
  ): Promise<RawDeskDataInspectionCandidate[]> {
    const locator = page.locator(DESKDATA_PROCESS_CAPTURE_SELECTORS.candidates)

    const count = Math.min(await locator.count(), 150)

    const candidates: RawDeskDataInspectionCandidate[] = []

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)

      const text = await candidate
        .innerText({
          timeout: 2_000
        })
        .catch(() => '')

      if (!text.trim() || !this.containsProcessEvidence(text)) {
        continue
      }

      const [id, className] = await Promise.all([
        candidate.getAttribute('id').catch(() => null),

        candidate.getAttribute('class').catch(() => null)
      ])

      candidates.push({
        index,
        tagName: '',
        id: id ?? '',
        className: className ?? '',
        text,
        html: ''
      })
    }

    return candidates
  }

  private containsProcessEvidence(text: string): boolean {
    return (
      PROCESS_EVIDENCE_PATTERN.test(text) ||
      PROCESS_ABSENCE_PATTERN.test(text) ||
      PROCESS_NUMBER_PATTERN.test(text)
    )
  }
}
