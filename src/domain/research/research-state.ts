export const RESEARCH_STATES = [
  'PENDENTE',
  'ABERTA_NA_CPI',
  'DADOS_COLETADOS',
  'CONSULTA_INICIADA',
  'RESULTADO_VALIDADO',
  'PDF_BAIXADO',
  'CPI_PREENCHIDA',
  'CONCLUIDA',
  'ERRO'
] as const

export type ResearchState = (typeof RESEARCH_STATES)[number]
