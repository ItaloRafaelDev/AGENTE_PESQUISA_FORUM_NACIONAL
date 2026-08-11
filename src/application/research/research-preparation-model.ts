import type {
  DeskDataClassification,
  DeskDataResult
} from '../../domain/research/deskdata-process-record'
import type { ResearchClassification } from '../../domain/research/research-classification'

export type CpiDeskDataClassification = Extract<
  ResearchClassification,
  'CONSTA_RESTRICAO' | 'HA_INFORMACOES'
>

export interface ResearchPreparationClassification {
  classification: CpiDeskDataClassification
  evidence: DeskDataClassification
}

export interface ResearchPreparationReportInput {
  classification: ResearchPreparationClassification
}

export function mapDeskDataResultToResearchClassification(
  result: DeskDataResult
): CpiDeskDataClassification {
  return result === 'SIM_CONSTA_RESTRICAO' ? 'CONSTA_RESTRICAO' : 'HA_INFORMACOES'
}
