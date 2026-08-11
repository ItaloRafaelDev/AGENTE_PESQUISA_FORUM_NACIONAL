import type { ResearchClassification } from '../../domain/research/research-classification'

export interface ResearchCycleResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: ResearchClassification
  pdfPath: string
  pdfSizeBytes: number
  saved: true
  confirmationAccepted: true
}
