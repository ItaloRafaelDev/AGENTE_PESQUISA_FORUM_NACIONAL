import { useAgentCountdown } from '../hooks/use-agent-countdown'
import ResearchHistoryPanel from './ResearchHistoryPanel'
import { useEffect, useState } from 'react'
import {
  createInitialAgentPublicState,
  type AgentPublicState
} from '../../../shared/types/agent-runtime-api'
import type { BrowserManagerSnapshot } from '../../../shared/types/browser-api'
import type {
  PlatformSessionState,
  PlatformSessionsSnapshot
} from '../../../shared/types/session-api'

type ActionName =
  | 'browser-start'
  | 'browser-stop'
  | 'agent-start'
  | 'agent-pause'
  | 'agent-resume'
  | 'agent-stop'
  | 'login-completed'

interface LogEntry {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: string
}

const initialBrowserSnapshot: BrowserManagerSnapshot = {
  state: 'STOPPED',
  profilePath: '',
  startedAt: null
}

const initialAgentSnapshot = createInitialAgentPublicState()

const initialSessionsSnapshot: PlatformSessionsSnapshot = {
  cpi: {
    state: 'INDETERMINATE',
    url: null
  },
  deskData: {
    state: 'INDETERMINATE',
    url: null
  },
  allAuthenticated: false,
  checkedAt: null
}

function formatState(state: string): string {
  return state.replaceAll('_', ' ')
}

