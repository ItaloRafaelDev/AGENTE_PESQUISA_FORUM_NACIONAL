import type { AgentPublicState } from '../../../../shared/types/agent-runtime-api'
import type { DashboardControlState } from './dashboard-model'
import { formatDashboardState } from './dashboard-model'
import { StatusIndicator } from './StatusIndicator'

export interface AgentStatusPanelProps {
  agent: AgentPublicState
  countdownSeconds: number | null
  controls: DashboardControlState
  onStart(): void
  onPause(): void
  onResume(): void
  onStop(): void
  onLoginCompleted(): void
}

export function AgentStatusPanel({
  agent,
  countdownSeconds,
  controls,
  onStart,
  onPause,
  onResume,
  onStop,
  onLoginCompleted
}: AgentStatusPanelProps): React.JSX.Element {
  return (
    <article className="status-panel">
      <div className="status-panel-heading">
        <div>
          <span className="panel-label">Agente</span>

          <strong data-testid="agent-state">{formatDashboardState(agent.status)}</strong>
        </div>

        <StatusIndicator
          active={agent.status !== 'PARADO'}
          label={formatDashboardState(agent.status)}
        />
      </div>

      <div className="metrics">
        <div>
          <span>Ciclos concluídos</span>
          <strong>{agent.completedCycles}</strong>
        </div>

        <div>
          <span>Estado da fila</span>
          <strong>{formatDashboardState(agent.queueStatus)}</strong>
        </div>

        <div>
          <span>Etapa atual</span>
          <strong>{agent.currentStage ? formatDashboardState(agent.currentStage) : '—'}</strong>
        </div>

        <div>
          <span>Próxima verificação</span>
          <strong>{countdownSeconds !== null ? `${countdownSeconds}s` : '—'}</strong>
        </div>
      </div>

      {agent.currentMaskedCpf ? (
        <p>
          CPF em processamento:
          <span className="path-value">{agent.currentMaskedCpf}</span>
        </p>
      ) : null}

      <div className="button-row agent-controls">
        <button
          className="button primary"
          type="button"
          disabled={controls.operationBusy || !controls.canStartAgent}
          onClick={() => void onStart()}
        >
          Iniciar agente
        </button>

        <button
          className="button secondary"
          type="button"
          disabled={controls.operationBusy || !controls.canPauseAgent}
          onClick={() => void onPause()}
        >
          Pausar
        </button>

        <button
          className="button secondary"
          type="button"
          disabled={controls.operationBusy || !controls.canResumeAgent}
          onClick={() => void onResume()}
        >
          Continuar
        </button>

        <button
          className="button danger"
          type="button"
          disabled={controls.operationBusy || !controls.canStopAgent}
          onClick={() => void onStop()}
        >
          Parar
        </button>

        {controls.waitingLogin ? (
          <button
            className="button primary"
            type="button"
            disabled={controls.operationBusy}
            onClick={() => void onLoginCompleted()}
          >
            Login concluído — continuar
          </button>
        ) : null}
      </div>
    </article>
  )
}
