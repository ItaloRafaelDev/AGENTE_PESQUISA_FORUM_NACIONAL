import type { ResearchHistoryRecord } from '../../../../shared/types/history-api'
import {
  formatHistoryDate,
  formatHistoryDuration,
  formatResearchClassification,
  formatResearchStatus
} from './research-history-model'

export interface ResearchHistoryTableProps {
  records: readonly ResearchHistoryRecord[]
  busy: boolean
  onOpenPdf(pdfPath: string): void
  onRevealPdf(pdfPath: string): void
}

export function ResearchHistoryTable({
  records,
  busy,
  onOpenPdf,
  onRevealPdf
}: ResearchHistoryTableProps): React.JSX.Element {
  return (
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
          {records.map((record) => {
            const pdfPath = record.pdfPath

            return (
              <tr key={record.id}>
                <td>{formatHistoryDate(record.startedAt)}</td>

                <td>
                  <code>{record.maskedCpf}</code>
                </td>

                <td>{formatResearchClassification(record.classification)}</td>

                <td>{record.cpiResult ?? '—'}</td>

                <td>
                  <span className={`history-status history-status-${record.status.toLowerCase()}`}>
                    {formatResearchStatus(record.status)}
                  </span>
                </td>

                <td>{formatHistoryDuration(record.durationMs)}</td>

                <td>
                  {pdfPath ? (
                    <div className="history-actions">
                      <button
                        className="button secondary compact"
                        type="button"
                        disabled={busy}
                        onClick={() => onOpenPdf(pdfPath)}
                      >
                        Abrir PDF
                      </button>

                      <button
                        className="button secondary compact"
                        type="button"
                        disabled={busy}
                        onClick={() => onRevealPdf(pdfPath)}
                      >
                        Mostrar na pasta
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
