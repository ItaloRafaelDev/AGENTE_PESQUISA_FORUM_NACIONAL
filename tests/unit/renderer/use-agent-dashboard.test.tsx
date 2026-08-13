// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAgentApi } from '@/renderer/src/api/agent-api'
import { useAgentDashboard } from '@/renderer/src/features/dashboard/use-agent-dashboard'
import { useAgentControl } from '@/renderer/src/features/dashboard/use-agent-control'
import type { DashboardActionController } from '@/renderer/src/features/dashboard/use-dashboard-actions'
import type { DashboardEnvironmentController } from '@/renderer/src/features/dashboard/use-dashboard-environment'
import {
  createInitialAgentPublicState,
  type AgentPublicState
} from '@/shared/types/agent-runtime-api'
import type { AgentApi } from '@/shared/types/agent-api'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'
import type { PlatformSessionsSnapshot } from '@/shared/types/session-api'

vi.mock('@/renderer/src/api/agent-api', () => ({ getAgentApi: vi.fn() }))

const browserStopped: BrowserManagerSnapshot = {
  state: 'STOPPED',
  profilePath: 'C:\\AgenteCPI\\browser-profile',
  startedAt: null
}

const browserRunning: BrowserManagerSnapshot = {
  ...browserStopped,
  state: 'RUNNING',
  startedAt: '2026-07-14T10:00:00.000Z'
}

const sessionsAuthenticated: PlatformSessionsSnapshot = {
  cpi: { state: 'AUTHENTICATED', url: 'https://adm.cpicentral.com.br/' },
  deskData: { state: 'AUTHENTICATED', url: 'https://app.deskdata.com.br/' },
  allAuthenticated: true,
  checkedAt: '2026-07-14T10:00:00.000Z'
}

const sessionsWaiting: PlatformSessionsSnapshot = {
  cpi: { state: 'WAITING_LOGIN', url: 'https://adm.cpicentral.com.br/login' },
  deskData: { state: 'WAITING_LOGIN', url: 'https://app.deskdata.com.br/login' },
  allAuthenticated: false,
  checkedAt: '2026-07-14T09:59:00.000Z'
}

