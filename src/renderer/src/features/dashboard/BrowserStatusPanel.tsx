import type { BrowserManagerSnapshot } from '../../../../shared/types/browser-api'
import type { DashboardControlState } from './dashboard-model'
import { formatDashboardState } from './dashboard-model'
import { StatusIndicator } from './StatusIndicator'

export interface BrowserStatusPanelProps {
  browser: BrowserManagerSnapshot
  controls: DashboardControlState
  onStart(): void
  onStop(): void
}

export function BrowserStatusPanel({
  browser,
  controls,
  onStart,
  onStop
}: BrowserStatusPanelProps): React.JSX.Element {
  return (
    <article className="status-panel">
      <div className="status-panel-heading">
        <div>
          <span className="panel-label">Navegador</span>

          <strong data-testid="browser-state">{formatDashboardState(browser.state)}</strong>
        </div>

        <StatusIndicator
          active={controls.browserRunning}
          label={controls.browserRunning ? 'Conectado' : 'Fechado'}
        />
      </div>

      <p>
        Perfil persistente:
        <span className="path-value">{browser.profilePath || 'Aguardando inicialização'}</span>
      </p>

      <div className="button-row">
        <button
          className="button primary"
          type="button"
          disabled={controls.operationBusy || controls.browserRunning}
          onClick={() => void onStart()}
        >
          Abrir navegador
        </button>

        <button
          className="button secondary"
          type="button"
          disabled={controls.operationBusy || !controls.browserRunning}
          onClick={() => void onStop()}
        >
          Fechar navegador
        </button>
      </div>
    </article>
  )
}
