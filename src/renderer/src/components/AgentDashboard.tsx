import { useAgentCountdown } from '../hooks/use-agent-countdown'
import { AgentErrorPanel } from '../features/dashboard/AgentErrorPanel'
import { AgentStatusPanel } from '../features/dashboard/AgentStatusPanel'
import { BrowserStatusPanel } from '../features/dashboard/BrowserStatusPanel'
import { DashboardHeader } from '../features/dashboard/DashboardHeader'
import { getDashboardControlState } from '../features/dashboard/dashboard-model'
import { OperationalLogPanel } from '../features/dashboard/OperationalLogPanel'
import { PlatformSessionsPanel } from '../features/dashboard/PlatformSessionsPanel'
import { useAgentDashboard } from '../features/dashboard/use-agent-dashboard'
import ResearchHistoryPanel from './ResearchHistoryPanel'

export default function AgentDashboard(): React.JSX.Element {
  const dashboard = useAgentDashboard()
  const countdownSeconds = useAgentCountdown(
    dashboard.agent.nextCheckAt,
    dashboard.agent.remainingSeconds
  )
  const controls = getDashboardControlState(
    dashboard.browser.state,
    dashboard.agent.status,
    dashboard.busyAction
  )

  return (
    <div className="dashboard-shell">
      <DashboardHeader agentStatus={dashboard.agent.status} />

      <main className="dashboard-content">
        <section className="status-grid" aria-label="Estados operacionais">
          <BrowserStatusPanel
            browser={dashboard.browser}
            controls={controls}
            onStart={dashboard.startBrowser}
            onStop={dashboard.stopBrowser}
          />

          <AgentStatusPanel
            agent={dashboard.agent}
            countdownSeconds={countdownSeconds}
            controls={controls}
            onStart={dashboard.startAgent}
            onPause={dashboard.pauseAgent}
            onResume={dashboard.resumeAgent}
            onStop={dashboard.stopAgent}
            onLoginCompleted={dashboard.completeLogin}
          />
        </section>

        <PlatformSessionsPanel sessions={dashboard.sessions} />

        {dashboard.agent.lastError ? <AgentErrorPanel error={dashboard.agent.lastError} /> : null}

        <OperationalLogPanel logs={dashboard.logs} />
        <ResearchHistoryPanel />
      </main>
    </div>
  )
}
