import type {
  AgentHistoryPort,
  AgentWorkspacePort,
  ContinuousAgentCoordinatorDependencies
} from '../ports/agent-runtime-ports'
import type { ApplicationClock } from '../ports/application-clock-port'
import type { SafeMessageSanitizer } from '../ports/safe-message-sanitizer-port'
import type { ContinuousResearchState } from '../research/run-continuous-research'
import type { ResearchCycleResult } from '../research/research-cycle-model'
import { ApplicationError } from '../errors/application-error'
import { AgentStateMachine, type AgentProgressPatch, type AgentState } from './agent-state-machine'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from './continuous-research-stage'
import { ExecutionControl } from './execution-control'

interface StartupConfirmation {
  readonly promise: Promise<void>
  resolve(): void
  rejectAfterOperation(error: Error): void
  finish(): void
}

function createStartupConfirmation(): StartupConfirmation {
  let settled = false
  let terminalError: Error | null = null
  let resolvePromise!: () => void
  let rejectPromise!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve() {
      if (!settled) {
        settled = true
        resolvePromise()
      }
    },
    rejectAfterOperation(error) {
      terminalError = error
    },
    finish() {
      if (settled) {
        return
      }

      settled = true

      if (terminalError) {
        rejectPromise(terminalError)
      } else {
        resolvePromise()
      }
    }
  }
}

export class ContinuousAgentCoordinator {
  private readonly state: AgentStateMachine
  private readonly workspace: AgentWorkspacePort
  private readonly history: AgentHistoryPort
  private readonly clock: ApplicationClock
  private readonly sanitizer: SafeMessageSanitizer

  private executionControl: ExecutionControl | null = null
  private activeOperationPromise: Promise<void> | null = null
  private currentHistoryId: string | null = null

  constructor(dependencies: ContinuousAgentCoordinatorDependencies) {
    this.state = dependencies.state
    this.workspace = dependencies.workspace
    this.history = dependencies.history
    this.clock = dependencies.clock
    this.sanitizer = dependencies.sanitizer
  }

  getSnapshot(): AgentState {
    return this.state.getSnapshot()
  }

  subscribe(listener: (state: AgentState) => void): () => void {
    return this.state.subscribe(listener)
  }

  async start(): Promise<AgentState> {
    const lifecycle = this.getSnapshot().lifecycle

    if (lifecycle !== 'STOPPED' && lifecycle !== 'FAILED') {
      this.state.beginStart()
    }

    await this.beginOperation({ ensureStarted: true, unauthenticated: 'WAIT' }, () =>
      this.state.beginStart()
    )
    return this.getSnapshot()
  }

  async loginCompleted(): Promise<AgentState> {
    if (this.getSnapshot().lifecycle !== 'WAITING_LOGIN') {
      throw new Error('O agente não está aguardando confirmação de login')
    }

    await this.beginOperation({ ensureStarted: false, unauthenticated: 'REJECT' })
    return this.getSnapshot()
  }

  async pause(): Promise<AgentState> {
    return this.requestExit('PAUSE')
  }

  async resume(): Promise<AgentState> {
    if (this.getSnapshot().lifecycle !== 'PAUSED') {
      this.state.resume()
    }

    await this.beginOperation({ ensureStarted: false, unauthenticated: 'WAIT' }, () =>
      this.state.resume()
    )
    return this.getSnapshot()
  }

  async stop(): Promise<AgentState> {
    return this.requestExit('STOP')
  }

  async shutdown(): Promise<void> {
    if (this.getSnapshot().lifecycle === 'STOPPED') {
      return
    }

    await this.stop()
  }

  private beginOperation(
    options: {
      ensureStarted: boolean
      unauthenticated: 'WAIT' | 'REJECT'
    },
    lifecycleTransition?: () => void
  ): Promise<void> {
    const control = this.reserveExecution()
    const startup = createStartupConfirmation()
    let activated = lifecycleTransition === undefined
    const operation = Promise.resolve().then(() =>
      activated ? this.runOperation(control, startup, options) : undefined
    )
    const managedOperation = operation.finally(() => {
      if (this.activeOperationPromise === managedOperation) {
        this.activeOperationPromise = null
      }

      this.releaseExecution(control)
      startup.finish()
    })

    this.activeOperationPromise = managedOperation

    if (lifecycleTransition) {
      try {
        lifecycleTransition()
        activated = true
      } catch (error: unknown) {
        if (this.activeOperationPromise === managedOperation) {
          this.activeOperationPromise = null
        }

        this.releaseExecution(control)
        startup.resolve()
        throw error
      }
    }

    return startup.promise
  }

  private reserveExecution(): ExecutionControl {
    if (this.executionControl || this.activeOperationPromise) {
      throw new Error('O runner contínuo já está em execução')
    }

    const control = new ExecutionControl()
    this.executionControl = control
    return control
  }

  private async runOperation(
    control: ExecutionControl,
    startup: StartupConfirmation,
    options: { ensureStarted: boolean; unauthenticated: 'WAIT' | 'REJECT' }
  ): Promise<void> {
    try {
      if (this.finishStartupExit(control)) {
        return
      }

      if (options.ensureStarted) {
        await this.workspace.ensureStarted()

        if (this.finishStartupExit(control)) {
          return
        }
      }

      const authenticated = await this.workspace.areSessionsAuthenticated()

      if (this.finishStartupExit(control)) {
        return
      }

      if (!authenticated) {
        if (options.unauthenticated === 'REJECT') {
          startup.rejectAfterOperation(
            new Error('CPI Central e DeskData ainda não estão autenticadas')
          )
        } else {
          this.state.waitForLogin()
        }

        return
      }

      const execution = await this.workspace.prepareContinuousExecution()

      if (this.finishStartupExit(control)) {
        return
      }

      this.state.beginRun({
        currentStage: 'WAITING_QUEUE',
        queue: 'UNKNOWN',
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: null
      })

      if (this.finishStartupExit(control)) {
        return
      }

      const executionPromise = execution.execute({
        token: control.token,
        onState: (runnerState) => this.handleRunnerState(runnerState),
        onCycleStage: (_cycle, stage) => {
          this.state.updateProgress({ currentStage: stage })
        },
        onCycleIdentity: (_cycle, maskedCpf) => this.handleCycleIdentity(maskedCpf)
      })

      startup.resolve()
      await executionPromise
      this.finishExecution()
    } catch (error: unknown) {
      this.handleOperationalError(error)
    }
  }

