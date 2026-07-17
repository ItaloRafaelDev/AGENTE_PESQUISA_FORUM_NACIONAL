import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  ContinuousAgentRuntimeService,
  type AgentRuntimeBrowser,
  type AgentRuntimeClock,
  type AgentRuntimeFilter,
  type AgentRuntimeHistory,
  type AgentRuntimeRunner,
  type AgentRuntimeSessions
} from '@/automation/workflow/continuous-agent-runtime-service'
import { AgentPublicStateStore } from '@/automation/workflow/agent-public-state-store'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '@/automation/flow/continuous-research-stage'
import type {
  ContinuousResearchRunnerInput,
  ContinuousResearchRunnerState,
  ContinuousResearchRunResult
} from '@/automation/flow/continuous-research-runner'
import type { SingleResearchCycleResult } from '@/automation/flow/single-research-cycle'
import type { BrowserManagerSnapshot } from '@/shared/types/browser-api'
import type { ResearchHistoryRecord } from '@/shared/types/history-api'
import type { PlatformSessionsSnapshot } from '@/shared/types/session-api'

function createPage(url: string): Page {
  return {
    url: () => url
  } as unknown as Page
}

const cpiPage = createPage(
  'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
)

const deskDataPage = createPage('https://deskdata.com.br/pessoas/')

const context = {
  pages: () => [cpiPage, deskDataPage]
} as unknown as BrowserContext

class FakeBrowser implements AgentRuntimeBrowser {
  public ensureStartedCalls = 0

  private running = false

  async ensureStarted(): Promise<BrowserManagerSnapshot> {
    this.ensureStartedCalls += 1
    this.running = true

    return this.getSnapshot()
  }

  getSnapshot(): BrowserManagerSnapshot {
    return {
      state: this.running ? 'RUNNING' : 'STOPPED',
      profilePath: 'C:\\AgenteCPI\\browser-profile',
      startedAt: this.running ? '2026-07-14T10:00:00.000Z' : null
    }
  }

  getContext(): BrowserContext {
    return context
  }
}

class FakeSessions implements AgentRuntimeSessions {
  public authenticated = true

  async getSnapshot(): Promise<PlatformSessionsSnapshot> {
    return {
      cpi: {
        state: this.authenticated ? 'AUTHENTICATED' : 'WAITING_LOGIN',
        url: cpiPage.url()
      },
      deskData: {
        state: this.authenticated ? 'AUTHENTICATED' : 'WAITING_LOGIN',
        url: deskDataPage.url()
      },
      allAuthenticated: this.authenticated,
      checkedAt: '2026-07-14T10:00:00.000Z'
    }
  }
}

class FakeFilter implements AgentRuntimeFilter {
  public calls = 0

  async applyCriminalForumFilter(): Promise<void> {
    this.calls += 1
  }
}

class ControlledRunner implements AgentRuntimeRunner {
  public calls = 0
  public lastInput: ContinuousResearchRunnerInput | null = null

  private resolveCurrent: ((result: ContinuousResearchRunResult) => void) | null = null

  private rejectCurrent: ((error: unknown) => void) | null = null

  run(input: ContinuousResearchRunnerInput): Promise<ContinuousResearchRunResult> {
    this.calls += 1
    this.lastInput = input

    return new Promise((resolve, reject) => {
      this.resolveCurrent = resolve
      this.rejectCurrent = reject

      input.signal.addEventListener(
        'abort',
        () => {
          resolve({
            status: 'STOPPED_BY_SIGNAL',
            completedCycles: 0
          })
        },
        {
          once: true
        }
      )
    })
  }

  emitState(state: ContinuousResearchRunnerState): void {
    this.lastInput?.onState?.(state)
  }

  emitStage(cycle: number, stage: ContinuousResearchStage): void {
    this.lastInput?.onCycleStage?.(cycle, stage)
  }

  emitIdentity(cycle: number, maskedCpf: string): void {
    this.lastInput?.onCycleIdentity?.(cycle, maskedCpf)
  }

  resolve(
    result: ContinuousResearchRunResult = {
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    }
  ): void {
    this.resolveCurrent?.(result)
  }

