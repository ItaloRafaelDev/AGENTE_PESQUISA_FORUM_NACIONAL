import type { PlatformSessionsSnapshot } from '../../../../shared/types/session-api'
import { formatSessionState } from './dashboard-model'
import { StatusIndicator } from './StatusIndicator'

export interface PlatformSessionsPanelProps {
  sessions: PlatformSessionsSnapshot
}

export function PlatformSessionsPanel({ sessions }: PlatformSessionsPanelProps): React.JSX.Element {
  return (
    <section className="platform-grid">
      <article className="platform-row">
        <div>
          <span className="panel-label">CPI Central</span>

          <strong>{formatSessionState(sessions.cpi.state)}</strong>
        </div>

        <StatusIndicator
          active={sessions.cpi.state === 'AUTHENTICATED'}
          label={formatSessionState(sessions.cpi.state)}
        />
      </article>

      <article className="platform-row">
        <div>
          <span className="panel-label">DeskData</span>

          <strong>{formatSessionState(sessions.deskData.state)}</strong>
        </div>

        <StatusIndicator
          active={sessions.deskData.state === 'AUTHENTICATED'}
          label={formatSessionState(sessions.deskData.state)}
        />
      </article>
    </section>
  )
}
