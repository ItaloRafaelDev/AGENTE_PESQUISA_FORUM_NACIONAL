import { expectTypeOf, test } from 'vitest'
import { DeskDataClassificationReportFormatter } from '@/infrastructure/automation/deskdata/deskdata-classification-report-formatter'
import type { PreparedResearch } from '@/application/ports/research-preparation-ports'

test('o formatter legado exige o contrato summary distinto da classificação por esfera', () => {
  const classification = null as unknown as PreparedResearch['classification']

  // @ts-expect-error O formatter legado requer summary, não evidence por esfera.
  expectTypeOf(new DeskDataClassificationReportFormatter().format(classification)).toEqualTypeOf<
    string[]
  >()
})
