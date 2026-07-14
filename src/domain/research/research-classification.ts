export const RESEARCH_CLASSIFICATIONS = [
  'CONSTA_RESTRICAO',
  'HA_INFORMACOES',
  'NADA_CONSTA',
  'INDEFINIDO'
] as const

export type ResearchClassification = (typeof RESEARCH_CLASSIFICATIONS)[number]
