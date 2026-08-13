// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
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
const unsubscribeState = vi.fn()

let stateListener: ((state: AgentPublicState) => void) | null = null

beforeEach(() => {
  for (const command of [
    browserStart,
    browserStop,
    browserGetStatus,
    agentGetState,
    agentStart,
    agentPause,
    agentResume,
    agentStop,
    loginCompleted,
    sessionsGetStatus,
    unsubscribeState
  ]) {
    command.mockReset()
  }

  stateListener = null
  browserStart.mockResolvedValue(browserRunning)
  browserStop.mockResolvedValue(browserStopped)
  browserGetStatus.mockResolvedValue(browserStopped)
  agentGetState.mockResolvedValue(createInitialAgentPublicState())
  agentStart.mockResolvedValue(agentState('OCIOSO'))
  agentPause.mockResolvedValue(agentState('PAUSADO'))
  agentResume.mockResolvedValue(agentState('OCIOSO'))
  agentStop.mockResolvedValue(createInitialAgentPublicState())
  loginCompleted.mockResolvedValue(agentState('OCIOSO'))
  sessionsGetStatus.mockResolvedValue(sessionsAuthenticated)
  unsubscribeState.mockImplementation(() => {
    stateListener = null
  })

  Object.defineProperty(window, 'agent', {
    configurable: true,
    value: {
      browser: { start: browserStart, stop: browserStop, getStatus: browserGetStatus },
      control: {
        getState: agentGetState,
        start: agentStart,
        pause: agentPause,
        resume: agentResume,
        stop: agentStop,
        loginCompleted,
        onStateChanged: (listener: (state: AgentPublicState) => void) => {
          stateListener = listener
          return unsubscribeState
        }
      },
      sessions: { getStatus: sessionsGetStatus },
      history: {
        list: vi
          .fn()
          .mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }),
        clear: vi.fn().mockResolvedValue(undefined),
        onRecordCreated: vi.fn(() => () => undefined),
        onRecordUpdated: vi.fn(() => () => undefined),
        onCleared: vi.fn(() => () => undefined)
      },
      pdf: {
        open: vi.fn().mockResolvedValue({ status: 'OPENED' }),
        reveal: vi.fn().mockResolvedValue({ status: 'REVEALED' })
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const controlCases = [
  { status: 'PARADO', enabled: ['Iniciar agente'] },
  { status: 'ERRO_E1', enabled: ['Iniciar agente', 'Parar'] },
  { status: 'EXECUTANDO', enabled: ['Pausar', 'Parar'] },
  { status: 'OCIOSO', enabled: ['Pausar', 'Parar'] },
  { status: 'PAUSADO', enabled: ['Continuar', 'Parar'] },
  { status: 'PARANDO', enabled: [] },
  { status: 'AGUARDANDO_LOGIN', enabled: ['Parar', 'Login concluído — continuar'] }
] as const

describe('AgentDashboard contínuo', () => {
  it('delega efeitos, comandos e propriedade do log ao controller do dashboard', () => {
    const source = readFileSync('src/renderer/src/components/AgentDashboard.tsx', 'utf8')

    expect(source).toContain('const dashboard = useAgentDashboard()')
    expect(source).not.toMatch(/\buse(?:Effect|State|OperationalLog)\b/)
    expect(source).not.toMatch(/\b(?:addLog|setLogs|executeAgentAction|executeBrowserAction)\b/)
    expect(source).not.toMatch(/\bwindow\.agent\b/)
  })

  it('mantém os rótulos de sessão sob propriedade do dashboard model', () => {
    const source = readFileSync(
      'src/renderer/src/features/dashboard/PlatformSessionsPanel.tsx',
      'utf8'
    )

    expect(source).toMatch(
      /import\s*\{[^}]*\bformatSessionState\b[^}]*\}\s*from\s*'\.\/dashboard-model'/
    )
    expect(source).not.toMatch(/['"](?:Autenticado|Aguardando login|Indeterminado)['"]/)
  })

  it('inicia parado sem abrir navegador ou pesquisa', async () => {
    render(<AgentDashboard />)

    expect(await screen.findByTestId('agent-state')).toHaveTextContent(/^PARADO$/)
    expect(browserStart).not.toHaveBeenCalled()
    expect(agentStart).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Iniciar agente' })).toBeEnabled()
  })

  it.each([
    { status: 'PARADO' as const, button: 'Iniciar agente', command: agentStart },
    { status: 'OCIOSO' as const, button: 'Pausar', command: agentPause },
    { status: 'PAUSADO' as const, button: 'Continuar', command: agentResume },
    { status: 'EXECUTANDO' as const, button: 'Parar', command: agentStop },
    {
      status: 'AGUARDANDO_LOGIN' as const,
      button: 'Login concluído — continuar',
      command: loginCompleted
    }
  ])(
    'envia $button ao controle quando o agente está $status',
    async ({ status, button, command }) => {
      agentGetState.mockResolvedValue(agentState(status))
      const user = userEvent.setup()
      render(<AgentDashboard />)
      await screen.findByTestId('agent-state')

      await user.click(screen.getByRole('button', { name: button }))

      expect(command).toHaveBeenCalledTimes(1)
    }
  )

  it('abre e fecha o navegador somente pelos botões correspondentes', async () => {
    const user = userEvent.setup()
    const view = render(<AgentDashboard />)
    await screen.findByTestId('agent-state')

    await user.click(screen.getByRole('button', { name: 'Abrir navegador' }))
    expect(browserStart).toHaveBeenCalledTimes(1)
    expect(browserStop).not.toHaveBeenCalled()

    view.unmount()
    browserGetStatus.mockResolvedValue(browserRunning)
    render(<AgentDashboard />)
    await screen.findByTestId('agent-state')

    await user.click(screen.getByRole('button', { name: 'Fechar navegador' }))
    expect(browserStop).toHaveBeenCalledTimes(1)
    expect(browserStart).toHaveBeenCalledTimes(1)
  })

  it('exibe erro E1 sanitizado', async () => {
    agentGetState.mockResolvedValue({
      ...agentState('ERRO_E1'),
      lastError: {
        stage: 'SAVING_CPI',
        message: 'Falha com CPF ***.***.***-44',
        occurredAt: '2026-07-14T10:00:00.000Z'
      }
    })
    render(<AgentDashboard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha com CPF ***.***.***-44')
  })

  it.each(controlCases)(
    'expõe apenas os controles habilitados para $status',
    async ({ status, enabled }) => {
      agentGetState.mockResolvedValue(agentState(status))
      render(<AgentDashboard />)

      await screen.findByTestId('agent-state')

      const controls = document.querySelector('.agent-controls')
      expect(controls).not.toBeNull()

      const buttons = within(controls as HTMLElement).getAllByRole('button')
      const names = buttons.map((button) => button.textContent)
      const expectedNames = [
        'Iniciar agente',
        'Pausar',
        'Continuar',
        'Parar',
        ...(status === 'AGUARDANDO_LOGIN' ? ['Login concluído — continuar'] : [])
      ]

      expect(names).toEqual(expectedNames)
      for (const button of buttons) {
        expect(button).toHaveProperty('disabled', !enabled.includes(button.textContent as never))
      }
    }
  )

  it('bloqueia todos os controles enquanto o comando pendente não se resolve', async () => {
    const command = deferred<AgentPublicState>()
    agentGetState.mockResolvedValue(agentState('AGUARDANDO_LOGIN'))
    browserGetStatus.mockResolvedValue(browserRunning)
    loginCompleted.mockReturnValue(command.promise)
    const user = userEvent.setup()

    render(<AgentDashboard />)
    await screen.findByRole('button', { name: 'Login concluído — continuar' })

    await user.click(screen.getByRole('button', { name: 'Login concluído — continuar' }))

    const controls = document.querySelector('.status-grid')
    expect(controls).not.toBeNull()
    for (const button of within(controls as HTMLElement).getAllByRole('button')) {
      expect(button).toBeDisabled()
    }

    await act(async () => {
      command.resolve(agentState('OCIOSO'))
      await command.promise
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Fechar navegador' })).toBeEnabled()
    })
  })

  it('hidrata uma vez e cancela a inscrição de estado uma vez no unmount', async () => {
    const view = render(<AgentDashboard />)
    await screen.findByTestId('agent-state')

    expect(browserGetStatus).toHaveBeenCalledTimes(1)
    expect(agentGetState).toHaveBeenCalledTimes(1)
    expect(sessionsGetStatus).toHaveBeenCalledTimes(1)

    view.unmount()
    expect(unsubscribeState).toHaveBeenCalledTimes(1)
  })

  it('recebe atualização de estado em tempo real sem buscar o agente novamente', async () => {
    render(<AgentDashboard />)
    await screen.findByTestId('agent-state')

    act(() => {
      stateListener?.({
        ...agentState('EXECUTANDO'),
        currentMaskedCpf: '***.***.***-44'
      })
    })

    expect(screen.getByTestId('agent-state')).toHaveTextContent(/^EXECUTANDO$/)
    expect(screen.getByText('***.***.***-44')).toBeInTheDocument()
    expect(agentGetState).toHaveBeenCalledTimes(1)
  })

  it.each(['resolve', 'reject'] as const)(
    'não atualiza estado quando a hidratação %s após unmount',
    async (outcome) => {
      const browser = deferred<typeof browserStopped>()
      const agent = deferred<AgentPublicState>()
      const sessions = deferred<typeof sessionsAuthenticated>()
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      browserGetStatus.mockReturnValue(browser.promise)
      agentGetState.mockReturnValue(agent.promise)
      sessionsGetStatus.mockReturnValue(sessions.promise)

      const view = render(<AgentDashboard />)
      view.unmount()

      await act(async () => {
        if (outcome === 'resolve') {
          browser.resolve(browserStopped)
          agent.resolve(createInitialAgentPublicState())
          sessions.resolve(sessionsAuthenticated)
        } else {
          browser.reject(new Error('Falha de hidratação.'))
          agent.reject(new Error('Falha de hidratação.'))
          sessions.reject(new Error('Falha de hidratação.'))
        }
        await Promise.resolve()
      })

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    }
  )

  it('mantém os dez logs mais novos em ordem decrescente após onze ações', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-14T12:00:00.000Z'))
    const actions = [
      ['Iniciar agente', 'Agente iniciado.'],
      ['Pausar', 'Pausa segura solicitada.'],
      ['Continuar', 'Execução retomada.'],
      ['Parar', 'Agente parado com segurança.'],
      ['Iniciar agente', 'Agente iniciado.'],
      ['Pausar', 'Pausa segura solicitada.'],
      ['Continuar', 'Execução retomada.'],
      ['Parar', 'Agente parado com segurança.'],
      ['Iniciar agente', 'Agente iniciado.'],
      ['Pausar', 'Pausa segura solicitada.'],
      ['Continuar', 'Execução retomada.']
    ] as const

    render(<AgentDashboard />)
    await act(async () => {
      await Promise.resolve()
    })

    for (const [index, [buttonName]] of actions.entries()) {
      vi.setSystemTime(new Date(`2026-07-14T12:00:${String(index + 1).padStart(2, '0')}.000Z`))
      await act(async () => {
        screen.getByRole('button', { name: buttonName }).click()
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    expect(
      [...document.querySelectorAll('.log-entry span')].map((entry) => entry.textContent)
    ).toEqual(
      actions
        .slice(1)
        .map(([, message]) => message)
        .reverse()
    )
  })

  it('preserva o log de sucesso quando a atualização secundária falha', async () => {
    const user = userEvent.setup()
    render(<AgentDashboard />)
    await screen.findByTestId('agent-state')
    browserGetStatus.mockRejectedValueOnce(new Error('Atualização secundária falhou.'))

    await user.click(screen.getByRole('button', { name: 'Iniciar agente' }))

    expect(await screen.findByText('Agente iniciado.')).toBeInTheDocument()
    expect(screen.queryByText('Atualização secundária falhou.')).not.toBeInTheDocument()
  })

  it('preserva a estrutura normal, ordem dos controles e plataformas', async () => {
    render(<AgentDashboard />)
    await screen.findByTestId('agent-state')

    const header = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const statusGrid = screen.getByLabelText('Estados operacionais')

    expect(header.className).toBe('dashboard-header')
    expect([...header.children].map((element) => element.className)).toEqual([
      '',
      'status-indicator'
    ])
    expect(header.textContent).toBe(
      'Agente CPICentral de automaçãoControle operacional das pesquisas CPI Central e DeskData.Agente parado'
    )
    expect(main.className).toBe('dashboard-content')
    expect(main.getAttribute('aria-label')).toBeNull()
    expect(statusGrid.className).toBe('status-grid')
    expect(statusGrid.getAttribute('aria-label')).toBe('Estados operacionais')
    expect(statusGrid.getAttribute('role')).toBeNull()
    const statusPanels = [...statusGrid.children]
    expect(statusPanels).toHaveLength(2)
    expect(
      statusPanels.map((panel) => ({
        tagName: panel.tagName,
        className: panel.className,
        label: panel.querySelector('.panel-label')?.textContent,
        stateTestId: panel.querySelector('[data-testid]')?.getAttribute('data-testid')
      }))
    ).toEqual([
      {
        tagName: 'ARTICLE',
        className: 'status-panel',
        label: 'Navegador',
        stateTestId: 'browser-state'
      },
      {
        tagName: 'ARTICLE',
        className: 'status-panel',
        label: 'Agente',
        stateTestId: 'agent-state'
      }
    ])
    expect(screen.getByTestId('browser-state').textContent).toBe('STOPPED')
    expect(screen.getByTestId('agent-state').textContent).toBe('PARADO')
    expect(
      [...document.querySelector('.dashboard-content')!.children].map(
        (element) => element.className
      )
    ).toEqual(['status-grid', 'platform-grid', 'activity-panel', 'activity-panel history-panel'])
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Abrir navegador',
      'Fechar navegador',
      'Iniciar agente',
      'Pausar',
      'Continuar',
      'Parar',
      'Limpar histórico'
    ])
    expect([...document.querySelectorAll('.platform-row')].map((row) => row.className)).toEqual([
      'platform-row',
      'platform-row'
    ])
    expect([...document.querySelectorAll('.platform-row')].map((row) => row.textContent)).toEqual([
      'CPI CentralAutenticadoAutenticado',
      'DeskDataAutenticadoAutenticado'
    ])
  })

  it('preserva a assinatura de cinco filhos quando há erro E1', async () => {
    agentGetState.mockResolvedValue({
      ...agentState('ERRO_E1'),
      lastError: {
        stage: 'SAVING_CPI',
        message: 'Falha sanitizada.',
        occurredAt: '2026-07-14T10:00:00.000Z'
      }
    })
    render(<AgentDashboard />)

    const alert = await screen.findByRole('alert')
    expect(alert.className).toBe('activity-panel')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('Falha sanitizada.')
    expect(document.querySelector('.dashboard-content')?.children).toHaveLength(5)
    expect(
      [...document.querySelector('.dashboard-content')!.children].map(
        (element) => element.className
      )
    ).toEqual([
      'status-grid',
      'platform-grid',
      'activity-panel',
      'activity-panel',
      'activity-panel history-panel'
    ])
  })
})
