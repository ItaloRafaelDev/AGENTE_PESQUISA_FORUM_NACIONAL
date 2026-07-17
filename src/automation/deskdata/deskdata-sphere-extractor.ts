import { normalizeProcessSphere } from '../../domain/research/normalize-process-sphere'
import { DeskDataProcessCollectionError } from './deskdata-process-collection-error'

export interface DeskDataFieldSnapshot {
  label: string
  value: string | null
}

export function extractSphereFromFields(fields: readonly DeskDataFieldSnapshot[]): string | null {
  const sphereValues = fields
    .filter((field) => normalizeProcessSphere(field.label) === 'esfera')
    .map((field) => field.value?.trim() ?? '')
    .filter(Boolean)

  const valuesByNormalizedSphere = new Map<string, string>()

  for (const value of sphereValues) {
    const normalized = normalizeProcessSphere(value)

    if (!valuesByNormalizedSphere.has(normalized)) {
      valuesByNormalizedSphere.set(normalized, value)
    }
  }

  const distinctValues = [...valuesByNormalizedSphere.values()]

  if (distinctValues.length > 1) {
    throw new DeskDataProcessCollectionError(
      'PROCESS_CARD_STRUCTURE_INVALID',
      'O cartão contém valores conflitantes para o campo Esfera.'
    )
  }

  return distinctValues[0] ?? null
}
