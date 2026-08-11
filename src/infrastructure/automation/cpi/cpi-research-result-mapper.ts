import type { ResearchClassification } from '../../../domain/research/research-classification'
import { CPI_RESEARCH_RESULT_OPTIONS } from './cpi-selectors'

export interface CpiResearchResultOption {
  selector: string
  label: string
}

export function mapResearchClassificationToCpiResult(
  classification: ResearchClassification
): CpiResearchResultOption {
  return CPI_RESEARCH_RESULT_OPTIONS[classification]
}
