import type { AgentPublicStatus } from '../../../../shared/types/agent-runtime-api'
import { formatDashboardState } from './dashboard-model'
import { StatusIndicator } from './StatusIndicator'

export interface DashboardHeaderProps {
  agentStatus: AgentPublicStatus
}

export function DashboardHeader({ agentStatus }: DashboardHeaderProps): React.JSX.Element {
  const label = agentStatus === 'PARADO' ? 'Agente parado' : formatDashboardState(agentStatus)

  return (
    <header className="dashboard-header">
      <div>
        <p className="application-name">Agente CPI</p>

        <h1>Central de automação</h1>

        <p className="header-description">
          Controle operacional das pesquisas CPI Central e DeskData.
        </p>
      </div>

      <StatusIndicator active={agentStatus !== 'PARADO'} label={label} />
    </header>
  )
}
