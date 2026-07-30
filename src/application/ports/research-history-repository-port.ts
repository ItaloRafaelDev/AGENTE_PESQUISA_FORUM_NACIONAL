import type {
  CompleteResearchHistoryInput,
  CreateResearchHistoryInput,
  FailResearchHistoryInput,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '../history/research-history-model'

export interface ResearchHistoryRepositoryPort {
  create(input: CreateResearchHistoryInput): ResearchHistoryRecord

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord

  complete(input: CompleteResearchHistoryInput): ResearchHistoryRecord

  fail(input: FailResearchHistoryInput): ResearchHistoryRecord

  list(input: ResearchHistoryListInput): ResearchHistoryPage

  clear(): void
}
