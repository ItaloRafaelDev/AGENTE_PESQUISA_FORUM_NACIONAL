import { describe, expect, it, vi } from 'vitest'
import { AgentStateMachine } from '@/application/agent/agent-state-machine'
import { ContinuousResearchStageError } from '@/application/agent/continuous-research-stage'
import { ContinuousAgentCoordinator } from '@/application/agent/continuous-agent-coordinator'
import { ApplicationError } from '@/application/errors/application-error'
import { ContinuousAgentIpcAdapter } from '@/main/adapters/continuous-agent-ipc-adapter'
import type { AgentPublicState } from '@/shared/types/agent-runtime-api'
import type {
  AgentHistoryPort,
  AgentWorkspacePort,
  ContinuousResearchExecutionPort
} from '@/application/ports/agent-runtime-ports'
import type { ContinuousResearchInput } from '@/application/research/run-continuous-research'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'
import type { ResearchHistoryRecord } from '@/application/history/research-history-model'

const NOW = new Date('2026-07-14T10:00:00.000Z')

function createResult(): ResearchCycleResult {
  return {
    maskedCpf: '***.***.***-44',
    selectedDatasetCount: 6,
    classification: 'HA_INFORMACOES',
    pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
    pdfSizeBytes: 2048,
    saved: true,
    confirmationAccepted: true
  }
}

function createHistoryRecord(
  overrides: Partial<ResearchHistoryRecord> = {}
): ResearchHistoryRecord {
  return {
    id: overrides.id ?? 'history-1',
    maskedCpf: overrides.maskedCpf ?? '***.***.***-00',
    classification: overrides.classification ?? null,
    cpiResult: overrides.cpiResult ?? null,
    status: overrides.status ?? 'EM_ANDAMENTO',
    startedAt: overrides.startedAt ?? NOW.toISOString(),
    finishedAt: overrides.finishedAt ?? null,
    durationMs: overrides.durationMs ?? null,
    pdfPath: overrides.pdfPath ?? null,
    errorStage: overrides.errorStage ?? null,
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt ?? NOW.toISOString()
  }
}

class ControlledExecution implements ContinuousResearchExecutionPort {
  public calls = 0
  public input: ContinuousResearchInput | null = null
  public resolveOnDirective = false
  public onExecute: ((input: ContinuousResearchInput) => void) | null = null

  private resolveCurrent: (() => void) | null = null
  private rejectCurrent: ((error: unknown) => void) | null = null

  execute(
    input: ContinuousResearchInput
  ): Promise<{ status: 'STOPPED_BY_REQUEST'; completedCycles: number }> {
    this.calls += 1
    this.input = input

    return new Promise((resolve, reject) => {
      this.resolveCurrent = () => resolve({ status: 'STOPPED_BY_REQUEST', completedCycles: 0 })
      this.rejectCurrent = reject

      if (this.resolveOnDirective) {
        input.token.subscribe(() => {
          if (input.token.directive !== 'NONE') {
            this.resolveCurrent?.()
          }
        })
      }

      this.onExecute?.(input)
    })
  }

  emitState(state: Parameters<NonNullable<ContinuousResearchInput['onState']>>[0]): void {
    this.input?.onState?.(state)
  }

  emitStage(stage: Parameters<NonNullable<ContinuousResearchInput['onCycleStage']>>[1]): void {
    this.input?.onCycleStage?.(1, stage)
  }

  emitIdentity(maskedCpf: string): void {
    this.input?.onCycleIdentity?.(1, maskedCpf)
  }

  resolve(): void {
    this.resolveCurrent?.()
  }

  reject(error: unknown): void {
    this.rejectCurrent?.(error)
  }
}

class FakeWorkspace implements AgentWorkspacePort {
  public ensureStartedCalls = 0
  public authenticated = true
  public prepareCalls = 0
  public prepareGate: Promise<void> | null = null
  public ensureGate: Promise<void> | null = null
  public authenticationGate: Promise<boolean> | null = null
  public authenticationError: Error | null = null
  public readonly execution = new ControlledExecution()

  async ensureStarted(): Promise<void> {
    this.ensureStartedCalls += 1
    await this.ensureGate
  }

  async areSessionsAuthenticated(): Promise<boolean> {
    if (this.authenticationError) {
      throw this.authenticationError
    }

    if (this.authenticationGate) {
      return this.authenticationGate
    }

    return this.authenticated
  }

  async prepareContinuousExecution(): Promise<ContinuousResearchExecutionPort> {
    this.prepareCalls += 1
    await this.prepareGate
    return this.execution
  }
}

