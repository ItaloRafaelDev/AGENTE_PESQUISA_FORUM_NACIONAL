import type { DeskDataProcessRecord } from '../../../domain/research/deskdata-process-record'
import type { DeskDataPdfTextSnapshot } from './deskdata-pdf-text-snapshot'

export type DeskDataPdfProcessParsingErrorCode =
  'PDF_PROCESS_SECTION_NOT_FOUND' | 'PDF_PROCESS_CONTENT_UNRECOGNIZED'

export class DeskDataPdfProcessParsingError extends Error {
  constructor(
    readonly code: DeskDataPdfProcessParsingErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DeskDataPdfProcessParsingError'
  }
}

type PdfLine = {
  text: string
  pageNumber: number
}

const PROCESS_NUMBER_PATTERN = /^numero\s+([0-9][0-9.\-/]{6,})\s*$/i
const SPHERE_PATTERN = /^esfera(?:\s+(.*))?$/i

const STRUCTURED_FIELD_PATTERN =
  /^(?:resumo|numero|tipo|assunto|tribunal|vara|juiz|status|partes|movimentacoes|peticoes|nome|identificacao|polo|parte|oab)(?:\s|$)/i

const PAGE_MARKER_PATTERN = /^(?:--\s*\d+\s+of\s+\d+\s*--|\d+\s*\/\s*\d+)$/i

function cleanLine(value: string): string {
  return value
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeComparable(value: string): string {
  return cleanLine(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function extractProcessNumber(line: string): string | null {
  return normalizeComparable(line).match(PROCESS_NUMBER_PATTERN)?.[1] ?? null
}

function normalizeProcessKey(value: string, ordinal: number): string {
  return `${value.replace(/[^0-9a-z]/gi, '').toLowerCase()}:${ordinal}`
}

function isStructuredField(line: string): boolean {
  const normalized = normalizeComparable(line)

  return STRUCTURED_FIELD_PATTERN.test(normalized) || PAGE_MARKER_PATTERN.test(normalized)
}

function extractSphere(block: readonly PdfLine[]): string | null {
  for (let index = 0; index < block.length; index += 1) {
    const normalized = normalizeComparable(block[index].text)
    const match = normalized.match(SPHERE_PATTERN)

    if (!match) {
      continue
    }

    const originalInlineValue = cleanLine(block[index].text.replace(/^esfera\b/i, ''))

    if (originalInlineValue) {
      return originalInlineValue
    }

    for (let nextIndex = index + 1; nextIndex < block.length; nextIndex += 1) {
      const nextLine = block[nextIndex].text

      if (!nextLine) {
        continue
      }

      return isStructuredField(nextLine) ? null : nextLine
    }

    return null
  }

  return null
}

export class DeskDataPdfProcessParser {
  parse(snapshot: DeskDataPdfTextSnapshot): DeskDataProcessRecord[] {
    const lines = snapshot.pages.flatMap((page) =>
      page.text.split(/\r?\n/).map((text) => ({
        text: cleanLine(text),
        pageNumber: page.pageNumber
      }))
    )

    const processSectionIndex = lines.findIndex(
      (line) => normalizeComparable(line.text) === 'processos'
    )

    if (processSectionIndex < 0) {
      throw new DeskDataPdfProcessParsingError(
        'PDF_PROCESS_SECTION_NOT_FOUND',
        'A secao Processos nao foi localizada no PDF da DeskData.'
      )
    }

    const processLines = lines.slice(processSectionIndex + 1)

    const explicitNoProcesses = processLines.some((line) => {
      const normalized = normalizeComparable(line.text).replace(/\.$/, '')

      return normalized === 'nao foram encontrados processos'
    })

    const processStarts = processLines.flatMap((line, index) =>
      extractProcessNumber(line.text) ? [index] : []
    )

    if (processStarts.length === 0) {
      if (explicitNoProcesses) {
        return []
      }

      throw new DeskDataPdfProcessParsingError(
        'PDF_PROCESS_CONTENT_UNRECOGNIZED',
        'A secao Processos existe, mas nenhum processo ou mensagem de ausencia foi reconhecido.'
      )
    }

    return processStarts.map((startIndex, ordinal) => {
      const processNumber = extractProcessNumber(processLines[startIndex].text)

      if (!processNumber) {
        throw new DeskDataPdfProcessParsingError(
          'PDF_PROCESS_CONTENT_UNRECOGNIZED',
          'Um bloco de processo foi localizado sem numero reconhecivel.'
        )
      }

      const endIndex = processStarts[ordinal + 1] ?? processLines.length
      const block = processLines.slice(startIndex, endIndex)

      return {
        processKey: normalizeProcessKey(processNumber, ordinal),
        processNumber,
        sphereRaw: extractSphere(block),
        sourcePage: processLines[startIndex].pageNumber
      }
    })
  }
}
