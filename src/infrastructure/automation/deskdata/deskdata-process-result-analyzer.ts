import type { DeskDataResultSummary } from '../../../domain/research/classify-deskdata-result'
import type { DeskDataProcessInspection } from './deskdata-process-result-inspector'

const PROCESS_NUMBER_PATTERN = /\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/i

const CRIMINAL_NATURE_PATTERN =
  /\b(criminal|penal|ação penal|acao penal|execução penal|execucao penal|inquérito|inquerito|juizado especial criminal)\b/i

const NON_CRIMINAL_NATURE_PATTERN =
  /\b(cível|civel|civil|trabalhista|família|familia|consumidor|fazenda pública|fazenda publica|execução fiscal|execucao fiscal)\b/i

const NO_PROCESSES_PATTERN = /\b(nenhum|nenhuma|não|nao|sem)\b.{0,80}\b(processo|processos)\b/i

export class DeskDataProcessResultAnalyzer {
  analyze(inspection: DeskDataProcessInspection): DeskDataResultSummary {
    if (!inspection.sourcePath.startsWith('/pessoas/resultado/')) {
      return {
        hasProcesses: false,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: false,
        isResultValid: false
      }
    }

    const capturedText = this.collectCapturedText(inspection)

    const hasProcessNumbers = PROCESS_NUMBER_PATTERN.test(capturedText)
    const explicitlyHasNoProcesses = NO_PROCESSES_PATTERN.test(capturedText)

    const hasProcesses = hasProcessNumbers && !explicitlyHasNoProcesses

    if (!hasProcesses) {
      return {
        hasProcesses: false,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      }
    }

    const hasCriminalProcesses = CRIMINAL_NATURE_PATTERN.test(capturedText)
    const hasNonCriminalProcesses = NON_CRIMINAL_NATURE_PATTERN.test(capturedText)

    return {
      hasProcesses: true,
      hasCriminalProcesses,
      isProcessNatureIdentifiable: hasCriminalProcesses || hasNonCriminalProcesses,
      isResultValid: true
    }
  }

  private collectCapturedText(inspection: DeskDataProcessInspection): string {
    return [
      inspection.pageTitle,
      ...inspection.relevantBodyLines,
      ...inspection.headings,
      ...inspection.tables.flatMap((table) => [table.text, table.html]),
      ...inspection.candidates.flatMap((candidate) => [candidate.text, candidate.html])
    ].join('\n')
  }
}
