export type DeskDataInspectionScenario =
  'caso-a-criminal' | 'caso-b-sem-processos' | 'caso-c-nao-criminal' | 'fluxo-real'

export interface RawDeskDataInspectionTable {
  index: number
  text: string
  html: string
}

export interface RawDeskDataInspectionCandidate {
  index: number
  tagName: string
  id: string
  className: string
  text: string
  html: string
}

export interface RawDeskDataProcessInspection {
  scenario: DeskDataInspectionScenario
  capturedAt: string
  sourceUrl: string
  pageTitle: string
  bodyText: string
  headings: string[]
  tables: RawDeskDataInspectionTable[]
  candidates: RawDeskDataInspectionCandidate[]
}

export interface DeskDataInspectionTable {
  index: number
  text: string
  html: string
}

export interface DeskDataInspectionCandidate {
  index: number
  tagName: string
  id: string
  className: string
  text: string
  html: string
}

export interface DeskDataProcessInspection {
  schemaVersion: 1
  scenario: DeskDataInspectionScenario
  capturedAt: string
  sourcePath: string
  pageTitle: string
  relevantBodyLines: string[]
  headings: string[]
  tables: DeskDataInspectionTable[]
  candidates: DeskDataInspectionCandidate[]
}

const PROCESS_NUMBER_PATTERN = /\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/

const RELEVANT_TEXT_PATTERN =
  /\b(process|processo|processos|criminal|penal|cível|civel|civil|trabalhista|inquérito|inquerito|ação|acao|execução|execucao|tribunal|vara|comarca)\b/i

const ABSENCE_PATTERN =
  /(nenhum|nenhuma|não|nao|sem).{0,50}(process|registro|resultado|informação|informacao)/i

export class DeskDataProcessResultInspector {
  build(raw: RawDeskDataProcessInspection): DeskDataProcessInspection {
    return {
      schemaVersion: 1,
      scenario: raw.scenario,
      capturedAt: raw.capturedAt,
      sourcePath: this.extractPath(raw.sourceUrl),
      pageTitle: this.sanitizeText(raw.pageTitle),
      relevantBodyLines: this.extractRelevantLines(raw.bodyText),
      headings: this.uniqueTexts(raw.headings),
      tables: raw.tables.slice(0, 30).map((table) => ({
        index: table.index,
        text: this.truncate(this.sanitizeText(table.text), 30_000),
        html: this.truncate(this.sanitizeHtml(table.html), 80_000)
      })),
      candidates: this.sanitizeCandidates(raw.candidates)
    }
  }

  toText(snapshot: DeskDataProcessInspection): string {
    const lines: string[] = [
      'INSPEÇÃO DE RESULTADO — DESKDATA',
      '',
      `Cenário: ${snapshot.scenario}`,
      `Capturado em: ${snapshot.capturedAt}`,
      `Caminho: ${snapshot.sourcePath}`,
      '',
      'TÍTULOS',
      ...snapshot.headings.map((heading) => `- ${heading}`),
      '',
      'LINHAS RELEVANTES',
      ...snapshot.relevantBodyLines.map((line) => `- ${line}`)
    ]

    snapshot.tables.forEach((table) => {
      lines.push('', `TABELA ${table.index}`, table.text)
    })

    snapshot.candidates.forEach((candidate) => {
      lines.push(
        '',
        `ELEMENTO ${candidate.index}`,
        `Tag: ${candidate.tagName}`,
        `ID: ${candidate.id || '[sem id]'}`,
        `Classe: ${candidate.className || '[sem classe]'}`,
        candidate.text
      )
    })

    return lines.join('\n')
  }

  private sanitizeCandidates(
    candidates: RawDeskDataInspectionCandidate[]
  ): DeskDataInspectionCandidate[] {
    const seenTexts = new Set<string>()
    const result: DeskDataInspectionCandidate[] = []

    for (const candidate of candidates) {
      const text = this.truncate(this.sanitizeText(candidate.text), 30_000)

      const signature = text.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()

      if (!signature || seenTexts.has(signature)) {
        continue
      }

      seenTexts.add(signature)

      result.push({
        index: candidate.index,
        tagName: this.sanitizeText(candidate.tagName),
        id: this.sanitizeText(candidate.id),
        className: this.sanitizeText(candidate.className),
        text,
        html: this.truncate(this.sanitizeHtml(candidate.html), 80_000)
      })

      if (result.length >= 30) {
        break
      }
    }

    return result
  }

  private extractRelevantLines(bodyText: string): string[] {
    const lines = bodyText
      .split(/\r?\n/)
      .map((line) => this.sanitizeText(line))
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .filter(
        (line) =>
          RELEVANT_TEXT_PATTERN.test(line) ||
          ABSENCE_PATTERN.test(line) ||
          PROCESS_NUMBER_PATTERN.test(line)
      )

    return [...new Set(lines)].slice(0, 500)
  }

  private uniqueTexts(values: string[]): string[] {
    return [
      ...new Set(
        values
          .map((value) => this.sanitizeText(value))
          .map((value) => value.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
      )
    ]
  }

  private sanitizeHtml(value: string): string {
    return this.sanitizeText(value).replace(/\bvalue=(["'])[^"']*\1/gi, 'value="[REMOVIDO]"')
  }

  private sanitizeText(value: string): string {
    return value
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REMOVIDO]')
      .replace(/\b\d{11}\b/g, '[CPF_REMOVIDO]')
  }

  private extractPath(sourceUrl: string): string {
    try {
      return new URL(sourceUrl).pathname
    } catch {
      return ''
    }
  }

  private truncate(value: string, maximumLength: number): string {
    if (value.length <= maximumLength) {
      return value
    }

    return `${value.slice(0, maximumLength)}\n[CONTEÚDO_TRUNCADO]`
  }
}
