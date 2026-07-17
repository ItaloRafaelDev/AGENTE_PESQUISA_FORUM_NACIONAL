import type { ResearchClassification } from './research-classification'

export interface DeskDataResultSummary {
  hasProcesses: boolean
  hasCriminalProcesses: boolean
  isProcessNatureIdentifiable: boolean
  isResultValid: boolean
}

export function classifyDeskDataResult(result: DeskDataResultSummary): ResearchClassification {
  if (!result.isResultValid) {
    return 'INDEFINIDO'
  }

  if (!result.hasProcesses) {
    return 'HA_INFORMACOES'
  }

  if (!result.isProcessNatureIdentifiable) {
    return 'INDEFINIDO'
  }

  if (result.hasCriminalProcesses) {
    return 'CONSTA_RESTRICAO'
  }

  return 'HA_INFORMACOES'
}
