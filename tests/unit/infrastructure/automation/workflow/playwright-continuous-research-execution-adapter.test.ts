import { readFileSync } from 'node:fs'
import type { BrowserContext, Page } from 'playwright'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionToken } from '@/application/agent/execution-control'
import type { ContinuousResearchInput } from '@/application/research/run-continuous-research'
import type { PlaywrightAutomationConfig } from '@/infrastructure/automation/workflow/playwright-automation-config'
import { PlaywrightContinuousResearchExecutionAdapter } from '@/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter'

const harness = vi.hoisted(() => ({
  monitorWait: vi.fn(),
  createCycle: vi.fn()
}))

vi.mock('@/infrastructure/automation/cpi/cpi-queue-monitor', () => ({
  NodeQueueDelay: class NodeQueueDelay {},
  CpiQueueMonitor: class CpiQueueMonitor {
    waitForResearch = harness.monitorWait
  }
}))

vi.mock('@/infrastructure/automation/workflow/playwright-research-cycle-adapter', () => ({
  createPlaywrightResearchCycleAdapter: harness.createCycle
}))

const CONFIG: PlaywrightAutomationConfig = {
  queueCheckIntervalMs: 60_000,
  cpiSearchPollingIntervalMs: 250,
  actionTimeoutMs: 10_000,
  readTimeoutMs: 5_000,
  queueFilterSettleDelayMs: 700,
  cpiFrameSearchAttempts: 40,
  deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/',
  navigationTimeoutMs: 30_000,
  downloadStartTimeoutMs: 30_000,
  deskDataFormPollingIntervalMs: 250,
  deskDataResultPollingIntervalMs: 500,
  deskDataHistoryNavigationIntervalMs: 500,
  submitSettleDelayMs: 1_000,
  queueReturnDelayMs: 2_000,
  cpiIdentitySearchAttempts: 40,
  cpiAttachmentSearchAttempts: 40,
  cpiResultSearchAttempts: 40,
  cpiResultStabilizationAttempts: 3,
  deskDataFormReadyAttempts: 40,
  deskDataResultSearchAttempts: 40,
  deskDataHistoryNavigationAttempts: 40,
  pdfOutputDirectory: 'E:\\PDF-AGENTE-CPI'
}

const EXPECTED_CONFIG_FIELDS = [
  'queueCheckIntervalMs',
  'cpiSearchPollingIntervalMs',
  'actionTimeoutMs',
  'readTimeoutMs',
  'queueFilterSettleDelayMs',
  'cpiFrameSearchAttempts',
  'deskDataPeopleUrl',
  'navigationTimeoutMs',
  'downloadStartTimeoutMs',
  'deskDataFormPollingIntervalMs',
  'deskDataResultPollingIntervalMs',
  'deskDataHistoryNavigationIntervalMs',
  'submitSettleDelayMs',
  'queueReturnDelayMs',
  'cpiIdentitySearchAttempts',
  'cpiAttachmentSearchAttempts',
  'cpiResultSearchAttempts',
  'cpiResultStabilizationAttempts',
  'deskDataFormReadyAttempts',
  'deskDataResultSearchAttempts',
  'deskDataHistoryNavigationAttempts',
  'pdfOutputDirectory'
]

class MutableExecutionToken implements ExecutionToken {
  private currentDirective: ExecutionToken['directive'] = 'NONE'
  private readonly listeners = new Set<() => void>()
  public unsubscribe = vi.fn()

  get directive(): ExecutionToken['directive'] {
    return this.currentDirective
  }

