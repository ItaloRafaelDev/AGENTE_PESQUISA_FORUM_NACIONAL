// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentDashboard from '@/renderer/src/components/AgentDashboard'

const browserStopped = {
  state: 'STOPPED' as const,
  profilePath: 'C:\\AgenteCPI\\browser-profile',
  startedAt: null
}

const browserRunning = {
  state: 'RUNNING' as const,
  profilePath: 'C:\\AgenteCPI\\browser-profile',
  startedAt: '2026-07-14T08:00:00.000Z'
}

const agentStopped = {
  state: 'PARADO' as const,
  pauseRequested: false,
  consecutiveErrors: 0,
  circuitOpen: false,
  safeMode: true
}

const agentWaitingResearch = {
  ...agentStopped,
  state: 'AGUARDANDO_NOVA_PESQUISA' as const
}

const sessionsAuthenticated = {
  cpi: {
    state: 'AUTHENTICATED' as const,
    url: 'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
  },

  deskData: {
    state: 'AUTHENTICATED' as const,
    url: 'https://deskdata.com.br/pessoas/'
  },

  allAuthenticated: true,
  checkedAt: '2026-07-14T08:00:00.000Z'
}

const browserStart = vi.fn()
const browserStop = vi.fn()
const browserStatus = vi.fn()

const agentStart = vi.fn()
const agentPause = vi.fn()
const agentResume = vi.fn()
const agentStop = vi.fn()
const agentStatus = vi.fn()

const sessionsStatus = vi.fn()

beforeEach(() => {
  browserStart.mockReset()
  browserStop.mockReset()
  browserStatus.mockReset()

  agentStart.mockReset()
  agentPause.mockReset()
  agentResume.mockReset()
  agentStop.mockReset()
  agentStatus.mockReset()

  sessionsStatus.mockReset()

  browserStart.mockResolvedValue(browserRunning)
  browserStop.mockResolvedValue(browserStopped)
  browserStatus.mockResolvedValue(browserStopped)

  agentStart.mockResolvedValue(agentWaitingResearch)

  agentPause.mockResolvedValue({
    ...agentWaitingResearch,
    state: 'PAUSADO',
    pauseRequested: true
  })

  agentResume.mockResolvedValue(agentWaitingResearch)
  agentStop.mockResolvedValue(agentStopped)
  agentStatus.mockResolvedValue(agentStopped)

  sessionsStatus.mockResolvedValue(sessionsAuthenticated)

  Object.defineProperty(window, 'agent', {
    configurable: true,

    value: {
      browser: {
        start: browserStart,
        stop: browserStop,
        getStatus: browserStatus
      },

      control: {
        start: agentStart,
        pause: agentPause,
        resume: agentResume,
        stop: agentStop,
        getStatus: agentStatus
      },

      sessions: {
        getStatus: sessionsStatus
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AgentDashboard', () => {
  it('deve iniciar o monitor quando as plataformas estiverem autenticadas', async () => {
    const user = userEvent.setup()

    render(<AgentDashboard />)

    await waitFor(() => {
      expect(browserStatus).toHaveBeenCalledTimes(1)
      expect(agentStatus).toHaveBeenCalledTimes(1)
      expect(sessionsStatus).toHaveBeenCalledTimes(1)
    })

    await user.click(
      screen.getByRole('button', {
        name: 'Abrir navegador'
      })
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Iniciar agente'
      })
    )

    expect(agentStart).toHaveBeenCalledTimes(1)

    expect(screen.getByTestId('agent-state')).toHaveTextContent('AGUARDANDO NOVA PESQUISA')
  })

  it('deve atualizar automaticamente o estado operacional', async () => {
    const originalSetInterval = window.setInterval.bind(window)

    let operationalIntervalCallback: (() => void) | undefined

    vi.spyOn(window, 'setInterval').mockImplementation(
      (handler: TimerHandler, timeout?: number): number => {
        if (timeout === 3_000 && typeof handler === 'function') {
          operationalIntervalCallback = () => {
            handler()
          }

          return 9_001
        }

        return originalSetInterval(handler, timeout)
      }
    )

    render(<AgentDashboard />)

    await waitFor(() => {
      expect(agentStatus).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('agent-state')).toHaveTextContent('PARADO')

    expect(operationalIntervalCallback).toBeDefined()

    agentStatus.mockResolvedValue(agentWaitingResearch)

    await act(async () => {
      operationalIntervalCallback?.()

      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(agentStatus).toHaveBeenCalledTimes(2)

      expect(screen.getByTestId('agent-state')).toHaveTextContent('AGUARDANDO NOVA PESQUISA')
    })
  })
})
