import type { ResearchClassification } from './research-classification'

const CPI_CLASSIFICATION_LABELS: Record<ResearchClassification, string> = {
  CONSTA_RESTRICAO: 'Sim, Consta Restrições',
  HA_INFORMACOES: 'Há Informações',
  NADA_CONSTA: 'Nada Consta',
  INDEFINIDO: 'Há Informações'
}

export function getCpiClassificationLabel(classification: ResearchClassification): string {
  return CPI_CLASSIFICATION_LABELS[classification]
}
