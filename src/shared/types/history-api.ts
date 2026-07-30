export const RESEARCH_CLASSIFICATIONS = [
  'CONSTA_RESTRICAO',
  'HA_INFORMACOES',
  'NADA_CONSTA',
  'INDEFINIDO'
] as const

export type ResearchClassification = (typeof RESEARCH_CLASSIFICATIONS)[number]

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

export const HISTORY_IPC_CHANNELS = {
  list: 'history:list',
  clear: 'history:clear',
  recordCreated: 'history:record-created',
  recordUpdated: 'history:record-updated',
  cleared: 'history:cleared'
} as const

export interface HistoryApi {
  list(input: ResearchHistoryListInput): Promise<ResearchHistoryPage>
  clear(): Promise<void>
  onRecordCreated(listener: (record: ResearchHistoryRecord) => void): () => void
  onRecordUpdated(listener: (record: ResearchHistoryRecord) => void): () => void
  onCleared(listener: () => void): () => void
}
