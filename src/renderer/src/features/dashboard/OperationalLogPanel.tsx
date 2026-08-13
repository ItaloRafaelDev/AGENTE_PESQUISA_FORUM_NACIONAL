import type { OperationalLogEntry } from './dashboard-model'

export interface OperationalLogPanelProps {
  logs: readonly OperationalLogEntry[]
}

export function OperationalLogPanel({ logs }: OperationalLogPanelProps): React.JSX.Element {
  return (
    <section className="activity-panel">
      <div className="section-heading">
        <div>
          <span className="panel-label">Atividade</span>

          <h2>Log operacional</h2>
        </div>

        <span>{logs.length} eventos recentes</span>
      </div>

      <div className="log-list" aria-live="polite">
        {logs.length === 0 ? (
          <p className="empty-state">Nenhum evento registrado.</p>
        ) : (
          logs.map((entry) => (
            <div className={`log-entry ${entry.type}`} key={entry.id}>
              <time>{entry.timestamp}</time>

              <span>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
