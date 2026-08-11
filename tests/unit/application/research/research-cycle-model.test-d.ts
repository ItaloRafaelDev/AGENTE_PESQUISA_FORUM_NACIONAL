import { expectTypeOf, test } from 'vitest'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'
import type { ResearchClassification } from '@/domain/research/research-classification'

declare const result: ResearchCycleResult

test('mantém o resultado de ciclo de pesquisa estruturalmente compatível', () => {
  expectTypeOf(result.classification).toEqualTypeOf<ResearchClassification>()
  expectTypeOf(result.saved).toEqualTypeOf<true>()
  expectTypeOf(result.confirmationAccepted).toEqualTypeOf<true>()
})
