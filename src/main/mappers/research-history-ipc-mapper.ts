import type {
  ResearchHistoryPage as ApplicationResearchHistoryPage,
  ResearchHistoryRecord as ApplicationResearchHistoryRecord
} from '../../application/history/research-history-model'
import type {
  ResearchHistoryPage as ResearchHistoryPageDto,
  ResearchHistoryRecord as ResearchHistoryRecordDto
} from '../../shared/types/history-api'

export function mapResearchHistoryRecordToDto(
  record: ApplicationResearchHistoryRecord
): ResearchHistoryRecordDto {
  return {
    id: record.id,
    maskedCpf: record.maskedCpf,
    classification: record.classification,
    cpiResult: record.cpiResult,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
    pdfPath: record.pdfPath,
    errorStage: record.errorStage,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt
  }
}

export function mapResearchHistoryPageToDto(
  page: ApplicationResearchHistoryPage
): ResearchHistoryPageDto {
  return {
    items: page.items.map(mapResearchHistoryRecordToDto),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages
  }
}