function formatSessionState(state: PlatformSessionState): string {
  const labels: Record<PlatformSessionState, string> = {
    AUTHENTICATED: 'Autenticado',
    WAITING_LOGIN: 'Aguardando login',
    INDETERMINATE: 'Indeterminado'
  }

  return labels[state]
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function StatusIndicator({ active, label }: { active: boolean; label: string }): React.JSX.Element {
  return (
    <span className={active ? 'status-indicator active' : 'status-indicator'}>
      <span className="status-dot" />
      {label}
    </span>
  )
}

export default function AgentDashboard(): React.JSX.Element {
  const [browser, setBrowser] = useState(initialBrowserSnapshot)

  const [agent, setAgent] = useState<AgentPublicState>(initialAgentSnapshot)

  const [sessions, setSessions] = useState(initialSessionsSnapshot)

  const [busyAction, setBusyAction] = useState<ActionName | null>(null)

  const [logs, setLogs] = useState<LogEntry[]>([])

  const countdownSeconds = useAgentCountdown(agent.nextCheckAt, agent.remainingSeconds)

  function addLog(message: string, type: LogEntry['type'] = 'info'): void {
    setLogs((currentLogs) =>
      [
        {
          id: Date.now(),
          message,
          type,
          timestamp: formatTime(new Date())
        },
        ...currentLogs
      ].slice(0, 10)
    )
  }

  async function refreshEnvironment(): Promise<void> {
    const [browserSnapshot, sessionSnapshot] = await Promise.all([
      window.agent.browser.getStatus(),
      window.agent.sessions.getStatus()
    ])

    setBrowser(browserSnapshot)
    setSessions(sessionSnapshot)
  }

  useEffect(() => {
    let mounted = true

    async function loadInitialState(): Promise<void> {
      try {
        const [browserSnapshot, agentSnapshot, sessionSnapshot] = await Promise.all([
          window.agent.browser.getStatus(),
          window.agent.control.getState(),
          window.agent.sessions.getStatus()
        ])

        if (!mounted) {
          return
        }

        setBrowser(browserSnapshot)
        setAgent(agentSnapshot)
        setSessions(sessionSnapshot)
        addLog('Estado inicial carregado.')
      } catch (error: unknown) {
        if (!mounted) {
          return
        }

        addLog(
          error instanceof Error ? error.message : 'Falha ao carregar o estado inicial.',
          'error'
        )
      }
    }

    void loadInitialState()

    const unsubscribe = window.agent.control.onStateChanged((state) => {
      if (!mounted) {
        return
      }

      setAgent(state)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  async function executeAgentAction(
    actionName: ActionName,
    action: () => Promise<AgentPublicState>,
    successMessage: string
  ): Promise<void> {
    setBusyAction(actionName)

    try {
      const result = await action()

      setAgent(result)

      await refreshEnvironment().catch(() => undefined)

      addLog(successMessage, 'success')
    } catch (error: unknown) {
      addLog(error instanceof Error ? error.message : 'Falha inesperada.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  async function executeBrowserAction(
    actionName: ActionName,
    action: () => Promise<BrowserManagerSnapshot>,
    successMessage: string
  ): Promise<void> {
    setBusyAction(actionName)

    try {
      const result = await action()

      setBrowser(result)

      await window.agent.sessions
        .getStatus()
        .then(setSessions)
        .catch(() => undefined)

      addLog(successMessage, 'success')
    } catch (error: unknown) {
      addLog(error instanceof Error ? error.message : 'Falha inesperada.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const browserRunning = browser.state === 'RUNNING'

  const operationBusy = busyAction !== null

  const canStartAgent = agent.status === 'PARADO' || agent.status === 'ERRO_E1'

  const canPauseAgent = agent.status === 'EXECUTANDO' || agent.status === 'OCIOSO'

  const canResumeAgent = agent.status === 'PAUSADO'

  const canStopAgent = agent.status !== 'PARADO' && agent.status !== 'PARANDO'

  const waitingLogin = agent.status === 'AGUARDANDO_LOGIN'

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="application-name">Agente CPI</p>

          <h1>Central de automação</h1>

          <p className="header-description">
            Controle operacional das pesquisas CPI Central e DeskData.
          </p>
        </div>

        <StatusIndicator
          active={agent.status !== 'PARADO'}
          label={agent.status === 'PARADO' ? 'Agente parado' : formatState(agent.status)}
        />
      </header>

      <main className="dashboard-content">
        <section className="status-grid" aria-label="Estados operacionais">
          <article className="status-panel">
            <div className="status-panel-heading">
              <div>
                <span className="panel-label">Navegador</span>

                <strong data-testid="browser-state">{formatState(browser.state)}</strong>
              </div>

              <StatusIndicator
                active={browserRunning}
                label={browserRunning ? 'Conectado' : 'Fechado'}
              />
            </div>

            <p>
              Perfil persistente:
              <span className="path-value">
                {browser.profilePath || 'Aguardando inicialização'}
              </span>
            </p>

            <div className="button-row">
              <button
                className="button primary"
                type="button"
                disabled={operationBusy || browserRunning}
                onClick={() =>
                  void executeBrowserAction(
                    'browser-start',
                    window.agent.browser.start,
                    'Navegador aberto com sucesso.'
                  )
                }
              >
                Abrir navegador
              </button>

              <button
                className="button secondary"
                type="button"
                disabled={operationBusy || !browserRunning}
                onClick={() =>
                  void executeBrowserAction(
                    'browser-stop',
                    window.agent.browser.stop,
                    'Navegador encerrado com segurança.'
                  )
                }
              >
                Fechar navegador
              </button>
            </div>
          </article>

          <article className="status-panel">
            <div className="status-panel-heading">
              <div>
                <span className="panel-label">Agente</span>

                <strong data-testid="agent-state">{formatState(agent.status)}</strong>
              </div>

              <StatusIndicator
                active={agent.status !== 'PARADO'}
                label={formatState(agent.status)}
              />
            </div>

            <div className="metrics">
              <div>
                <span>Ciclos concluídos</span>
                <strong>{agent.completedCycles}</strong>
              </div>

              <div>
                <span>Estado da fila</span>
                <strong>{formatState(agent.queueStatus)}</strong>
              </div>

              <div>
                <span>Etapa atual</span>
                <strong>{agent.currentStage ? formatState(agent.currentStage) : '—'}</strong>
              </div>

              <div>
                <span>Próxima verificação</span>
                <strong>{countdownSeconds !== null ? `${countdownSeconds}s` : '—'}</strong>
              </div>
            </div>

            {agent.currentMaskedCpf ? (
              <p>
                CPF em processamento:
                <span className="path-value">{agent.currentMaskedCpf}</span>
              </p>
            ) : null}

            <div className="button-row agent-controls">
              <button
                className="button primary"
                type="button"
                disabled={operationBusy || !canStartAgent}
                onClick={() =>
                  void executeAgentAction(
                    'agent-start',
                    window.agent.control.start,
                    'Agente iniciado.'
                  )
                }
              >
                Iniciar agente
              </button>

              <button
                className="button secondary"
                type="button"
                disabled={operationBusy || !canPauseAgent}
                onClick={() =>
                  void executeAgentAction(
                    'agent-pause',
                    window.agent.control.pause,
                    'Pausa segura solicitada.'
                  )
                }
              >
                Pausar
              </button>

              <button
                className="button secondary"
                type="button"
                disabled={operationBusy || !canResumeAgent}
                onClick={() =>
                  void executeAgentAction(
                    'agent-resume',
                    window.agent.control.resume,
                    'Execução retomada.'
                  )
                }
              >
                Continuar
              </button>

              <button
                className="button danger"
                type="button"
                disabled={operationBusy || !canStopAgent}
                onClick={() =>
                  void executeAgentAction(
                    'agent-stop',
                    window.agent.control.stop,
                    'Agente parado com segurança.'
                  )
                }
              >
                Parar
              </button>

              {waitingLogin ? (
                <button
                  className="button primary"
                  type="button"
                  disabled={operationBusy}
                  onClick={() =>
                    void executeAgentAction(
                      'login-completed',
                      window.agent.control.loginCompleted,
                      'Login validado e execução retomada.'
                    )
                  }
                >
                  Login concluído — continuar
                </button>
              ) : null}
            </div>
          </article>
        </section>

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

        {agent.lastError ? (
          <section className="activity-panel" role="alert">
            <div className="section-heading">
              <div>
                <span className="panel-label">Erro E1</span>

                <h2>{formatState(agent.lastError.stage)}</h2>
              </div>

              <span>{new Date(agent.lastError.occurredAt).toLocaleString('pt-BR')}</span>
            </div>

            <p>{agent.lastError.message}</p>
          </section>
        ) : null}

        <section className="activity-panel">
          <div className="section-heading">
            <div>
              <span className="panel-label">Atividade</span>

              <h2>Log operacional</h2>
            </div>

            <span>{logs.length} eventos recentes</span>
          </div>

          <div className="log-list" aria-live="polite">
            {logs.length === 0 ? (
              <p className="empty-state">Nenhum evento registrado.</p>
            ) : (
              logs.map((entry) => (
                <div className={`log-entry ${entry.type}`} key={entry.id}>
                  <time>{entry.timestamp}</time>

                  <span>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
        <ResearchHistoryPanel />
      </main>
    </div>
  )
}
