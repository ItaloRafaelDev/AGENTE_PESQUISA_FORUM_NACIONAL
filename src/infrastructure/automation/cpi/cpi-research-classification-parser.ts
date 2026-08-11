import type { ResearchClassification } from '../../../domain/research/research-classification'

const VALID_CLASSIFICATIONS: readonly ResearchClassification[] = [
  'CONSTA_RESTRICAO',
  'HA_INFORMACOES',
  'NADA_CONSTA',
  'INDEFINIDO'
]

export function parseCpiResearchClassification(args: readonly string[]): ResearchClassification {
  const rawClassification = args[0]?.trim()

  if (!rawClassification) {
    throw new Error('Classificação técnica não informada.')
  }

  const classification = rawClassification.toUpperCase()

  if (!VALID_CLASSIFICATIONS.includes(classification as ResearchClassification)) {
    throw new Error('Classificação técnica inválida.')
  }

  return classification as ResearchClassification
}
