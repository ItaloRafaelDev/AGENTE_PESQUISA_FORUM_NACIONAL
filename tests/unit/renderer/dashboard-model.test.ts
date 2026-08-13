import { describe, expect, it } from 'vitest'
import type { AgentPublicStatus } from '@/shared/types/agent-runtime-api'
import {
  formatDashboardState,
  formatLogTime,
  formatSessionState,
  getDashboardControlState,
  INITIAL_AGENT_SNAPSHOT,
  INITIAL_BROWSER_SNAPSHOT,
  INITIAL_SESSIONS_SNAPSHOT,
  type DashboardActionName
} from '@/renderer/src/features/dashboard/dashboard-model'

describe('dashboard model', () => {
  it('preserves the initial dashboard snapshots', () => {
    expect(INITIAL_BROWSER_SNAPSHOT).toEqual({
      state: 'STOPPED',
      profilePath: '',
      startedAt: null
    })
    expect(INITIAL_AGENT_SNAPSHOT).toEqual({
      status: 'PARADO',
      currentStage: null,
      completedCycles: 0,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
    expect(INITIAL_SESSIONS_SNAPSHOT).toEqual({
      cpi: { state: 'INDETERMINATE', url: null },
      deskData: { state: 'INDETERMINATE', url: null },
      allAuthenticated: false,
      checkedAt: null
    })
  })

  it('deep-freezes every dashboard snapshot level', () => {
    expect(Object.isFrozen(INITIAL_BROWSER_SNAPSHOT)).toBe(true)
    expect(Object.isFrozen(INITIAL_AGENT_SNAPSHOT)).toBe(true)
    expect(Object.isFrozen(INITIAL_SESSIONS_SNAPSHOT)).toBe(true)
    expect(Object.isFrozen(INITIAL_SESSIONS_SNAPSHOT.cpi)).toBe(true)
    expect(Object.isFrozen(INITIAL_SESSIONS_SNAPSHOT.deskData)).toBe(true)
  })

  it('rejects snapshot mutation without leaking it to later dashboard mounts', () => {
    expect(Reflect.set(INITIAL_BROWSER_SNAPSHOT, 'profilePath', 'mutated-profile')).toBe(false)
    expect(Reflect.set(INITIAL_AGENT_SNAPSHOT, 'status', 'ERRO_E1')).toBe(false)
    expect(Reflect.set(INITIAL_SESSIONS_SNAPSHOT.cpi, 'state', 'AUTHENTICATED')).toBe(false)
    expect(Reflect.set(INITIAL_SESSIONS_SNAPSHOT.deskData, 'url', 'https://mutated.invalid')).toBe(
      false
    )

    expect(INITIAL_BROWSER_SNAPSHOT.profilePath).toBe('')
    expect(INITIAL_AGENT_SNAPSHOT.status).toBe('PARADO')
    expect(INITIAL_SESSIONS_SNAPSHOT.cpi.state).toBe('INDETERMINATE')
    expect(INITIAL_SESSIONS_SNAPSHOT.deskData.url).toBeNull()
  })

  it.each([
    ['STOPPED', 'STOPPED'],
    ['STARTING', 'STARTING'],
    ['RUNNING', 'RUNNING'],
    ['STOPPING', 'STOPPING'],
    ['PARADO', 'PARADO'],
    ['INICIANDO', 'INICIANDO'],
    ['AGUARDANDO_LOGIN', 'AGUARDANDO LOGIN'],
    ['EXECUTANDO', 'EXECUTANDO'],
    ['PAUSANDO', 'PAUSANDO'],
    ['PAUSADO', 'PAUSADO'],
    ['PARANDO', 'PARANDO'],
    ['OCIOSO', 'OCIOSO'],
    ['ERRO_E1', 'ERRO E1'],
    ['DESCONHECIDA', 'DESCONHECIDA'],
    ['COM_PESQUISA', 'COM PESQUISA'],
    ['VAZIA', 'VAZIA'],
    ['WAITING_QUEUE', 'WAITING QUEUE'],
    ['OPENING_CPI_RESEARCH', 'OPENING CPI RESEARCH'],
    ['READING_CPI_IDENTITY', 'READING CPI IDENTITY'],
    ['PREPARING_DESKDATA', 'PREPARING DESKDATA'],
    ['SUBMITTING_DESKDATA', 'SUBMITTING DESKDATA'],
    ['WAITING_DESKDATA_RESULT', 'WAITING DESKDATA RESULT'],
    ['CLASSIFYING_RESULT', 'CLASSIFYING RESULT'],
    ['DOWNLOADING_PDF', 'DOWNLOADING PDF'],
    ['PREPARING_CPI_RESULT', 'PREPARING CPI RESULT'],
    ['ATTACHING_PDF', 'ATTACHING PDF'],
    ['SAVING_CPI', 'SAVING CPI'],
    ['PREPARING_NEXT_SEARCH', 'PREPARING NEXT SEARCH'],
    ['RETURNING_TO_QUEUE', 'RETURNING TO QUEUE'],
    ['CONTINUOUS_RUNNER', 'CONTINUOUS RUNNER']
  ])('formats dashboard state %s', (state, expected) => {
    expect(formatDashboardState(state)).toBe(expected)
  })

  it.each([
    ['AUTHENTICATED', 'Autenticado'],
    ['WAITING_LOGIN', 'Aguardando login'],
    ['INDETERMINATE', 'Indeterminado']
  ] as const)('formats session state %s', (state, expected) => {
    expect(formatSessionState(state)).toBe(expected)
  })

  it('formats operational log time in Brazilian locale', () => {
    expect(formatLogTime(new Date('2026-07-14T10:00:05'))).toMatch(/^10:00:05$/)
  })

  const actionNames: readonly (DashboardActionName | null)[] = [
    null,
    'browser-start',
    'browser-stop',
    'agent-start',
    'agent-pause',
    'agent-resume',
    'agent-stop',
    'login-completed'
  ]

  const expectedAvailableControls: Record<AgentPublicStatus, readonly string[]> = {
    PARADO: ['canStartAgent'],
    INICIANDO: ['canStopAgent'],
    AGUARDANDO_LOGIN: ['canStopAgent', 'waitingLogin'],
    EXECUTANDO: ['canPauseAgent', 'canStopAgent'],
    PAUSANDO: ['canStopAgent'],
    PAUSADO: ['canResumeAgent', 'canStopAgent'],
    PARANDO: [],
    OCIOSO: ['canPauseAgent', 'canStopAgent'],
    ERRO_E1: ['canStartAgent', 'canStopAgent']
  }

  const controlMatrix = (['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'] as const).flatMap(
    (browserState) =>
      (
        [
          'PARADO',
          'INICIANDO',
          'AGUARDANDO_LOGIN',
          'EXECUTANDO',
          'PAUSANDO',
          'PAUSADO',
          'PARANDO',
          'OCIOSO',
          'ERRO_E1'
        ] as const
      ).flatMap((agentStatus) =>
        actionNames.map((busyAction) => ({
          browserState,
          agentStatus,
          busyAction,
          browserRunning: browserState === 'RUNNING',
          operationBusy: busyAction !== null,
          enabled: expectedAvailableControls[agentStatus]
        }))
      )
  )

  it.each(controlMatrix)(
    'derives all controls for browser $browserState, agent $agentStatus and action $busyAction',
    ({ browserState, agentStatus, busyAction, browserRunning, operationBusy, enabled }) => {
      expect(getDashboardControlState(browserState, agentStatus, busyAction)).toEqual({
        browserRunning,
        operationBusy,
        canStartAgent: enabled.includes('canStartAgent'),
        canPauseAgent: enabled.includes('canPauseAgent'),
        canResumeAgent: enabled.includes('canResumeAgent'),
        canStopAgent: enabled.includes('canStopAgent'),
        waitingLogin: enabled.includes('waitingLogin')
      })
    }
  )
})
