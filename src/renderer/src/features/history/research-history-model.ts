import type { ResearchHistoryRecord } from '../../../../shared/types/history-api'

export const RESEARCH_HISTORY_PAGE_SIZE = 50

export function formatHistoryDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleString('pt-BR')
}

export function formatHistoryDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return '—'
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))

  const minutes = Math.floor(totalSeconds / 60)

  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}min ${seconds}s`
}

export function formatResearchClassification(
  classification: ResearchHistoryRecord['classification']
): string {
  switch (classification) {
    case 'CONSTA_RESTRICAO':
      return 'Consta restrição'

    case 'HA_INFORMACOES':
      return 'Há informações'

    case 'INDEFINIDO':
      return 'Indefinido'

    default:
      return '—'
  }
}

export function formatResearchStatus(status: ResearchHistoryRecord['status']): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'Em andamento'

    case 'CONCLUIDO':
      return 'Concluído'

    case 'ERRO_E1':
      return 'Erro E1'

    case 'INTERROMPIDO':
      return 'Interrompido'
  }
}

export function upsertResearchHistoryRecord(
  records: readonly ResearchHistoryRecord[],
  record: ResearchHistoryRecord
): ResearchHistoryRecord[] {
  const remaining = records.filter((candidate) => candidate.id !== record.id)

  return [record, ...remaining].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
  )
}
