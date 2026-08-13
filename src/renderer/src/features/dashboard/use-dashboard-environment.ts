import { useCallback, useMemo, useRef, useState } from 'react'
import type { AgentApi } from '../../../../shared/types/agent-api'
import type { BrowserManagerSnapshot } from '../../../../shared/types/browser-api'
import type { PlatformSessionsSnapshot } from '../../../../shared/types/session-api'
import { INITIAL_BROWSER_SNAPSHOT, INITIAL_SESSIONS_SNAPSHOT } from './dashboard-model'
import type { DashboardActionController } from './use-dashboard-actions'

export interface DashboardEnvironmentController {
  browser: BrowserManagerSnapshot
  sessions: PlatformSessionsSnapshot
  hydrate(browser: BrowserManagerSnapshot, sessions: PlatformSessionsSnapshot): void
  refresh(): Promise<void>
  startBrowser(): Promise<void>
  stopBrowser(): Promise<void>
}

interface DashboardEnvironmentRevision {
  browser: number
  sessions: number
}

export interface DashboardEnvironmentInternalController extends DashboardEnvironmentController {
  captureHydrationRevision(): DashboardEnvironmentRevision
  hydrateIfCurrent(
    browser: BrowserManagerSnapshot,
    sessions: PlatformSessionsSnapshot,
    revision: DashboardEnvironmentRevision
  ): void
}

export function useDashboardEnvironment(
  api: AgentApi,
  actions: DashboardActionController,
  mountedRef: React.RefObject<boolean>
): DashboardEnvironmentInternalController {
  const [browser, setBrowser] = useState<BrowserManagerSnapshot>(INITIAL_BROWSER_SNAPSHOT)
  const [sessions, setSessions] = useState<PlatformSessionsSnapshot>(INITIAL_SESSIONS_SNAPSHOT)
  const revisionRef = useRef<DashboardEnvironmentRevision>({ browser: 0, sessions: 0 })
  const runAction = actions.runAction

  const captureHydrationRevision = useCallback(
    (): DashboardEnvironmentRevision => ({ ...revisionRef.current }),
    []
  )

  const hydrate = useCallback(
    (browserSnapshot: BrowserManagerSnapshot, sessionSnapshot: PlatformSessionsSnapshot): void => {
      if (!mountedRef.current) {
        return
      }

      setBrowser(browserSnapshot)
      setSessions(sessionSnapshot)
    },
    [mountedRef]
  )

  const hydrateIfCurrent = useCallback(
    (
      browserSnapshot: BrowserManagerSnapshot,
      sessionSnapshot: PlatformSessionsSnapshot,
      revision: DashboardEnvironmentRevision
    ): void => {
      if (!mountedRef.current) {
        return
      }

      if (revisionRef.current.browser === revision.browser) {
        setBrowser(browserSnapshot)
      }
      if (revisionRef.current.sessions === revision.sessions) {
        setSessions(sessionSnapshot)
      }
    },
    [mountedRef]
  )

  const refresh = useCallback(async (): Promise<void> => {
    const [browserSnapshot, sessionSnapshot] = await Promise.all([
      api.browser.getStatus(),
      api.sessions.getStatus()
    ])

    if (!mountedRef.current) {
      return
    }

    revisionRef.current.browser += 1
    revisionRef.current.sessions += 1
    setBrowser(browserSnapshot)
    setSessions(sessionSnapshot)
  }, [api, mountedRef])

  const runBrowserAction = useCallback(
    async (
      actionName: 'browser-start' | 'browser-stop',
      action: () => Promise<BrowserManagerSnapshot>,
      successMessage: string
    ): Promise<void> => {
      await runAction({
        actionName,
        action,
        successMessage,
        onSuccess: async (browserSnapshot) => {
          if (!mountedRef.current) {
            return
          }

          revisionRef.current.browser += 1
          setBrowser(browserSnapshot)

          try {
            const sessionSnapshot = await api.sessions.getStatus()

            if (mountedRef.current) {
              revisionRef.current.sessions += 1
              setSessions(sessionSnapshot)
            }
          } catch {
            // A command succeeded; a secondary status refresh must not replace that outcome.
          }
        }
      })
    },
    [api, mountedRef, runAction]
  )

  const startBrowser = useCallback(
    async (): Promise<void> =>
      runBrowserAction('browser-start', () => api.browser.start(), 'Navegador aberto com sucesso.'),
    [api, runBrowserAction]
  )

  const stopBrowser = useCallback(
    async (): Promise<void> =>
      runBrowserAction(
        'browser-stop',
        () => api.browser.stop(),
        'Navegador encerrado com segurança.'
      ),
    [api, runBrowserAction]
  )

  return useMemo(
    () => ({
      browser,
      sessions,
      hydrate,
      captureHydrationRevision,
      hydrateIfCurrent,
      refresh,
      startBrowser,
      stopBrowser
    }),
    [
      browser,
      captureHydrationRevision,
      hydrate,
      hydrateIfCurrent,
      refresh,
      sessions,
      startBrowser,
      stopBrowser
    ]
  )
}
