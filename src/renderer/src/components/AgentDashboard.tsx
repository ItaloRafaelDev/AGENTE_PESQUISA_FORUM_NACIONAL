import { useEffect, useState } from 'react'
import type { AgentControlSnapshot } from '../../../shared/types/agent-control-api'
import type { BrowserManagerSnapshot } from '../../../shared/types/browser-api'
import type {
  PlatformSessionsSnapshot,
  PlatformSessionState
} from '../../../shared/types/session-api'

type ActionName =
  'browser-start' | 'browser-stop' | 'agent-start' | 'agent-pause' | 'agent-resume' | 'agent-stop'

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

const initialAgentSnapshot: AgentControlSnapshot = {
  state: 'PARADO',
  pauseRequested: false,
  consecutiveErrors: 0,
  circuitOpen: false,
  safeMode: true
}

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

  const [agent, setAgent] = useState(initialAgentSnapshot)

  const [sessions, setSessions] = useState(initialSessionsSnapshot)

  const [busyAction, setBusyAction] = useState<ActionName | null>(null)

  const [logs, setLogs] = useState<LogEntry[]>([])

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

  useEffect(() => {
    let mounted = true

    async function loadInitialState(): Promise<void> {
      try {
        const [browserSnapshot, agentSnapshot, sessionSnapshot] = await Promise.all([
          window.agent.browser.getStatus(),
          window.agent.control.getStatus(),
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

    const operationalInterval = window.setInterval(() => {
      void Promise.all([window.agent.control.getStatus(), window.agent.sessions.getStatus()])
        .then(([agentSnapshot, sessionSnapshot]) => {
          if (!mounted) {
            return
          }

          setAgent(agentSnapshot)
          setSessions(sessionSnapshot)
        })
        .catch(() => undefined)
    }, 3_000)

    return () => {
      mounted = false

      window.clearInterval(operationalInterval)
    }
  }, [])

  async function executeAction<T>(
    actionName: ActionName,
    action: () => Promise<T>,
    applyResult: (result: T) => void,
    successMessage: string
  ): Promise<void> {
    setBusyAction(actionName)

    try {
      const result = await action()

      applyResult(result)
      addLog(successMessage, 'success')
    } catch (error: unknown) {
      addLog(error instanceof Error ? error.message : 'Falha inesperada.', 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const browserRunning = browser.state === 'RUNNING'

  const agentStopped = agent.state === 'PARADO'

  const agentPaused = agent.state === 'PAUSADO'

  const operationBusy = busyAction !== null

  const canStartAgent = browserRunning && agentStopped && sessions.allAuthenticated

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
          active={agent.safeMode}
          label={agent.safeMode ? 'Modo seguro ativo' : 'Modo seguro inativo'}
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
                disabled={operationBusy || browser.state !== 'STOPPED'}
                onClick={() =>
                  executeAction(
                    'browser-start',
                    window.agent.browser.start,
                    setBrowser,
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
                  executeAction(
                    'browser-stop',
                    window.agent.browser.stop,
                    setBrowser,
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

                <strong data-testid="agent-state">{formatState(agent.state)}</strong>
              </div>

              <StatusIndicator
                active={!agentStopped}
                label={agentStopped ? 'Parado' : 'Em operação'}
              />
            </div>

            <div className="metrics">
              <div>
                <span>Erros consecutivos</span>
                <strong>{agent.consecutiveErrors}</strong>
              </div>

              <div>
                <span>Circuit breaker</span>
                <strong>{agent.circuitOpen ? 'ABERTO' : 'FECHADO'}</strong>
              </div>
            </div>

            <div className="button-row agent-controls">
              <button
                className="button primary"
                type="button"
                disabled={operationBusy || !canStartAgent}
                title={
                  canStartAgent
                    ? 'Iniciar agente'
                    : 'Autentique a CPI Central e a DeskData antes de iniciar'
                }
                onClick={() =>
                  executeAction(
                    'agent-start',
                    window.agent.control.start,
                    setAgent,
                    'Agente iniciado.'
                  )
                }
              >
                Iniciar agente
              </button>

              <button
                className="button secondary"
                type="button"
                disabled={operationBusy || agentStopped || agentPaused}
                onClick={() =>
                  executeAction(
                    'agent-pause',
                    window.agent.control.pause,
                    setAgent,
                    'Pausa segura aplicada.'
                  )
                }
              >
                Pausar
              </button>

              <button
                className="button secondary"
                type="button"
                disabled={operationBusy || !agentPaused}
                onClick={() =>
                  executeAction(
                    'agent-resume',
                    window.agent.control.resume,
                    setAgent,
                    'Execução retomada.'
                  )
                }
              >
                Continuar
              </button>

              <button
                className="button danger"
                type="button"
                disabled={operationBusy || agentStopped}
                onClick={() =>
                  executeAction(
                    'agent-stop',
                    window.agent.control.stop,
                    setAgent,
                    'Agente encerrado com segurança.'
                  )
                }
              >
                Parar com segurança
              </button>
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
      </main>
    </div>
  )
}