  private finishStartupExit(control: ExecutionControl): boolean {
    if (control.token.directive === 'NONE') {
      return false
    }

    this.finishExecution()
    return true
  }

  private async requestExit(directive: 'PAUSE' | 'STOP'): Promise<AgentState> {
    const lifecycle = this.getSnapshot().lifecycle

    if (directive === 'PAUSE' && lifecycle === 'PAUSED') {
      return this.getSnapshot()
    }

    if (directive === 'STOP' && lifecycle === 'STOPPED') {
      return this.getSnapshot()
    }

    const progress = {
      nextCheckAt: null,
      remainingSeconds: null
    }

    if (directive === 'PAUSE') {
      this.state.requestPause(progress)
      this.executionControl?.requestPause()
    } else {
      this.state.requestStop(progress)
      this.executionControl?.requestStop()
    }

    const activeOperation = this.activeOperationPromise

    if (!activeOperation) {
      this.finishExecution()
      return this.getSnapshot()
    }

    await activeOperation
    return this.getSnapshot()
  }

  private handleRunnerState(runnerState: ContinuousResearchState): void {
    switch (runnerState.type) {
      case 'WAITING_QUEUE':
        this.state.markIdle({
          currentStage: 'WAITING_QUEUE',
          queue: 'UNKNOWN',
          nextCheckAt: null,
          remainingSeconds: null
        })
        return

      case 'IDLE':
        this.state.markIdle({
          currentStage: 'WAITING_QUEUE',
          queue: 'EMPTY',
          nextCheckAt: new Date(
            this.clock.now().getTime() + runnerState.nextCheckInMs
          ).toISOString(),
          remainingSeconds: Math.ceil(runnerState.nextCheckInMs / 1000)
        })
        return

      case 'RESEARCH_AVAILABLE': {
        const historyId = this.history.beginCycle().id
        this.currentHistoryId = historyId
        this.state.markRunning({
          currentStage: 'OPENING_CPI_RESEARCH',
          queue: 'AVAILABLE',
          nextCheckAt: null,
          remainingSeconds: null,
          currentMaskedCpf: null
        })
        return
      }

      case 'CYCLE_COMPLETED':
        this.completeCurrentCycle(runnerState.cycle, runnerState.result)
        return

      case 'STOPPED':
        return
    }
  }

  private handleCycleIdentity(maskedCpf: string): void {
    this.state.updateProgress({ currentMaskedCpf: maskedCpf })

    if (this.currentHistoryId) {
      this.history.setMaskedCpf(this.currentHistoryId, maskedCpf)
    }
  }

  private completeCurrentCycle(cycle: number, result: ResearchCycleResult): void {
    const historyId = this.requireCurrentHistoryId()

    try {
      this.history.completeCycle(historyId, result)
    } finally {
      if (this.currentHistoryId === historyId) {
        this.currentHistoryId = null
      }
    }

    this.state.updateProgress({
      completedCycles: cycle,
      currentStage: null,
      currentMaskedCpf: null
    })
  }

  private requireCurrentHistoryId(): string {
    if (!this.currentHistoryId) {
      throw new Error('O ciclo concluído não possui histórico ativo')
    }

    return this.currentHistoryId
  }

  private finishExecution(): void {
    const lifecycle = this.getSnapshot().lifecycle

    if (lifecycle === 'FAILED') {
      return
    }

    this.currentHistoryId = null

    if (lifecycle === 'PAUSE_REQUESTED') {
      this.state.markPaused(this.createTerminalProgress())
    } else {
      if (lifecycle !== 'STOP_REQUESTED') {
        this.state.requestStop(this.createTerminalProgress())
      }
      this.state.markStopped(this.createTerminalProgress())
    }
  }

  private handleOperationalError(error: unknown): void {
    const stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER' =
      error instanceof ApplicationError && error.stage
        ? error.stage
        : error instanceof ContinuousResearchStageError
          ? error.stage
          : 'CONTINUOUS_RUNNER'
    const message = this.sanitizer.sanitize(this.getPublicErrorMessage(error))
    const historyId = this.currentHistoryId

    this.currentHistoryId = null

    if (historyId) {
      try {
        this.history.failCycle(historyId, stage, new Error(message))
      } catch {
        // The primary operation failure must still reach the public terminal state.
      }
    }

    this.executionControl?.requestStop()
    this.state.markFailed(
      {
        stage,
        message,
        occurredAt: this.clock.now().toISOString()
      },
      this.createTerminalProgress(stage === 'CONTINUOUS_RUNNER' ? null : stage)
    )
  }

  private createTerminalProgress(
    currentStage: ContinuousResearchStage | null = null
  ): AgentProgressPatch {
    return {
      currentStage,
      queue: 'UNKNOWN' as const,
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null
    }
  }

  private getPublicErrorMessage(error: unknown): string {
    if (error instanceof ApplicationError) {
      return error.message
    }

    return error instanceof Error ? error.message : String(error)
  }

  private releaseExecution(control: ExecutionControl): void {
    if (this.executionControl === control) {
      this.executionControl = null
    }
  }
}
