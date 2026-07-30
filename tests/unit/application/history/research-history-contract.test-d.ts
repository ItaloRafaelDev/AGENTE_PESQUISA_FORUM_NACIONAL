import { expectTypeOf, test } from 'vitest'
import type { ResearchHistoryRecord as ApplicationResearchHistoryRecord } from '@/application/history/research-history-model'
import type { ResearchHistoryRepositoryPort } from '@/application/ports/research-history-repository-port'
import type { ResearchHistoryRepository } from '@/infrastructure/database/research-history-repository'
import type { ResearchHistoryRecord as PublicResearchHistoryRecord } from '@/shared/types/history-api'

test('mantém porta, SQLite e DTO estruturalmente compatíveis', () => {
  expectTypeOf<ResearchHistoryRepository>().toMatchTypeOf<ResearchHistoryRepositoryPort>()
  expectTypeOf<ApplicationResearchHistoryRecord>().toEqualTypeOf<PublicResearchHistoryRecord>()
  expectTypeOf<PublicResearchHistoryRecord>().toEqualTypeOf<ApplicationResearchHistoryRecord>()
})
