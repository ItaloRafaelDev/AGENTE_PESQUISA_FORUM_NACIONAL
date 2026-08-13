import type { AgentPublicError } from '../../../../shared/types/agent-runtime-api'
import { formatDashboardState } from './dashboard-model'

export interface AgentErrorPanelProps {
  error: AgentPublicError
}

export function AgentErrorPanel({ error }: AgentErrorPanelProps): React.JSX.Element {
  return (
    <section className="activity-panel" role="alert">
      <div className="section-heading">
        <div>
          <span className="panel-label">Erro E1</span>

          <h2>{formatDashboardState(error.stage)}</h2>
        </div>

        <span>{new Date(error.occurredAt).toLocaleString('pt-BR')}</span>
      </div>

      <p>{error.message}</p>
    </section>
  )
}