  get isCancellationRequested(): boolean {
    return this.currentDirective === 'STOP'
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
      this.unsubscribe()
    }
  }

  request(directive: Exclude<ExecutionToken['directive'], 'NONE'>): void {
    this.currentDirective = directive
    this.listeners.forEach((listener) => listener())
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

function createInput(token: ExecutionToken): ContinuousResearchInput {
  return {
    token,
    onState: vi.fn(),
    onCycleStage: vi.fn(),
    onCycleIdentity: vi.fn()
  }
}

describe('PlaywrightContinuousResearchExecutionAdapter', () => {
  beforeEach(() => {
    harness.monitorWait.mockReset()
    harness.createCycle.mockReset()
  })

  it('mantém a configuração Playwright canônica com os 22 campos exatos', () => {
    const configSource = readFileSync(
      'src/infrastructure/automation/workflow/playwright-automation-config.ts',
      'utf8'
    )
    const fields = [...configSource.matchAll(/^\s+(\w+): (?:number|string)$/gmu)].map(
      ([, field]) => field
    )

    expect(fields).toEqual(EXPECTED_CONFIG_FIELDS)
  })

  it('cria somente um AbortController local e nenhum ExecutionControl', () => {
    const source = readFileSync(
      'src/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter.ts',
      'utf8'
    )

    expect(source.match(/new AbortController\(\)/gu)).toHaveLength(1)
    expect(source).not.toContain('new ExecutionControl(')
  })

  it('preserva a identidade do token canônico até o ciclo e remove a única subscription', async () => {
    const token = new MutableExecutionToken()
    let receivedCycleToken: ExecutionToken | undefined
    harness.monitorWait.mockResolvedValue({ status: 'RESEARCH_AVAILABLE', checks: 1 })
    harness.createCycle.mockReturnValue({
      execute: async (input: { token: ExecutionToken }) => {
        receivedCycleToken = input.token
        token.request('STOP')

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
    })
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).resolves.toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    })

    expect(receivedCycleToken).toBe(token)
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('normaliza AbortError reconhecido no checkpoint ocioso', async () => {
    const token = new MutableExecutionToken()
    const cancellation = new Error('operação cancelada')
    cancellation.name = 'AbortError'
    harness.monitorWait.mockImplementation(async () => {
      token.request('STOP')
      throw cancellation
    })

    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).resolves.toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 0
    })
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('normaliza ABORT_ERR reconhecido como pausa no checkpoint ocioso', async () => {
    const token = new MutableExecutionToken()
    const cancellation = Object.assign(new Error('operação cancelada'), { code: 'ABORT_ERR' })
    harness.monitorWait.mockImplementation(async () => {
      token.request('PAUSE')
      throw cancellation
    })

    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).resolves.toEqual({
      status: 'STOPPED_BY_SIGNAL',
      completedCycles: 0
    })
    expect(token.listenerCount).toBe(0)
  })

  it('repropaga erro técnico mesmo após uma diretiva no checkpoint ocioso', async () => {
    const token = new MutableExecutionToken()
    const failure = new Error('falha técnica')
    harness.monitorWait.mockImplementation(async () => {
      token.request('PAUSE')
      throw failure
    })

    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBe(failure)
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('repropaga uma rejeição undefined do caso de uso', async () => {
    const token = new MutableExecutionToken()
    harness.monitorWait.mockRejectedValue(undefined)
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBeUndefined()
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it.each(['STOP', 'PAUSE'] as const)(
    'não aborta o ciclo ativo antes do checkpoint CYCLE_COMPLETED após %s',
    async (directive) => {
      const token = new MutableExecutionToken()
      let cycleSignal: AbortSignal | undefined
      harness.monitorWait.mockImplementation(async (_page, options) => {
        cycleSignal = options?.signal

        return { status: 'RESEARCH_AVAILABLE', checks: 1 }
      })
      harness.createCycle.mockReturnValue({
        execute: async (cycleInput: { token: ExecutionToken }) => {
          cycleInput.token === token && token.request(directive)
          expect(cycleSignal?.aborted).toBe(false)

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
      })
      const adapter = new PlaywrightContinuousResearchExecutionAdapter({
        context: {} as BrowserContext,
        cpiPage: {} as Page,
        deskDataPage: {} as Page,
        config: CONFIG
      })

      await adapter.execute(createInput(token))

      expect(cycleSignal?.aborted).toBe(true)
    }
  )

  it('encaminha callbacks exatos e cria um adapter de ciclo independente por ciclo', async () => {
    const token = new MutableExecutionToken()
    const input = createInput(token)
    const createdCycles: object[] = []
    let cycleCount = 0
    let executions = 0
    harness.monitorWait.mockResolvedValue({ status: 'RESEARCH_AVAILABLE', checks: 1 })
    harness.createCycle.mockImplementation(() => {
      const cycle = { id: ++cycleCount }
      createdCycles.push(cycle)

      return {
        execute: async (cycleInput: {
          token: ExecutionToken
          hooks?: { onStage?(stage: 'PREPARING_DESKDATA'): void; onIdentity?(cpf: string): void }
        }) => {
          expect(cycleInput.token).toBe(token)
          cycleInput.hooks?.onStage?.('PREPARING_DESKDATA')
          cycleInput.hooks?.onIdentity?.('***.***.***-44')
          executions += 1
          if (executions === 2) token.request('STOP')

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
      }
    })
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(input)).resolves.toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 2
    })

    expect(createdCycles).toHaveLength(2)
    expect(createdCycles[0]).not.toBe(createdCycles[1])
    expect(input.onCycleStage).toHaveBeenNthCalledWith(1, 1, 'PREPARING_DESKDATA')
    expect(input.onCycleStage).toHaveBeenNthCalledWith(2, 2, 'PREPARING_DESKDATA')
    expect(input.onCycleIdentity).toHaveBeenNthCalledWith(1, 1, '***.***.***-44')
    expect(input.onCycleIdentity).toHaveBeenNthCalledWith(2, 2, '***.***.***-44')
  })

  it('preserva o erro técnico primário quando o unsubscribe falha', async () => {
    const token = new MutableExecutionToken()
    const primary = new Error('falha técnica primária')
    const cleanup = new Error('falha ao remover listener')
    token.unsubscribe.mockImplementation(() => {
      throw cleanup
    })
    harness.monitorWait.mockRejectedValue(primary)
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBe(primary)
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('expõe falha de unsubscribe após execução bem-sucedida', async () => {
    const token = new MutableExecutionToken()
    const cleanup = new Error('falha ao remover listener')
    token.unsubscribe.mockImplementation(() => {
      throw cleanup
    })
    harness.monitorWait.mockImplementation(async () => {
      token.request('STOP')
      return { status: 'PAUSED', checks: 0 }
    })
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBe(cleanup)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('repropaga uma falha undefined do unsubscribe após execução bem-sucedida', async () => {
    const token = new MutableExecutionToken()
    token.unsubscribe.mockImplementation(() => {
      throw undefined
    })
    harness.monitorWait.mockImplementation(async () => {
      token.request('STOP')
      return { status: 'PAUSED', checks: 0 }
    })
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBeUndefined()
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('preserva o erro primário quando o unsubscribe lança undefined', async () => {
    const token = new MutableExecutionToken()
    const primary = new Error('falha técnica primária')
    token.unsubscribe.mockImplementation(() => {
      throw undefined
    })
    harness.monitorWait.mockRejectedValue(primary)
    const adapter = new PlaywrightContinuousResearchExecutionAdapter({
      context: {} as BrowserContext,
      cpiPage: {} as Page,
      deskDataPage: {} as Page,
      config: CONFIG
    })

    await expect(adapter.execute(createInput(token))).rejects.toBe(primary)
    expect(token.listenerCount).toBe(0)
    expect(token.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
