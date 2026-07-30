// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentDashboard from '@/renderer/src/components/AgentDashboard'
import {
  createInitialAgentPublicState,
  type AgentPublicState
} from '@/shared/types/agent-runtime-api'

const browserStopped = {
  state: 'STOPPED' as const,
  profilePath: 'C:\\AgenteCPI\\browser-profile',
  startedAt: null
}

const browserRunning = {
  ...browserStopped,
  state: 'RUNNING' as const,
  startedAt: '2026-07-14T10:00:00.000Z'
}

const sessionsAuthenticated = {
  cpi: {
    state: 'AUTHENTICATED' as const,
    url: 'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
  },
  deskData: {
    state: 'AUTHENTICATED' as const,
    url: 'https://app.deskdata.com.br/pessoas/'
  },
  allAuthenticated: true,
  checkedAt: '2026-07-14T10:00:00.000Z'
}

function agentState(status: AgentPublicState['status']): AgentPublicState {
  return {
    ...createInitialAgentPublicState(),
    status
  }
}

const browserStart = vi.fn()
const browserStop = vi.fn()
const browserGetStatus = vi.fn()

const agentGetState = vi.fn()
const agentStart = vi.fn()
const agentPause = vi.fn()
const agentResume = vi.fn()
const agentStop = vi.fn()
const loginCompleted = vi.fn()

const sessionsGetStatus = vi.fn()

let stateListener: ((state: AgentPublicState) => void) | null = null

beforeEach(() => {
  browserStart.mockReset()
  browserStop.mockReset()
  browserGetStatus.mockReset()
  agentGetState.mockReset()
  agentStart.mockReset()
  agentPause.mockReset()
  agentResume.mockReset()
  agentStop.mockReset()
  loginCompleted.mockReset()
  sessionsGetStatus.mockReset()

  stateListener = null

  browserStart.mockResolvedValue(browserRunning)

  browserStop.mockResolvedValue(browserStopped)

  browserGetStatus.mockResolvedValue(browserStopped)

  agentGetState.mockResolvedValue(createInitialAgentPublicState())

  agentStart.mockResolvedValue({
    ...createInitialAgentPublicState(),
    status: 'OCIOSO'
  })

  agentPause.mockResolvedValue({
    ...createInitialAgentPublicState(),
    status: 'PAUSADO'
  })

  agentResume.mockResolvedValue({
    ...createInitialAgentPublicState(),
    status: 'OCIOSO'
  })

  agentStop.mockResolvedValue(createInitialAgentPublicState())

  loginCompleted.mockResolvedValue({
    ...createInitialAgentPublicState(),
    status: 'OCIOSO'
  })

  sessionsGetStatus.mockResolvedValue(sessionsAuthenticated)

  Object.defineProperty(window, 'agent', {
    configurable: true,
    value: {
      browser: {
        start: browserStart,
        stop: browserStop,
        getStatus: browserGetStatus
      },
      control: {
        getState: agentGetState,
        start: agentStart,
        pause: agentPause,
        resume: agentResume,
        stop: agentStop,
        loginCompleted,
        onStateChanged: (listener: (state: AgentPublicState) => void) => {
          stateListener = listener

          return () => {
            stateListener = null
          }
        }
      },
      sessions: {
        getStatus: sessionsGetStatus
      },
      history: {
        list: vi.fn().mockResolvedValue({
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
          totalPages: 0
        }),
        clear: vi.fn().mockResolvedValue(undefined),
        onRecordCreated: vi.fn(() => () => undefined),
        onRecordUpdated: vi.fn(() => () => undefined),
        onCleared: vi.fn(() => () => undefined)
      },
      pdf: {
        open: vi.fn().mockResolvedValue({
          status: 'OPENED'
        }),
        reveal: vi.fn().mockResolvedValue({
          status: 'REVEALED'
        })
      }
    }
  })
})

afterEach(() => {
  cleanup()
})

