import type { BrowserContext, Page } from 'playwright'
import type {
  ContinuousResearchRunnerInput,
  ContinuousResearchRunnerState,
  ContinuousResearchRunResult
} from '../flow/continuous-research-runner'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '../flow/continuous-research-stage'
import type { SingleResearchCycleResult } from '../flow/single-research-cycle'
import { SafeResearchLogger } from '../logging/safe-research-logger'
import type { BrowserManagerSnapshot } from '../../shared/types/browser-api'
import type { AgentPublicState } from '../../shared/types/agent-runtime-api'
import type { ResearchHistoryRecord } from '../../shared/types/history-api'
import type { PlatformSessionsSnapshot } from '../../shared/types/session-api'
import { AgentPublicStateStore } from './agent-public-state-store'

const CPI_HOSTNAME = 'adm.cpicentral.com.br'

const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'

const DESKDATA_HOSTNAME = 'app.deskdata.com.br'

type RequestedExit = 'NONE' | 'PAUSE' | 'STOP'

export interface AgentRuntimeBrowser {
  ensureStarted(): Promise<BrowserManagerSnapshot>
  getSnapshot(): BrowserManagerSnapshot
  getContext(): BrowserContext
}

export interface AgentRuntimeSessions {
  getSnapshot(): Promise<PlatformSessionsSnapshot>
}

export interface AgentRuntimeFilter {
  applyCriminalForumFilter(page: Page): Promise<void>
}

export interface AgentRuntimeRunner {
  run(input: ContinuousResearchRunnerInput): Promise<ContinuousResearchRunResult>
}

export interface AgentRuntimeHistory {
  beginCycle(startedAt?: Date): ResearchHistoryRecord

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord

  completeCycle(
    id: string,
    result: SingleResearchCycleResult,
    finishedAt?: Date
  ): ResearchHistoryRecord

  failCycle(id: string, stage: string, error: unknown, finishedAt?: Date): ResearchHistoryRecord
}

export interface AgentRuntimeClock {
  now(): Date
}

export interface ContinuousAgentRuntimeDependencies {
  stateStore: AgentPublicStateStore
  browser: AgentRuntimeBrowser
  sessions: AgentRuntimeSessions
  filter: AgentRuntimeFilter
  runner: AgentRuntimeRunner
  history: AgentRuntimeHistory
  clock?: AgentRuntimeClock
  logger?: SafeResearchLogger
}

const systemClock: AgentRuntimeClock = {
  now: () => new Date()
}

export class ContinuousAgentRuntimeService {
  private readonly stateStore: AgentPublicStateStore

  private readonly browser: AgentRuntimeBrowser

  private readonly sessions: AgentRuntimeSessions

  private readonly filter: AgentRuntimeFilter

  private readonly runner: AgentRuntimeRunner

  private readonly history: AgentRuntimeHistory

  private readonly clock: AgentRuntimeClock

  private readonly logger: SafeResearchLogger

  private requestedExit: RequestedExit = 'NONE'

  private runnerPromise: Promise<void> | null = null

  private abortController: AbortController | null = null

  private cycleActive = false

  private currentHistoryId: string | null = null

  constructor(dependencies: ContinuousAgentRuntimeDependencies) {
    this.stateStore = dependencies.stateStore
    this.browser = dependencies.browser
    this.sessions = dependencies.sessions
    this.filter = dependencies.filter
    this.runner = dependencies.runner
    this.history = dependencies.history
    this.clock = dependencies.clock ?? systemClock
    this.logger = dependencies.logger ?? new SafeResearchLogger(() => undefined)
  }

  getSnapshot(): AgentPublicState {
    return this.stateStore.getSnapshot()
  }

  subscribe(listener: (state: AgentPublicState) => void): () => void {
    return this.stateStore.subscribe(listener)
  }