  reject(error: unknown): void {
    this.rejectCurrent?.(error)
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
    startedAt: overrides.startedAt ?? '2026-07-14T10:00:00.000Z',
    finishedAt: overrides.finishedAt ?? null,
    durationMs: overrides.durationMs ?? null,
    pdfPath: overrides.pdfPath ?? null,
    errorStage: overrides.errorStage ?? null,
    errorMessage: overrides.errorMessage ?? null,
    createdAt: overrides.createdAt ?? '2026-07-14T10:00:00.000Z'
  }
}

class FakeHistory implements AgentRuntimeHistory {
  public beginCalls = 0
  public maskedCpfCalls: string[] = []
  public completedResults: SingleResearchCycleResult[] = []
  public failedStages: string[] = []

  beginCycle(): ResearchHistoryRecord {
    this.beginCalls += 1

    return createHistoryRecord()
  }

  setMaskedCpf(_id: string, maskedCpf: string): ResearchHistoryRecord {
    this.maskedCpfCalls.push(maskedCpf)

    return createHistoryRecord({
      maskedCpf
    })
  }

  completeCycle(_id: string, result: SingleResearchCycleResult): ResearchHistoryRecord {
    this.completedResults.push(result)

    return createHistoryRecord({
      maskedCpf: result.maskedCpf,
      classification: result.classification,
      cpiResult: 'Há Informações',
      status: 'CONCLUIDO',
      finishedAt: '2026-07-14T10:01:00.000Z',
      durationMs: 60_000,
      pdfPath: result.pdfPath
    })
  }

  failCycle(_id: string, stage: string): ResearchHistoryRecord {
    this.failedStages.push(stage)

    return createHistoryRecord({
      status: 'ERRO_E1',
      errorStage: stage,
      errorMessage: 'Falha segura'
    })
  }
}

class FakeClock implements AgentRuntimeClock {
  now(): Date {
    return new Date('2026-07-14T10:00:00.000Z')
  }
}