describe('AgentDashboard contínuo', () => {
  it('inicia parado sem abrir navegador ou pesquisa', async () => {
    render(<AgentDashboard />)

    expect(await screen.findByTestId('agent-state')).toHaveTextContent('PARADO')

    expect(browserStart).not.toHaveBeenCalled()
    expect(agentStart).not.toHaveBeenCalled()

    expect(
      screen.getByRole('button', {
        name: 'Iniciar agente'
      })
    ).toBeEnabled()
  })

  it('inicia o agente diretamente pelo dashboard', async () => {
    const user = userEvent.setup()

    render(<AgentDashboard />)

    await screen.findByTestId('agent-state')

    await user.click(
      screen.getByRole('button', {
        name: 'Iniciar agente'
      })
    )

    expect(agentStart).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByTestId('agent-state')).toHaveTextContent('OCIOSO')
    })
  })

  it('mostra confirmação manual quando aguarda login', async () => {
    agentGetState.mockResolvedValue({
      ...createInitialAgentPublicState(),
      status: 'AGUARDANDO_LOGIN'
    })

    render(<AgentDashboard />)

    const user = userEvent.setup()
    const button = await screen.findByRole('button', {
      name: 'Login concluído — continuar'
    })

    expect(button).toBeEnabled()
    await user.click(button)
    expect(loginCompleted).toHaveBeenCalledOnce()
  })

  it('recebe atualizações em tempo real sem polling do agente', async () => {
    render(<AgentDashboard />)

    await screen.findByTestId('agent-state')

    stateListener?.({
      ...createInitialAgentPublicState(),
      status: 'EXECUTANDO',
      currentStage: 'PREPARING_DESKDATA',
      currentMaskedCpf: '***.***.***-44'
    })

    await waitFor(() => {
      expect(screen.getByTestId('agent-state')).toHaveTextContent('EXECUTANDO')

      expect(screen.getByText('***.***.***-44')).toBeInTheDocument()
    })

    expect(agentGetState).toHaveBeenCalledTimes(1)
  })

  it('exibe erro E1 sanitizado', async () => {
    agentGetState.mockResolvedValue({
      ...createInitialAgentPublicState(),
      status: 'ERRO_E1',
      lastError: {
        stage: 'SAVING_CPI',
        message: 'Falha com CPF ***.***.***-44',
        occurredAt: '2026-07-14T10:00:00.000Z'
      }
    })

    render(<AgentDashboard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha com CPF ***.***.***-44')
  })

  it('abre e fecha o navegador somente pelos botões correspondentes', async () => {
    const user = userEvent.setup()
    const view = render(<AgentDashboard />)

    await screen.findByTestId('agent-state')
    await user.click(screen.getByRole('button', { name: 'Abrir navegador' }))
    expect(browserStart).toHaveBeenCalledOnce()
    expect(browserStop).not.toHaveBeenCalled()

    view.unmount()
    browserGetStatus.mockResolvedValue(browserRunning)
    render(<AgentDashboard />)

    await screen.findByTestId('agent-state')
    await user.click(screen.getByRole('button', { name: 'Fechar navegador' }))
    expect(browserStop).toHaveBeenCalledOnce()
    expect(browserStart).toHaveBeenCalledOnce()
  })

  it.each([
    {
      status: 'OCIOSO' as const,
      button: 'Pausar',
      command: agentPause
    },
    {
      status: 'PAUSADO' as const,
      button: 'Continuar',
      command: agentResume
    },
    {
      status: 'EXECUTANDO' as const,
      button: 'Parar',
      command: agentStop
    }
  ])('executa $button quando o agente está $status', async ({ status, button, command }) => {
    agentGetState.mockResolvedValue(agentState(status))
    const user = userEvent.setup()

    render(<AgentDashboard />)
    await screen.findByTestId('agent-state')
    await user.click(screen.getByRole('button', { name: button }))

    expect(command).toHaveBeenCalledOnce()

    for (const otherCommand of [agentPause, agentResume, agentStop]) {
      if (otherCommand !== command) {
        expect(otherCommand).not.toHaveBeenCalled()
      }
    }
  })
})