class FakeHistory implements AgentHistoryPort {
  public readonly calls: string[] = []
  public readonly completed: ResearchCycleResult[] = []
  public readonly failures: Array<{ id: string; stage: string; error: unknown }> = []

  beginCycle(): ResearchHistoryRecord {
    this.calls.push('begin:history-1')
    return createHistoryRecord()
  }

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord {
    this.calls.push(`identity:${id}:${maskedCpf}`)
    return createHistoryRecord({ id, maskedCpf })
  }

  completeCycle(id: string, result: ResearchCycleResult): ResearchHistoryRecord {
    this.calls.push(`complete:${id}`)
    this.completed.push(result)
    return createHistoryRecord({ id, status: 'CONCLUIDO' })
  }

  failCycle(id: string, stage: string, error: unknown): ResearchHistoryRecord {
    this.calls.push(`fail:${id}:${stage}`)
    this.failures.push({ id, stage, error })
    return createHistoryRecord({ id, status: 'ERRO_E1', errorStage: stage })
  }
}

function createCoordinator(): {
  coordinator: ContinuousAgentCoordinator
  workspace: FakeWorkspace
  history: FakeHistory
  sanitizer: ReturnType<typeof vi.fn>
} {
  const workspace = new FakeWorkspace()
  const history = new FakeHistory()
  const sanitizer = vi.fn((message: unknown) =>
    String(message).replace('000.111.222-33', '***.***.***-33')
  )

  return {
    coordinator: new ContinuousAgentCoordinator({
      state: new AgentStateMachine(),
      workspace,
      history,
      clock: { now: () => new Date(NOW) },
      sanitizer: { sanitize: sanitizer }
    }),
    workspace,
    history,
    sanitizer
  }
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })

  return { promise, resolve }
}