function createResult(): SingleResearchCycleResult {
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

function createService(): {
  service: ContinuousAgentRuntimeService
  browser: FakeBrowser
  sessions: FakeSessions
  filter: FakeFilter
  runner: ControlledRunner
  history: FakeHistory
} {
  const browser = new FakeBrowser()
  const sessions = new FakeSessions()
  const filter = new FakeFilter()
  const runner = new ControlledRunner()
  const history = new FakeHistory()

  const service = new ContinuousAgentRuntimeService({
    stateStore: new AgentPublicStateStore(),
    browser,
    sessions,
    filter,
    runner,
    history,
    clock: new FakeClock()
  })

  return {
    service,
    browser,
    sessions,
    filter,
    runner,
    history
  }
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('ContinuousAgentRuntimeService', () => {
  it('inicia parado e sem pesquisa automática', () => {
    const { service, browser, runner } = createService()

    expect(service.getSnapshot().status).toBe('PARADO')
    expect(browser.ensureStartedCalls).toBe(0)
    expect(runner.calls).toBe(0)
  })

  it('abre ou reutiliza o navegador e inicia o runner', async () => {
    const { service, browser, filter, runner } = createService()

    const snapshot = await service.start()

    expect(snapshot.status).toBe('OCIOSO')
    expect(browser.ensureStartedCalls).toBe(1)
    expect(filter.calls).toBe(1)
    expect(runner.calls).toBe(1)
  })

  it('entra em AGUARDANDO_LOGIN sem gerar E1', async () => {
    const { service, sessions, runner } = createService()

    sessions.authenticated = false

    const snapshot = await service.start()

    expect(snapshot.status).toBe('AGUARDANDO_LOGIN')
    expect(snapshot.lastError).toBeNull()
    expect(runner.calls).toBe(0)
  })

  it('continua após confirmação de login', async () => {
    const { service, sessions, runner } = createService()

    sessions.authenticated = false

    await service.start()

    sessions.authenticated = true

    const snapshot = await service.loginCompleted()

    expect(snapshot.status).toBe('OCIOSO')
    expect(runner.calls).toBe(1)
  })

  it('bloqueia duas execuções simultâneas', async () => {
    const { service } = createService()

    await service.start()

    await expect(service.start()).rejects.toThrow('O agente já está em execução')
  })

  it('reflete fila vazia e próxima verificação', async () => {
    const { service, runner } = createService()

    await service.start()

    runner.emitState({
      type: 'IDLE',
      nextCheckInMs: 60_000
    })

    expect(service.getSnapshot()).toEqual(
      expect.objectContaining({
        status: 'OCIOSO',
        queueStatus: 'VAZIA',
        nextCheckAt: '2026-07-14T10:01:00.000Z',
        remainingSeconds: 60
      })
    )
  })

  it('registra ciclo, etapa, CPF mascarado e conclusão', async () => {
    const { service, runner, history } = createService()

    await service.start()

    runner.emitState({
      type: 'RESEARCH_AVAILABLE',
      cycle: 1,
      checks: 1
    })

    runner.emitStage(1, 'PREPARING_DESKDATA')

    runner.emitIdentity(1, '***.***.***-44')

    const result = createResult()

    runner.emitState({
      type: 'CYCLE_COMPLETED',
      cycle: 1,
      result
    })

    expect(history.beginCalls).toBe(1)
    expect(history.maskedCpfCalls).toEqual(['***.***.***-44'])
    expect(history.completedResults).toEqual([result])

    expect(service.getSnapshot()).toEqual(
      expect.objectContaining({
        completedCycles: 1,
        currentMaskedCpf: null,
        currentStage: null
      })
    )
  })

  it('pausa imediatamente quando está ocioso', async () => {
    const { service } = createService()

    await service.start()

    const snapshot = await service.pause()

    expect(snapshot.status).toBe('PAUSADO')
  })

  it('conclui o ciclo antes de pausar', async () => {
    const { service, runner } = createService()

    await service.start()

    runner.emitState({
      type: 'RESEARCH_AVAILABLE',
      cycle: 1,
      checks: 1
    })

    const pausePromise = service.pause()

    expect(service.getSnapshot().status).toBe('PAUSANDO')

    expect(runner.lastInput?.shouldStopBeforeNextCycle?.()).toBe(true)

    runner.emitState({
      type: 'CYCLE_COMPLETED',
      cycle: 1,
      result: createResult()
    })

    runner.resolve()

    await expect(pausePromise).resolves.toEqual(
      expect.objectContaining({
        status: 'PAUSADO',
        completedCycles: 1
      })
    )
  })

  it('conclui o ciclo antes de parar e mantém navegador aberto', async () => {
    const { service, browser, runner } = createService()

    await service.start()

    runner.emitState({
      type: 'RESEARCH_AVAILABLE',
      cycle: 1,
      checks: 1
    })

    const stopPromise = service.stop()

    expect(service.getSnapshot().status).toBe('PARANDO')

    runner.emitState({
      type: 'CYCLE_COMPLETED',
      cycle: 1,
      result: createResult()
    })

    runner.resolve()

    const snapshot = await stopPromise

    expect(snapshot.status).toBe('PARADO')
    expect(browser.getSnapshot().state).toBe('RUNNING')
  })

  it('entra em ERRO_E1, sanitiza a mensagem e bloqueia próximo ciclo', async () => {
    const { service, runner, history } = createService()

    await service.start()

    runner.emitState({
      type: 'RESEARCH_AVAILABLE',
      cycle: 1,
      checks: 1
    })

    runner.emitIdentity(1, '***.***.***-44')

    runner.reject(
      new ContinuousResearchStageError('SAVING_CPI', new Error('Falha com CPF 111.222.333-44'))
    )

    await flushPromises()

    const snapshot = service.getSnapshot()

    expect(snapshot.status).toBe('ERRO_E1')
    expect(snapshot.lastError).toEqual(
      expect.objectContaining({
        stage: 'SAVING_CPI',
        message: 'Falha com CPF ***.***.***-44'
      })
    )

    expect(history.failedStages).toEqual(['SAVING_CPI'])

    expect(runner.lastInput?.shouldStopBeforeNextCycle?.()).toBe(true)
  })

  it('emite atualizações observáveis', async () => {
    const { service } = createService()
    const listener = vi.fn()

    const unsubscribe = service.subscribe(listener)

    await service.start()

    expect(listener).toHaveBeenCalled()

    unsubscribe()
  })
})
