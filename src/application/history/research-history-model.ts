import type { ResearchClassification } from '../../domain/research/research-classification'

export const RESEARCH_HISTORY_STATUSES = [
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'ERRO_E1',
  'INTERROMPIDO'
] as const

export type ResearchHistoryStatus = (typeof RESEARCH_HISTORY_STATUSES)[number]

export interface ResearchHistoryRecord {
  id: string
  maskedCpf: string
  classification: ResearchClassification | null
  cpiResult: string | null
  status: ResearchHistoryStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  pdfPath: string | null
  errorStage: string | null
  errorMessage: string | null
  createdAt: string
}

export interface ResearchHistoryListInput {
  page: number
  pageSize: number
}

export interface ResearchHistoryPage {
  items: ResearchHistoryRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface CreateResearchHistoryInput {
  id: string
  maskedCpf: string
  status: ResearchHistoryStatus
  startedAt: string
  createdAt: string
}

export interface CompleteResearchHistoryInput {
  id: string
  maskedCpf: string
  classification: ResearchClassification
  cpiResult: string
  finishedAt: string
  durationMs: number
  pdfPath: string
}

export interface FailResearchHistoryInput {
  id: string
  maskedCpf: string
  finishedAt: string
  durationMs: number
  errorStage: string
  errorMessage: string
}

export type ResearchHistoryEvent =
  | {
      type: 'CREATED'
      record: ResearchHistoryRecord
    }
  | {
      type: 'UPDATED'
      record: ResearchHistoryRecord
    }
  | {
      type: 'CLEARED'
    }

export type ResearchHistoryEventListener = (event: ResearchHistoryEvent) => void