function agentState(status: AgentPublicState['status']): AgentPublicState {
  return { ...createInitialAgentPublicState(), status }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

interface AgentApiFake extends AgentApi {
  browser: {
    start: ReturnType<typeof vi.fn<AgentApi['browser']['start']>>
    stop: ReturnType<typeof vi.fn<AgentApi['browser']['stop']>>
    getStatus: ReturnType<typeof vi.fn<AgentApi['browser']['getStatus']>>
  }
  control: {
    getState: ReturnType<typeof vi.fn<AgentApi['control']['getState']>>
    start: ReturnType<typeof vi.fn<AgentApi['control']['start']>>
    pause: ReturnType<typeof vi.fn<AgentApi['control']['pause']>>
    resume: ReturnType<typeof vi.fn<AgentApi['control']['resume']>>
    stop: ReturnType<typeof vi.fn<AgentApi['control']['stop']>>
    loginCompleted: ReturnType<typeof vi.fn<AgentApi['control']['loginCompleted']>>
    onStateChanged: ReturnType<typeof vi.fn<AgentApi['control']['onStateChanged']>>
  }
  sessions: {
    getStatus: ReturnType<typeof vi.fn<AgentApi['sessions']['getStatus']>>
  }
}

function createApiFake(): {
  api: AgentApiFake
  emitState(state: AgentPublicState): void
  unsubscribe: ReturnType<typeof vi.fn>
} {
  let listener: ((state: AgentPublicState) => void) | null = null
  const unsubscribe = vi.fn()
  const api: AgentApiFake = {
    browser: {
      start: vi.fn().mockResolvedValue(browserRunning),
      stop: vi.fn().mockResolvedValue(browserStopped),
      getStatus: vi.fn().mockResolvedValue(browserStopped)
    },
    control: {
      getState: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      start: vi.fn().mockResolvedValue(agentState('OCIOSO')),
      pause: vi.fn().mockResolvedValue(agentState('PAUSADO')),
      resume: vi.fn().mockResolvedValue(agentState('OCIOSO')),
      stop: vi.fn().mockResolvedValue(createInitialAgentPublicState()),
      loginCompleted: vi.fn().mockResolvedValue(agentState('OCIOSO')),
      onStateChanged: vi.fn((nextListener) => {
        listener = nextListener
        return unsubscribe
      })
    },
    sessions: { getStatus: vi.fn().mockResolvedValue(sessionsAuthenticated) },
    history: {
      list: vi
        .fn()
        .mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
      clear: vi.fn().mockResolvedValue(undefined),
      onRecordCreated: vi.fn(() => vi.fn()),
      onRecordUpdated: vi.fn(() => vi.fn()),
      onCleared: vi.fn(() => vi.fn())
    },
    pdf: {
      open: vi.fn().mockResolvedValue({ status: 'OPENED' }),
      reveal: vi.fn().mockResolvedValue({ status: 'REVEALED' })
    }
  }

  return { api, emitState: (state) => listener?.(state), unsubscribe }
}

beforeEach(() => {
  vi.mocked(getAgentApi).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAgentDashboard', () => {
  it('keeps the replayed StrictMode setup active with working commands and balanced cleanup', async () => {
    const { api, emitState, unsubscribe } = createApiFake()
    const view = renderHook(() => useAgentDashboard(api), { reactStrictMode: true })

    await waitFor(() => expect(api.control.onStateChanged).toHaveBeenCalledTimes(2))
    act(() => emitState(agentState('EXECUTANDO')))
    expect(view.result.current.agent.status).toBe('EXECUTANDO')

    await act(async () => {
      await view.result.current.pauseAgent()
    })
    expect(api.control.pause).toHaveBeenCalledTimes(1)
    expect(view.result.current.agent.status).toBe('PAUSADO')
    expect(view.result.current.logs[0]).toMatchObject({
      message: 'Pausa segura solicitada.',
      type: 'success'
    })

    view.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('hydrates with the exact three initial calls and subscribes once', async () => {
    const { api } = createApiFake()
    const { result } = renderHook(() => useAgentDashboard(api))

    await waitFor(() => expect(result.current.logs[0]?.message).toBe('Estado inicial carregado.'))

    expect(api.browser.getStatus).toHaveBeenCalledTimes(1)
    expect(api.control.getState).toHaveBeenCalledTimes(1)
    expect(api.sessions.getStatus).toHaveBeenCalledTimes(1)
    expect(api.control.onStateChanged).toHaveBeenCalledTimes(1)
    expect(result.current.browser).toEqual(browserStopped)
    expect(result.current.agent).toEqual(createInitialAgentPublicState())
    expect(result.current.sessions).toEqual(sessionsAuthenticated)
  })

  it('uses getAgentApi only when no API is injected', async () => {
    const fallback = createApiFake().api
    const injected = createApiFake().api
    vi.mocked(getAgentApi).mockReturnValue(fallback)

    const defaultView = renderHook(() => useAgentDashboard())
    await waitFor(() => expect(defaultView.result.current.logs).toHaveLength(1))
    expect(getAgentApi).toHaveBeenCalledTimes(1)
    defaultView.unmount()

    vi.mocked(getAgentApi).mockClear()
    const injectedView = renderHook(() => useAgentDashboard(injected))
    await waitFor(() => expect(injectedView.result.current.logs).toHaveLength(1))
    expect(getAgentApi).not.toHaveBeenCalled()
  })

  it('does not let initial hydration overwrite a newer realtime agent state', async () => {
    const browser = deferred<BrowserManagerSnapshot>()
    const { api, emitState } = createApiFake()
    api.browser.getStatus.mockReturnValue(browser.promise)
    const { result } = renderHook(() => useAgentDashboard(api))

    act(() => emitState(agentState('EXECUTANDO')))
    expect(result.current.agent.status).toBe('EXECUTANDO')

    await act(async () => {
      browser.resolve(browserStopped)
      await browser.promise
    })
    await waitFor(() => expect(result.current.logs[0]?.message).toBe('Estado inicial carregado.'))

    expect(result.current.agent.status).toBe('EXECUTANDO')
  })

  it('does not let initial hydration overwrite newer browser and session command state', async () => {
    const agent = deferred<AgentPublicState>()
    const { api } = createApiFake()
    api.control.getState.mockReturnValue(agent.promise)
    api.sessions.getStatus
      .mockResolvedValueOnce(sessionsWaiting)
      .mockResolvedValueOnce(sessionsAuthenticated)
    const { result } = renderHook(() => useAgentDashboard(api))

    await act(async () => {
      await result.current.startBrowser()
    })
    expect(result.current.browser).toEqual(browserRunning)
    expect(result.current.sessions).toEqual(sessionsAuthenticated)

    await act(async () => {
      agent.resolve(createInitialAgentPublicState())
      await agent.promise
    })
    await waitFor(() =>
      expect(
        result.current.logs.some(({ message }) => message === 'Estado inicial carregado.')
      ).toBe(true)
    )

    expect(result.current.browser).toEqual(browserRunning)
    expect(result.current.sessions).toEqual(sessionsAuthenticated)
  })

  it('keeps the public controller and command callbacks stable across unrelated rerenders', async () => {
    const { api } = createApiFake()
    const { result, rerender } = renderHook(() => useAgentDashboard(api))
    await waitFor(() => expect(result.current.logs).toHaveLength(1))
    const firstController = result.current
    const firstCommands = {
      refresh: result.current.refresh,
      startBrowser: result.current.startBrowser,
      stopBrowser: result.current.stopBrowser,
      startAgent: result.current.startAgent,
      pauseAgent: result.current.pauseAgent,
      resumeAgent: result.current.resumeAgent,
      stopAgent: result.current.stopAgent,
      completeLogin: result.current.completeLogin
    }

    rerender()

    expect(result.current).toBe(firstController)
    expect({
      refresh: result.current.refresh,
      startBrowser: result.current.startBrowser,
      stopBrowser: result.current.stopBrowser,
      startAgent: result.current.startAgent,
      pauseAgent: result.current.pauseAgent,
      resumeAgent: result.current.resumeAgent,
      stopAgent: result.current.stopAgent,
      completeLogin: result.current.completeLogin
    }).toEqual(firstCommands)
  })

  it.each([
    ['startBrowser', 'browser', 'start', 'Navegador aberto com sucesso.', 'RUNNING'],
    ['stopBrowser', 'browser', 'stop', 'Navegador encerrado com segurança.', 'STOPPED'],
    ['startAgent', 'control', 'start', 'Agente iniciado.', 'OCIOSO'],
    ['pauseAgent', 'control', 'pause', 'Pausa segura solicitada.', 'PAUSADO'],
    ['resumeAgent', 'control', 'resume', 'Execução retomada.', 'OCIOSO'],
    ['stopAgent', 'control', 'stop', 'Agente parado com segurança.', 'PARADO'],
    ['completeLogin', 'control', 'loginCompleted', 'Login validado e execução retomada.', 'OCIOSO']
  ] as const)(
    'routes %s through the shared runner and preserves its exact success semantics',
    async (controllerCommand, group, apiCommand, message, expectedState) => {
      const { api } = createApiFake()
      const { result } = renderHook(() => useAgentDashboard(api))
      await waitFor(() => expect(result.current.logs).toHaveLength(1))

      await act(async () => {
        await result.current[controllerCommand]()
      })

      expect(api[group][apiCommand]).toHaveBeenCalledTimes(1)
      expect(result.current.logs[0]).toMatchObject({ message, type: 'success' })
      if (group === 'browser') {
        expect(result.current.browser.state).toBe(expectedState)
        expect(api.sessions.getStatus).toHaveBeenCalledTimes(2)
      } else {
        expect(result.current.agent.status).toBe(expectedState)
        expect(api.browser.getStatus).toHaveBeenCalledTimes(2)
        expect(api.sessions.getStatus).toHaveBeenCalledTimes(2)
      }
      expect(result.current.busyAction).toBeNull()
    }
  )

  it.each(['browser', 'agent'] as const)(
    'swallows the %s command secondary refresh failure and keeps the success log',
    async (kind) => {
      const { api } = createApiFake()
      const { result } = renderHook(() => useAgentDashboard(api))
      await waitFor(() => expect(result.current.logs).toHaveLength(1))
      api.sessions.getStatus.mockRejectedValueOnce(new Error('Atualização secundária falhou.'))

      await act(async () => {
        await (kind === 'browser' ? result.current.startBrowser() : result.current.startAgent())
      })

      expect(result.current.logs[0]).toMatchObject({
        message: kind === 'browser' ? 'Navegador aberto com sucesso.' : 'Agente iniciado.',
        type: 'success'
      })
      expect(
        result.current.logs.some(({ message }) => message === 'Atualização secundária falhou.')
      ).toBe(false)
    }
  )

  it.each([
    [new Error('Falha de hidratação exata.'), 'Falha de hidratação exata.'],
    [{ reason: 'not-an-error' }, 'Falha ao carregar o estado inicial.']
  ])('logs the public hydration failure and generic fallback', async (failure, message) => {
    const { api } = createApiFake()
    api.control.getState.mockRejectedValue(failure)
    const { result } = renderHook(() => useAgentDashboard(api))

    await waitFor(() => expect(result.current.logs[0]?.message).toBe(message))

    expect(result.current.logs[0]?.type).toBe('error')
  })

  it('applies subscription updates, ignores late events and unsubscribes exactly once', async () => {
    const { api, emitState, unsubscribe } = createApiFake()
    const { result, unmount } = renderHook(() => useAgentDashboard(api))
    await waitFor(() => expect(result.current.logs).toHaveLength(1))

    act(() => emitState(agentState('EXECUTANDO')))
    expect(result.current.agent.status).toBe('EXECUTANDO')

    unmount()
    act(() => emitState(agentState('ERRO_E1')))
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('ignores a retained listener invoked after unsubscribe when mounted is false', () => {
    const { api, emitState, unsubscribe } = createApiFake()
    const mountedRef: React.RefObject<boolean> = { current: true }
    const actions: DashboardActionController = {
      busyAction: null,
      runAction: vi.fn()
    }
    const environment: DashboardEnvironmentController = {
      browser: browserStopped,
      sessions: sessionsAuthenticated,
      hydrate: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      startBrowser: vi.fn().mockResolvedValue(undefined),
      stopBrowser: vi.fn().mockResolvedValue(undefined)
    }
    const view = renderHook(() => useAgentControl(api, actions, environment, mountedRef))

    unsubscribe()
    mountedRef.current = false
    act(() => emitState(agentState('EXECUTANDO')))

    expect(view.result.current.agent.status).toBe('PARADO')
    view.unmount()
  })

  it.each(['resolve', 'reject'] as const)(
    'does not update or log when hydration %s after unmount',
    async (outcome) => {
      const browser = deferred<BrowserManagerSnapshot>()
      const agent = deferred<AgentPublicState>()
      const sessions = deferred<PlatformSessionsSnapshot>()
      const { api } = createApiFake()
      api.browser.getStatus.mockReturnValue(browser.promise)
      api.control.getState.mockReturnValue(agent.promise)
      api.sessions.getStatus.mockReturnValue(sessions.promise)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const view = renderHook(() => useAgentDashboard(api))

      view.unmount()
      const logId = vi.spyOn(Date, 'now')
      await act(async () => {
        if (outcome === 'resolve') {
          browser.resolve(browserStopped)
          agent.resolve(createInitialAgentPublicState())
          sessions.resolve(sessionsAuthenticated)
        } else {
          browser.reject(new Error('late'))
          agent.reject(new Error('late'))
          sessions.reject(new Error('late'))
        }
        await Promise.allSettled([browser.promise, agent.promise, sessions.promise])
      })

      expect(consoleError).not.toHaveBeenCalled()
      expect(logId).not.toHaveBeenCalled()
    }
  )

  it.each(['resolve', 'reject'] as const)(
    'does not refresh or log when an action %s after unmount',
    async (outcome) => {
      const command = deferred<AgentPublicState>()
      const { api } = createApiFake()
      const view = renderHook(() => useAgentDashboard(api))
      await waitFor(() => expect(view.result.current.logs).toHaveLength(1))
      api.control.start.mockReturnValue(command.promise)
      const run = view.result.current.startAgent()
      const browserCalls = api.browser.getStatus.mock.calls.length
      const sessionCalls = api.sessions.getStatus.mock.calls.length

      view.unmount()
      const logId = vi.spyOn(Date, 'now')
      await act(async () => {
        if (outcome === 'resolve') {
          command.resolve(agentState('OCIOSO'))
        } else {
          command.reject(new Error('Falha tardia.'))
        }
        await run
      })

      expect(api.browser.getStatus).toHaveBeenCalledTimes(browserCalls)
      expect(api.sessions.getStatus).toHaveBeenCalledTimes(sessionCalls)
      expect(logId).not.toHaveBeenCalled()
    }
  )
})
