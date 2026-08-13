import { useEffect, useMemo, useState } from 'react'
import type { AgentApi } from '../../../../shared/types/agent-api'
import { getAgentApi } from '../../api/agent-api'
import { useAgentControl, type AgentControlController } from './use-agent-control'
import { useDashboardActions } from './use-dashboard-actions'
import {
  useDashboardEnvironment,
  type DashboardEnvironmentController
} from './use-dashboard-environment'
import { useMountedRef } from './use-mounted-ref'
import { useOperationalLog, type OperationalLogController } from './use-operational-log'
import type { DashboardActionName } from './dashboard-model'

export interface AgentDashboardController
  extends
    Omit<DashboardEnvironmentController, 'hydrate'>,
    Omit<AgentControlController, 'hydrate'>,
    OperationalLogController {
  busyAction: DashboardActionName | null
}

export function useAgentDashboard(injectedApi?: AgentApi): AgentDashboardController {
  const [api] = useState<AgentApi>(() => injectedApi ?? getAgentApi())
  const mountedRef = useMountedRef()
  const operationalLog = useOperationalLog()
  const actions = useDashboardActions(operationalLog.addLog, mountedRef)
  const environment = useDashboardEnvironment(api, actions, mountedRef)
  const agentControl = useAgentControl(api, actions, environment, mountedRef)
  const captureEnvironmentHydrationRevision = environment.captureHydrationRevision
  const hydrateEnvironmentIfCurrent = environment.hydrateIfCurrent
  const captureAgentHydrationRevision = agentControl.captureHydrationRevision
  const hydrateAgentIfCurrent = agentControl.hydrateIfCurrent
  const addLog = operationalLog.addLog

  useEffect(() => {
    let active = true
    const environmentRevision = captureEnvironmentHydrationRevision()
    const agentRevision = captureAgentHydrationRevision()

    async function hydrate(): Promise<void> {
      try {
        const [browserSnapshot, agentSnapshot, sessionSnapshot] = await Promise.all([
          api.browser.getStatus(),
          api.control.getState(),
          api.sessions.getStatus()
        ])

        if (!active || !mountedRef.current) {
          return
        }

        hydrateEnvironmentIfCurrent(browserSnapshot, sessionSnapshot, environmentRevision)
        hydrateAgentIfCurrent(agentSnapshot, agentRevision)
        addLog('Estado inicial carregado.')
      } catch (error: unknown) {
        if (!active || !mountedRef.current) {
          return
        }

        addLog(
          error instanceof Error ? error.message : 'Falha ao carregar o estado inicial.',
          'error'
        )
      }
    }

    void hydrate()

    return () => {
      active = false
    }
  }, [
    addLog,
    api,
    captureAgentHydrationRevision,
    captureEnvironmentHydrationRevision,
    hydrateAgentIfCurrent,
    hydrateEnvironmentIfCurrent,
    mountedRef
  ])

  return useMemo(
    () => ({
      browser: environment.browser,
      sessions: environment.sessions,
      refresh: environment.refresh,
      startBrowser: environment.startBrowser,
      stopBrowser: environment.stopBrowser,
      agent: agentControl.agent,
      startAgent: agentControl.startAgent,
      pauseAgent: agentControl.pauseAgent,
      resumeAgent: agentControl.resumeAgent,
      stopAgent: agentControl.stopAgent,
      completeLogin: agentControl.completeLogin,
      logs: operationalLog.logs,
      addLog: operationalLog.addLog,
      busyAction: actions.busyAction
    }),
    [
      actions.busyAction,
      agentControl.agent,
      agentControl.completeLogin,
      agentControl.pauseAgent,
      agentControl.resumeAgent,
      agentControl.startAgent,
      agentControl.stopAgent,
      environment.browser,
      environment.refresh,
      environment.sessions,
      environment.startBrowser,
      environment.stopBrowser,
      operationalLog.addLog,
      operationalLog.logs
    ]
  )
}