  async start(): Promise<AgentPublicState> {
    const status = this.stateStore.getStatus()

    if (status !== 'PARADO' && status !== 'ERRO_E1') {
      throw new Error('O agente já está em execução')
    }

    this.requestedExit = 'NONE'
    this.stateStore.resetForStart()

    try {
      await this.browser.ensureStarted()

      const sessions = await this.sessions.getSnapshot()

      if (!sessions.allAuthenticated) {
        return this.stateStore.patch({
          status: 'AGUARDANDO_LOGIN',
          currentStage: null,
          queueStatus: 'DESCONHECIDA',
          nextCheckAt: null,
          remainingSeconds: null
        })
      }

      await this.startRunner()

      return this.getSnapshot()
    } catch (error: unknown) {
      this.handleOperationalError(error)

      return this.getSnapshot()
    }
  }

  async loginCompleted(): Promise<AgentPublicState> {
    if (this.stateStore.getStatus() !== 'AGUARDANDO_LOGIN') {
      throw new Error('O agente não está aguardando confirmação de login')
    }

    const sessions = await this.sessions.getSnapshot()

    if (!sessions.allAuthenticated) {
      throw new Error('CPI Central e DeskData ainda não estão autenticadas')
    }

    this.requestedExit = 'NONE'

    try {
      await this.startRunner()
    } catch (error: unknown) {
      this.handleOperationalError(error)
    }

    return this.getSnapshot()
  }

  async pause(): Promise<AgentPublicState> {
    return this.requestExit('PAUSE')
  }

  async stop(): Promise<AgentPublicState> {
    return this.requestExit('STOP')
  }

  async resume(): Promise<AgentPublicState> {
    if (this.stateStore.getStatus() !== 'PAUSADO') {
      throw new Error('O agente não está pausado')
    }

    this.requestedExit = 'NONE'

    const sessions = await this.sessions.getSnapshot()

    if (!sessions.allAuthenticated) {
      return this.stateStore.patch({
        status: 'AGUARDANDO_LOGIN',
        currentStage: null,
        queueStatus: 'DESCONHECIDA',
        nextCheckAt: null,
        remainingSeconds: null
      })
    }

    try {
      await this.startRunner()
    } catch (error: unknown) {
      this.handleOperationalError(error)
    }

    return this.getSnapshot()
  }

  async shutdown(): Promise<void> {
    if (this.stateStore.getStatus() === 'PARADO') {
      return
    }

    await this.requestExit('STOP')
  }

  private async startRunner(): Promise<void> {
    if (this.runnerPromise) {
      throw new Error('O runner contínuo já está em execução')
    }

    const context = this.browser.getContext()

    const cpiPage = this.findPage(context, CPI_HOSTNAME, CPI_QUEUE_PATH)

    const deskDataPage = this.findPage(context, DESKDATA_HOSTNAME)

    await this.filter.applyCriminalForumFilter(cpiPage)

    const abortController = new AbortController()

    this.abortController = abortController

    this.stateStore.patch({
      status: 'OCIOSO',
      currentStage: 'WAITING_QUEUE',
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })

    const execution = this.runner.run({
      context,
      cpiPage,
      deskDataPage,
      signal: abortController.signal,

      shouldStopBeforeNextCycle: () =>
        this.requestedExit !== 'NONE' || this.stateStore.getStatus() === 'ERRO_E1',

      onState: (state) => {
        this.handleRunnerState(state)
      },

      onCycleStage: (_cycle, stage) => {
        this.stateStore.patch({
          status: 'EXECUTANDO',
          currentStage: stage
        })
      },

      onCycleIdentity: (_cycle, maskedCpf) => {
        this.stateStore.patch({
          currentMaskedCpf: maskedCpf
        })

        if (this.currentHistoryId) {
          this.history.setMaskedCpf(this.currentHistoryId, maskedCpf)
        }
      }
    })

    const managedExecution = execution
      .then(() => {
        this.finishRequestedExit()
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted && this.requestedExit !== 'NONE') {
          this.finishRequestedExit()

          return
        }

        this.handleOperationalError(error)
      })
      .finally(() => {
        if (this.abortController === abortController) {
          this.abortController = null
        }

        if (this.runnerPromise === managedExecution) {
          this.runnerPromise = null
        }
      })

