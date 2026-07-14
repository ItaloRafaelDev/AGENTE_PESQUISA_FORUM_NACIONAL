export const AGENT_ERROR_TYPES = [
  'ERRO_TEMPORARIO',
  'ERRO_DE_SESSAO',
  'ERRO_DE_DADOS',
  'ERRO_DE_PLATAFORMA',
  'ERRO_CRITICO'
] as const

export type AgentErrorType = (typeof AGENT_ERROR_TYPES)[number]
