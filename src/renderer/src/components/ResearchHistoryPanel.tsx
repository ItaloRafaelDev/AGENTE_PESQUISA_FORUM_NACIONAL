import { useEffect, useState } from 'react'
import type { ResearchHistoryRecord } from '../../../shared/types/history-api'

const PAGE_SIZE = 50

function formatDate(value: string | null): string {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleString('pt-BR')
}

function formatDuration(durationMs: number | null): string {
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

function formatClassification(classification: ResearchHistoryRecord['classification']): string {
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

function formatStatus(status: ResearchHistoryRecord['status']): string {
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

function upsertRecord(
  records: ResearchHistoryRecord[],
  record: ResearchHistoryRecord
): ResearchHistoryRecord[] {
  const remaining = records.filter((candidate) => candidate.id !== record.id)

  return [record, ...remaining].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
  )
}

export default function ResearchHistoryPanel(): React.JSX.Element {
  const [records, setRecords] = useState<ResearchHistoryRecord[]>([])

  const [loading, setLoading] = useState(true)

  const [busy, setBusy] = useState(false)

  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    void window.agent.history
      .list({
        page: 1,
        pageSize: PAGE_SIZE
      })
      .then((page) => {
        if (!mounted) {
          return
        }

        setRecords(page.items)
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return
        }

        setFeedback(error instanceof Error ? error.message : 'Falha ao carregar o histórico.')
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    const unsubscribeCreated = window.agent.history.onRecordCreated((record) => {
      if (mounted) {
        setRecords((current) => upsertRecord(current, record))
      }
    })

    const unsubscribeUpdated = window.agent.history.onRecordUpdated((record) => {
      if (mounted) {
        setRecords((current) => upsertRecord(current, record))
      }
    })

    const unsubscribeCleared = window.agent.history.onCleared(() => {
      if (mounted) {
        setRecords([])
      }
    })

    return () => {
      mounted = false
      unsubscribeCreated()
      unsubscribeUpdated()
      unsubscribeCleared()
    }
  }, [])

  async function executePdfAction(action: 'OPEN' | 'REVEAL', pdfPath: string): Promise<void> {
    setBusy(true)
    setFeedback(null)

    try {
      const result =
        action === 'OPEN'
          ? await window.agent.pdf.open(pdfPath)
          : await window.agent.pdf.reveal(pdfPath)

      if (result.status === 'NOT_FOUND') {
        setFeedback('PDF não encontrado.')

        return
      }

      setFeedback(action === 'OPEN' ? 'PDF aberto.' : 'PDF localizado na pasta.')
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao acessar o PDF.')
    } finally {
      setBusy(false)
    }
  }

  async function clearHistory(): Promise<void> {
    setBusy(true)
    setFeedback(null)

    try {
      await window.agent.history.clear()

      setRecords([])
      setFeedback('Histórico limpo. Os PDFs foram preservados.')
    } catch (error: unknown) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao limpar o histórico.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="activity-panel history-panel" aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <span className="panel-label">Persistência</span>

          <h2 id="history-title">Histórico de pesquisas</h2>
        </div>

        <button
          className="button secondary"
          type="button"
          disabled={busy || loading || records.length === 0}
          onClick={() => void clearHistory()}
        >
          Limpar histórico
        </button>
      </div>

      {feedback ? (
        <p className="history-feedback" aria-live="polite">
          {feedback}
        </p>
      ) : null}

      {loading ? (
        <p className="empty-state">Carregando histórico...</p>
      ) : records.length === 0 ? (
        <p className="empty-state">Nenhuma pesquisa registrada.</p>
      ) : (
        <div className="history-table-wrapper">
          <table className="history-table">
            <thead>
              <tr>
                <th>Início</th>
                <th>CPF</th>
                <th>Classificação</th>
                <th>Resultado CPI</th>
                <th>Status</th>
                <th>Duração</th>
                <th>PDF</th>
              </tr>
            </thead>

            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.startedAt)}</td>

                  <td>
                    <code>{record.maskedCpf}</code>
                  </td>

                  <td>{formatClassification(record.classification)}</td>

                  <td>{record.cpiResult ?? '—'}</td>

                  <td>
                    <span
                      className={`history-status history-status-${record.status.toLowerCase()}`}
                    >
                      {formatStatus(record.status)}
                    </span>
                  </td>

                  <td>{formatDuration(record.durationMs)}</td>

                  <td>
                    {record.pdfPath ? (
                      <div className="history-actions">
                        <button
                          className="button secondary compact"
                          type="button"
                          disabled={busy}
                          onClick={() => void executePdfAction('OPEN', record.pdfPath as string)}
                        >
                          Abrir PDF
                        </button>

                        <button
                          className="button secondary compact"
                          type="button"
                          disabled={busy}
                          onClick={() => void executePdfAction('REVEAL', record.pdfPath as string)}
                        >
                          Mostrar na pasta
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