describe('ContinuousAgentCoordinator', () => {
  it('inicia parado sem preparar o workspace', () => {
    const { coordinator, workspace } = createCoordinator()

    expect(coordinator.getSnapshot().lifecycle).toBe('STOPPED')
    expect(workspace.ensureStartedCalls).toBe(0)
    expect(workspace.execution.calls).toBe(0)
  })

  it('inicia uma única execução e preserva o erro público de start ativo', async () => {
    const { coordinator, workspace } = createCoordinator()

    const snapshot = await coordinator.start()

    expect(snapshot).toEqual(
      expect.objectContaining({
        lifecycle: 'IDLE',
        currentStage: 'WAITING_QUEUE',
        queue: 'UNKNOWN',
        lastError: null
      })
    )
    expect(workspace.ensureStartedCalls).toBe(1)
    expect(workspace.prepareCalls).toBe(1)
    expect(workspace.execution.calls).toBe(1)
    await expect(coordinator.start()).rejects.toThrow('O agente já está em execução')
  })

  it('registra a operação antes do primeiro callback lifecycle de start', async () => {
    const { coordinator, workspace } = createCoordinator()
    let stopPromise: Promise<unknown> | null = null

    coordinator.subscribe((state) => {
      if (state.lifecycle === 'STARTING') {
        stopPromise = coordinator.stop()
      }
    })

    await expect(coordinator.start()).resolves.toEqual(
      expect.objectContaining({ lifecycle: 'STOPPED' })
    )
    await stopPromise

    expect(workspace.ensureStartedCalls).toBe(0)
    expect(workspace.prepareCalls).toBe(0)
    expect(workspace.execution.calls).toBe(0)
  })

  it('aguarda login sem falha e valida as confirmações de login', async () => {
    const { coordinator, workspace } = createCoordinator()
    await expect(coordinator.loginCompleted()).rejects.toThrow(
      'O agente não está aguardando confirmação de login'
    )

    workspace.authenticated = false
    const waiting = await coordinator.start()

    expect(waiting).toEqual(
      expect.objectContaining({
        lifecycle: 'WAITING_LOGIN',
        currentStage: null,
        queue: 'UNKNOWN',
        lastError: null
      })
    )
    expect(workspace.execution.calls).toBe(0)
    await expect(coordinator.loginCompleted()).rejects.toThrow(
      'CPI Central e DeskData ainda não estão autenticadas'
    )

    workspace.authenticated = true
    await expect(coordinator.loginCompleted()).resolves.toEqual(
      expect.objectContaining({ lifecycle: 'IDLE' })
    )
  })

  it('aceita resume somente de PAUSED e volta a aguardar login quando necessário', async () => {
    const { coordinator, workspace } = createCoordinator()
    await expect(coordinator.resume()).rejects.toThrow('O agente não está pausado')

    workspace.execution.resolveOnDirective = true
    await coordinator.start()
    await coordinator.pause()

    workspace.authenticated = false
    await expect(coordinator.resume()).resolves.toEqual(
      expect.objectContaining({ lifecycle: 'WAITING_LOGIN' })
    )
  })

  it('registra a operação antes do primeiro callback lifecycle de resume', async () => {
    const { coordinator, workspace } = createCoordinator()
    workspace.execution.resolveOnDirective = true
    await coordinator.start()
    await coordinator.pause()
    const prepareCallsBeforeResume = workspace.prepareCalls
    let stopPromise: Promise<unknown> | null = null

    coordinator.subscribe((state) => {
      if (state.lifecycle === 'STARTING') {
        stopPromise = coordinator.stop()
      }
    })

    await expect(coordinator.resume()).resolves.toEqual(
      expect.objectContaining({ lifecycle: 'STOPPED' })
    )
    await stopPromise

    expect(workspace.prepareCalls).toBe(prepareCallsBeforeResume)
    expect(workspace.execution.calls).toBe(1)
  })

  it.each(['loginCompleted', 'resume'] as const)(
    'sanitiza falha técnica de autenticação em %s e publica FAILED',
    async (command) => {
      const { coordinator, workspace, sanitizer } = createCoordinator()
      workspace.execution.resolveOnDirective = true

      if (command === 'loginCompleted') {
        workspace.authenticated = false
        await coordinator.start()
        workspace.authenticated = true
      } else {
        await coordinator.start()
        await coordinator.pause()
      }

      const error = new Error('Sessão falhou para CPF 000.111.222-33')
      workspace.authenticationError = error

      await expect(coordinator[command]()).resolves.toEqual(
        expect.objectContaining({
          lifecycle: 'FAILED',
          lastError: {
            stage: 'CONTINUOUS_RUNNER',
            message: 'Sessão falhou para CPF ***.***.***-33',
            occurredAt: NOW.toISOString()
          }
        })
      )
      expect(sanitizer).toHaveBeenCalledWith(error.message)
    }
  )

  it('projeta fila desconhecida e vazia com relógio determinístico', async () => {
    const { coordinator, workspace } = createCoordinator()
    await coordinator.start()

    workspace.execution.emitState({ type: 'WAITING_QUEUE', checks: 1 })
    expect(coordinator.getSnapshot()).toEqual(
      expect.objectContaining({
        lifecycle: 'IDLE',
        currentStage: 'WAITING_QUEUE',
        queue: 'UNKNOWN',
        nextCheckAt: null,
        remainingSeconds: null
      })
    )

    workspace.execution.emitState({ type: 'IDLE', nextCheckInMs: 60_001 })
    expect(coordinator.getSnapshot()).toEqual(
      expect.objectContaining({
        lifecycle: 'IDLE',
        queue: 'EMPTY',
        nextCheckAt: '2026-07-14T10:01:00.001Z',
        remainingSeconds: 61
      })
    )
  })

  it('abre um histórico, publica somente identidade mascarada e conclui o ciclo', async () => {
    const { coordinator, workspace, history } = createCoordinator()
    await coordinator.start()

    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 2 })
    workspace.execution.emitStage('PREPARING_DESKDATA')
    workspace.execution.emitIdentity('***.***.***-44')
    const result = createResult()
    workspace.execution.emitState({ type: 'CYCLE_COMPLETED', cycle: 1, result })

    expect(history.calls).toEqual([
      'begin:history-1',
      'identity:history-1:***.***.***-44',
      'complete:history-1'
    ])
    expect(history.completed).toEqual([result])
    expect(coordinator.getSnapshot()).toEqual(
      expect.objectContaining({
        lifecycle: 'RUNNING',
        completedCycles: 1,
        currentStage: null,
        currentMaskedCpf: null
      })
    )
  })

  it('publica no IPC somente fronteiras completas para start e início de ciclo', async () => {
    const { coordinator, workspace, history } = createCoordinator()
    const adapter = new ContinuousAgentIpcAdapter(coordinator)
    const events: AgentPublicState[] = []
    let historyBeganBeforeRunningObservation = false
    adapter.subscribe((state) => {
      events.push(state)

      if (state.status === 'EXECUTANDO') {
        historyBeganBeforeRunningObservation = history.calls.includes('begin:history-1')
      }
    })

    await adapter.start()
    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 2 })

    expect(events.filter((state) => state.status === 'OCIOSO')).toEqual([
      expect.objectContaining({
        currentStage: 'WAITING_QUEUE',
        queueStatus: 'DESCONHECIDA',
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: null
      })
    ])
    expect(events.filter((state) => state.status === 'EXECUTANDO')).toEqual([
      expect.objectContaining({
        currentStage: 'OPENING_CPI_RESEARCH',
        queueStatus: 'COM_PESQUISA',
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: null
      })
    ])
    expect(history.calls).toEqual(['begin:history-1'])
    expect(historyBeganBeforeRunningObservation).toBe(true)
  })

  it('preserva o erro primário e publica FAILED sanitizado quando history falha', async () => {
    const { coordinator, workspace, history, sanitizer } = createCoordinator()
    const adapter = new ContinuousAgentIpcAdapter(coordinator)
    const events: AgentPublicState[] = []
    adapter.subscribe((state) => events.push(state))
    const technicalCause = new Error('selector=#private cpf=00000000001 token=secret')
    const publicError = new ApplicationError({
      code: 'INTEGRATION',
      message: 'Não foi possível salvar o resultado na CPI.',
      stage: 'SAVING_CPI',
      cause: technicalCause
    })

    await coordinator.start()
    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 1 })
    history.failCycle = () => {
      throw new Error('falha secundária de histórico')
    }

    workspace.execution.reject(publicError)
    await flushPromises()

    expect(sanitizer).toHaveBeenCalledWith(publicError.message)
    expect(workspace.execution.input?.token.directive).toBe('STOP')
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        status: 'ERRO_E1',
        currentStage: 'SAVING_CPI',
        queueStatus: 'DESCONHECIDA',
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: {
          stage: 'SAVING_CPI',
          message: 'Não foi possível salvar o resultado na CPI.',
          occurredAt: NOW.toISOString()
        }
      })
    )
    expect(events.some((state) => state.lastError !== null && state.status !== 'ERRO_E1')).toBe(
      false
    )
    expect(JSON.stringify(events)).not.toContain(technicalCause.message)
  })

  it.each([
    ['pause', 'PAUSED'],
    ['stop', 'STOPPED']
  ] as const)(
    'conclui %s imediatamente quando nenhum ciclo está ativo',
    async (command, lifecycle) => {
      const { coordinator, workspace } = createCoordinator()
      workspace.execution.resolveOnDirective = true
      await coordinator.start()

      await expect(coordinator[command]()).resolves.toEqual(expect.objectContaining({ lifecycle }))
    }
  )

  it('espera o ciclo ativo terminar antes de pausar', async () => {
    const { coordinator, workspace } = createCoordinator()
    await coordinator.start()
    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 1 })

    let settled = false
    const pausePromise = coordinator.pause().then((state) => {
      settled = true
      return state
    })

    await flushPromises()
    expect(settled).toBe(false)
    expect(coordinator.getSnapshot().lifecycle).toBe('PAUSE_REQUESTED')
    expect(workspace.execution.input?.token.directive).toBe('PAUSE')

    workspace.execution.emitState({ type: 'CYCLE_COMPLETED', cycle: 1, result: createResult() })
    workspace.execution.resolve()

    await expect(pausePromise).resolves.toEqual(
      expect.objectContaining({ lifecycle: 'PAUSED', completedCycles: 1 })
    )
  })

  it('faz STOP prevalecer sobre PAUSE sem interromper a conclusão ativa', async () => {
    const { coordinator, workspace } = createCoordinator()
    await coordinator.start()
    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 1 })

    const pausePromise = coordinator.pause()
    const stopPromise = coordinator.stop()

    expect(coordinator.getSnapshot().lifecycle).toBe('STOP_REQUESTED')
    expect(workspace.execution.input?.token.directive).toBe('STOP')

    workspace.execution.emitState({ type: 'CYCLE_COMPLETED', cycle: 1, result: createResult() })
    workspace.execution.resolve()

    await expect(stopPromise).resolves.toEqual(expect.objectContaining({ lifecycle: 'STOPPED' }))
    await expect(pausePromise).resolves.toEqual(expect.objectContaining({ lifecycle: 'STOPPED' }))
  })

  it('falha o histórico antes de publicar E1 e sanitiza a mensagem pública', async () => {
    const { coordinator, workspace, history, sanitizer } = createCoordinator()
    const observations: string[] = []
    coordinator.subscribe((state) => {
      if (state.lifecycle === 'FAILED') observations.push('failed-state')
    })

    await coordinator.start()
    workspace.execution.emitState({ type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 1 })
    history.calls.length = 0
    const error = new ContinuousResearchStageError(
      'SAVING_CPI',
      new Error('Falha com CPF 000.111.222-33')
    )
    const originalFail = history.failCycle.bind(history)
    history.failCycle = (...args) => {
      observations.push('history-failed')
      return originalFail(...args)
    }

    workspace.execution.reject(error)
    await flushPromises()

    expect(observations).toEqual(['history-failed', 'failed-state'])
    expect(history.failures).toEqual([
      {
        id: 'history-1',
        stage: 'SAVING_CPI',
        error: expect.objectContaining({ message: 'Falha com CPF ***.***.***-33' })
      }
    ])
    expect(sanitizer).toHaveBeenCalledWith('Falha com CPF 000.111.222-33')
    expect(workspace.execution.input?.token.directive).toBe('STOP')
    expect(coordinator.getSnapshot()).toEqual(
      expect.objectContaining({
        lifecycle: 'FAILED',
        currentStage: 'SAVING_CPI',
        currentMaskedCpf: null,
        lastError: {
          stage: 'SAVING_CPI',
          message: 'Falha com CPF ***.***.***-33',
          occurredAt: NOW.toISOString()
        }
      })
    )
  })

  it('rejeita overlap durante a preparação sem iniciar duas execuções', async () => {
    const { coordinator, workspace } = createCoordinator()
    workspace.authenticated = false
    await coordinator.start()
    workspace.authenticated = true

    let releasePreparation!: () => void
    workspace.prepareGate = new Promise<void>((resolve) => {
      releasePreparation = resolve
    })

    const firstLogin = coordinator.loginCompleted()
    await flushPromises()

    await expect(coordinator.loginCompleted()).rejects.toThrow(
      'O runner contínuo já está em execução'
    )
    expect(workspace.prepareCalls).toBe(1)

    releasePreparation()
    await expect(firstLogin).resolves.toEqual(expect.objectContaining({ lifecycle: 'IDLE' }))
  })

  it.each([
    ['ensureStarted', 'stop'],
    ['ensureStarted', 'shutdown'],
    ['authentication', 'stop'],
    ['authentication', 'shutdown'],
    ['preparation', 'stop'],
    ['preparation', 'shutdown']
  ] as const)('aguarda e invalida startup em %s quando recebe %s', async (phase, command) => {
    const { coordinator, workspace } = createCoordinator()
    const release = createDeferred<void>()

    if (phase === 'ensureStarted') {
      workspace.ensureGate = release.promise
    } else if (phase === 'authentication') {
      workspace.authenticationGate = release.promise.then(() => true)
    } else {
      workspace.prepareGate = release.promise
    }

    const startPromise = coordinator.start()
    await flushPromises()

    let exitSettled = false
    const exitPromise = coordinator[command]().then((result) => {
      exitSettled = true
      return result
    })

    await flushPromises()
    expect(exitSettled).toBe(false)

    release.resolve()
    await exitPromise
    await expect(startPromise).resolves.toEqual(expect.objectContaining({ lifecycle: 'STOPPED' }))

    expect(coordinator.getSnapshot().lifecycle).toBe('STOPPED')
    expect(workspace.execution.calls).toBe(0)
  })

  it('aguarda a operação registrada quando STOP é reentrante no primeiro callback', async () => {
    const { coordinator, workspace } = createCoordinator()
    workspace.execution.resolveOnDirective = true
    let stopPromise: Promise<unknown> | null = null

    workspace.execution.onExecute = (input) => {
      input.onState?.({ type: 'IDLE', nextCheckInMs: 60_000 })
      stopPromise = coordinator.stop()
    }

    const startPromise = coordinator.start()
    await flushPromises()

    expect(stopPromise).not.toBeNull()
    await stopPromise
    await startPromise

    expect(coordinator.getSnapshot().lifecycle).toBe('STOPPED')
    expect(workspace.execution.calls).toBe(1)
  })

  it('faz shutdown idempotente e reutiliza a única promise ativa', async () => {
    const { coordinator, workspace } = createCoordinator()
    workspace.execution.resolveOnDirective = true
    await coordinator.start()

    await Promise.all([coordinator.shutdown(), coordinator.shutdown()])
    await coordinator.shutdown()

    expect(coordinator.getSnapshot().lifecycle).toBe('STOPPED')
    expect(workspace.execution.calls).toBe(1)
  })
})
