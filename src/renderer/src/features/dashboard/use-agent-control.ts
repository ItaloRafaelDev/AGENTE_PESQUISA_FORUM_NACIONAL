import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentApi } from '../../../../shared/types/agent-api'
import type { AgentPublicState } from '../../../../shared/types/agent-runtime-api'
import { INITIAL_AGENT_SNAPSHOT, type DashboardActionName } from './dashboard-model'
import type { DashboardActionController } from './use-dashboard-actions'
import type { DashboardEnvironmentController } from './use-dashboard-environment'

export interface AgentControlController {
  agent: AgentPublicState
  hydrate(agent: AgentPublicState): void
  startAgent(): Promise<void>
  pauseAgent(): Promise<void>
  resumeAgent(): Promise<void>
  stopAgent(): Promise<void>
  completeLogin(): Promise<void>
}

export interface AgentControlInternalController extends AgentControlController {
  captureHydrationRevision(): number
  hydrateIfCurrent(agent: AgentPublicState, revision: number): void
}

export function useAgentControl(
  api: AgentApi,
  actions: DashboardActionController,
  environment: DashboardEnvironmentController,
  mountedRef: React.RefObject<boolean>
): AgentControlInternalController {
  const [agent, setAgent] = useState<AgentPublicState>(INITIAL_AGENT_SNAPSHOT)
  const revisionRef = useRef(0)
  const runAction = actions.runAction
  const refreshEnvironment = environment.refresh

  const captureHydrationRevision = useCallback((): number => revisionRef.current, [])

  const hydrate = useCallback(
    (agentSnapshot: AgentPublicState): void => {
      if (mountedRef.current) {
        setAgent(agentSnapshot)
      }
    },
    [mountedRef]
  )

  const hydrateIfCurrent = useCallback(
    (agentSnapshot: AgentPublicState, revision: number): void => {
      if (mountedRef.current && revisionRef.current === revision) {
        setAgent(agentSnapshot)
      }
    },
    [mountedRef]
  )

  useEffect(() => {
    const unsubscribe = api.control.onStateChanged((agentSnapshot) => {
      if (mountedRef.current) {
        revisionRef.current += 1
        setAgent(agentSnapshot)
      }
    })

    return unsubscribe
  }, [api, mountedRef])

  const runAgentAction = useCallback(
    async (
      actionName: Exclude<DashboardActionName, 'browser-start' | 'browser-stop'>,
      action: () => Promise<AgentPublicState>,
      successMessage: string
    ): Promise<void> => {
      await runAction({
        actionName,
        action,
        successMessage,
        onSuccess: async (agentSnapshot) => {
          if (!mountedRef.current) {
            return
          }

          revisionRef.current += 1
          setAgent(agentSnapshot)
          await refreshEnvironment().catch(() => undefined)
        }
      })
    },
    [mountedRef, refreshEnvironment, runAction]
  )

  const startAgent = useCallback(
    async (): Promise<void> =>
      runAgentAction('agent-start', () => api.control.start(), 'Agente iniciado.'),
    [api, runAgentAction]
  )
  const pauseAgent = useCallback(
    async (): Promise<void> =>
      runAgentAction('agent-pause', () => api.control.pause(), 'Pausa segura solicitada.'),
    [api, runAgentAction]
  )
  const resumeAgent = useCallback(
    async (): Promise<void> =>
      runAgentAction('agent-resume', () => api.control.resume(), 'Execução retomada.'),
    [api, runAgentAction]
  )
  const stopAgent = useCallback(
    async (): Promise<void> =>
      runAgentAction('agent-stop', () => api.control.stop(), 'Agente parado com segurança.'),
    [api, runAgentAction]
  )
  const completeLogin = useCallback(
    async (): Promise<void> =>
      runAgentAction(
        'login-completed',
        () => api.control.loginCompleted(),
        'Login validado e execução retomada.'
      ),
    [api, runAgentAction]
  )

  return useMemo(
    () => ({
      agent,
      hydrate,
      captureHydrationRevision,
      hydrateIfCurrent,
      startAgent,
      pauseAgent,
      resumeAgent,
      stopAgent,
      completeLogin
    }),
    [
      agent,
      captureHydrationRevision,
      completeLogin,
      hydrate,
      hydrateIfCurrent,
      pauseAgent,
      resumeAgent,
      startAgent,
      stopAgent
    ]
  )
}