    this.runnerPromise = managedExecution
  }

  private async requestExit(
    requestedExit: Exclude<RequestedExit, 'NONE'>
  ): Promise<AgentPublicState> {
    const currentStatus = this.stateStore.getStatus()

    if (requestedExit === 'PAUSE' && currentStatus === 'PAUSADO') {
      return this.getSnapshot()
    }

    if (requestedExit === 'STOP' && currentStatus === 'PARADO') {
      return this.getSnapshot()
    }

    this.requestedExit = requestedExit

    this.stateStore.patch({
      status: requestedExit === 'PAUSE' ? 'PAUSANDO' : 'PARANDO',
      nextCheckAt: null,
      remainingSeconds: null
    })

    if (!this.runnerPromise) {
      this.finishRequestedExit()

      return this.getSnapshot()
    }

    if (!this.cycleActive) {
      this.abortController?.abort()
    }

    await this.runnerPromise

    return this.getSnapshot()
  }

  private handleRunnerState(state: ContinuousResearchRunnerState): void {
    switch (state.type) {
      case 'WAITING_QUEUE':
        this.stateStore.patch({
          status: 'OCIOSO',
          currentStage: 'WAITING_QUEUE',
          queueStatus: 'DESCONHECIDA',
          nextCheckAt: null,
          remainingSeconds: null
        })
        return

      case 'IDLE': {
        const nextCheckAt = new Date(this.clock.now().getTime() + state.nextCheckInMs).toISOString()

        this.stateStore.patch({
          status: 'OCIOSO',
          currentStage: 'WAITING_QUEUE',
          queueStatus: 'VAZIA',
          nextCheckAt,
          remainingSeconds: Math.ceil(state.nextCheckInMs / 1000)
        })
        return
      }

      case 'RESEARCH_AVAILABLE': {
        this.cycleActive = true

        const historyRecord = this.history.beginCycle(this.clock.now())

        this.currentHistoryId = historyRecord.id

        this.stateStore.patch({
          status: 'EXECUTANDO',
          currentStage: 'OPENING_CPI_RESEARCH',
          queueStatus: 'COM_PESQUISA',
          nextCheckAt: null,
          remainingSeconds: null,
          currentMaskedCpf: null
        })
        return
      }

      case 'CYCLE_COMPLETED':
        this.completeCurrentCycle(state.cycle, state.result)
        return

      case 'STOPPED':
        return
    }
  }

  private completeCurrentCycle(cycle: number, result: SingleResearchCycleResult): void {
    if (!this.currentHistoryId) {
      throw new Error('O ciclo concluído não possui histórico ativo')
    }

    this.history.completeCycle(this.currentHistoryId, result, this.clock.now())

    this.currentHistoryId = null
    this.cycleActive = false

    this.stateStore.patch({
      completedCycles: cycle,
      currentStage: null,
      currentMaskedCpf: null
    })
  }

  private finishRequestedExit(): void {
    const requestedExit = this.requestedExit

    const status = requestedExit === 'PAUSE' ? 'PAUSADO' : 'PARADO'

    this.requestedExit = 'NONE'
    this.cycleActive = false
    this.currentHistoryId = null

    this.stateStore.patch({
      status,
      currentStage: null,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null
    })
  }

  private handleOperationalError(error: unknown): void {
    const stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER' =
      error instanceof ContinuousResearchStageError ? error.stage : 'CONTINUOUS_RUNNER'

    if (this.currentHistoryId) {
      this.history.failCycle(this.currentHistoryId, stage, error, this.clock.now())
    }

    this.currentHistoryId = null
    this.cycleActive = false
    this.requestedExit = 'STOP'

    const message = this.logger.sanitizeMessage(
      error instanceof Error ? error.message : String(error)
    )

    this.stateStore.patch({
      status: 'ERRO_E1',
      currentStage: stage === 'CONTINUOUS_RUNNER' ? null : stage,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: {
        stage,
        message,
        occurredAt: this.clock.now().toISOString()
      }
    })
  }

  private findPage(context: BrowserContext, hostname: string, expectedPath?: string): Page {
    const page = context.pages().find((candidate) => {
      try {
        const url = new URL(candidate.url())

        if (url.hostname !== hostname) {
          return false
        }

        if (!expectedPath) {
          return true
        }

        return url.pathname.toLowerCase() === expectedPath
      } catch {
        return false
      }
    })

    if (!page) {
      throw new Error(`A página autenticada de ${hostname} não foi localizada`)
    }

    return page
  }
}
