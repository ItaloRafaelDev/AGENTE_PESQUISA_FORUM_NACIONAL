import { describe, expect, it } from 'vitest'
import { RESEARCH_CLASSIFICATIONS as DOMAIN_CLASSIFICATIONS } from '@/domain/research/research-classification'
import { RESEARCH_HISTORY_STATUSES as APPLICATION_HISTORY_STATUSES } from '@/application/history/research-history-model'
import {
  RESEARCH_CLASSIFICATIONS as PUBLIC_CLASSIFICATIONS,
  RESEARCH_HISTORY_STATUSES as PUBLIC_HISTORY_STATUSES
} from '@/shared/types/history-api'

describe('research history architecture contracts', () => {
  it('mantém classificações internas e públicas compatíveis', () => {
    expect(PUBLIC_CLASSIFICATIONS).toEqual(DOMAIN_CLASSIFICATIONS)
  })

  it('mantém status internos e públicos compatíveis', () => {
    expect(PUBLIC_HISTORY_STATUSES).toEqual(APPLICATION_HISTORY_STATUSES)
  })
})
