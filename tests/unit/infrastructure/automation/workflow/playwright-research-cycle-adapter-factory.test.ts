import { ExecutionControl } from '@/application/agent/execution-control'
import type { PlaywrightAutomationConfig } from '@/infrastructure/automation/workflow/playwright-automation-config'
import { describe, expect, it, vi } from 'vitest'

const factoryFakes = vi.hoisted(() => {
  const options: Record<string, unknown> = {}
  const resultPages: Array<{ isClosed(): boolean; close(options: unknown): Promise<void> }> = []
  const saveOperations: Array<() => Promise<{ saved: boolean; confirmationAccepted: boolean }>> = []

  return {
    options,
    resultPages,
    saveOperations,
    preparationInputs: [] as Array<Record<string, unknown>>,
    deskDataInputs: [] as Array<Record<string, unknown>>,
    queueWaits: [] as number[],
    reset(): void {
      Object.keys(options).forEach((key) => delete options[key])
      resultPages.length = 0
      saveOperations.length = 0
      this.preparationInputs.length = 0
      this.deskDataInputs.length = 0
      this.queueWaits.length = 0
    }
  }
})

vi.mock('@/infrastructure/automation/cpi/cpi-first-research-opener', () => ({
  CpiFirstResearchOpener: class {
    constructor(options: unknown) {
      factoryFakes.options.opener = options
    }

    async openFirst(): Promise<{ availableRows: number; detailFramePath: string }> {
      return { availableRows: 1, detailFramePath: '/safe' }
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-identity-reader', () => ({
  CpiResearchIdentityReader: class {
    constructor(options: unknown) {
      factoryFakes.options.identity = options
    }

    async read(): Promise<{ cpf: string; maskedCpf: string; detailFramePath: string }> {
      return {
        cpf: '00000000000',
        maskedCpf: '***.***.***-00',
        detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
      }
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-result-saver', () => ({
  CpiResearchResultSaver: class {
    constructor(options: unknown) {
      factoryFakes.options.saver = options
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-confirmed-save-controller', () => ({
  CpiResearchConfirmedSaveController: class {
    constructor(_saver: unknown, options: unknown) {
      factoryFakes.options.confirmedSave = options
    }

    async saveOnce(): Promise<{ saved: boolean; confirmationAccepted: boolean }> {
      const operation = factoryFakes.saveOperations.shift()

      if (!operation) {
        throw new Error('missing synthetic save operation')
      }

      return operation()
    }
  }
}))

vi.mock('@/infrastructure/automation/deskdata/deskdata-next-search-controller', () => ({
  DeskDataNextSearchController: class {
    constructor(options: unknown) {
      factoryFakes.options.nextSearch = options
    }

    async prepare(): Promise<void> {
      return undefined
    }
  }
}))

vi.mock('@/infrastructure/automation/workflow/playwright-deskdata-cycle-adapter', () => ({
  PlaywrightDeskDataCycleAdapter: class {
    constructor(
      private readonly page: unknown,
      private readonly dependencies: { prepare: { prepare(page: unknown): Promise<void> } },
      private readonly preparationState: {
        requireResolvedResult(): {
          resultPage: { isClosed(): boolean; close(options: unknown): Promise<void> }
          closeResultPageAfterSave: boolean
        }
        clearResolvedResult(): void
      }
    ) {
      factoryFakes.deskDataInputs.push({
        page,
        dependencies,
        preparationState
      })
    }

    async prepareNextSearch(): Promise<void> {
      await this.dependencies.prepare.prepare(this.page)
    }

    async closeHistoricalResult(): Promise<void> {
      const result = this.preparationState.requireResolvedResult()

      try {
        if (result.closeResultPageAfterSave && !result.resultPage.isClosed()) {
          await result.resultPage.close({ runBeforeUnload: false })
        }
      } finally {
        this.preparationState.clearResolvedResult()
      }
    }
  }
}))

vi.mock('@/infrastructure/automation/workflow/playwright-research-preparation-adapter', () => ({
  createPlaywrightResearchPreparationAdapterWithState: (input: {
    context: unknown
    deskDataPage: unknown
    detailFrame: unknown
    config: unknown
    state: {
      setResolvedResult(value: {
        resultPage: { isClosed(): boolean; close(options: unknown): Promise<void> }
        closeResultPageAfterSave: boolean
        expectedProcessCount: number
        expectedProcessNumbers: readonly string[]
      }): void
    }
  }) => {
    factoryFakes.preparationInputs.push(input)
    const resultPage = factoryFakes.resultPages.shift()

    if (!resultPage) {
      throw new Error('missing synthetic historical page')
    }

    return {
      execute: async () => {
        input.state.setResolvedResult({
          resultPage,
          closeResultPageAfterSave: true,
          expectedProcessCount: 0,
          expectedProcessNumbers: []
        })
        return {
          maskedCpf: '***.***.***-00',
          selectedDatasetCount: 1,
          classification: {
            classification: 'HA_INFORMACOES',
            evidence: {
              result: 'NAO_CONSTA_RESTRICAO',
              reason: 'NO_CRIMINAL_SPHERE',
              totalProcesses: 0,
              normalizedSpheres: []
            }
          },
          report: { reference: 'safe', compatibilityPath: 'safe', sizeBytes: 1 },
          attachmentConfirmed: true,
          requiredFieldsConfirmed: true
        }
      }
    }
  }
}))

import { createPlaywrightResearchCycleAdapter } from '@/infrastructure/automation/workflow/playwright-research-cycle-adapter'

const config: PlaywrightAutomationConfig = {
  queueCheckIntervalMs: 11,
  cpiSearchPollingIntervalMs: 12,
  actionTimeoutMs: 13,
  readTimeoutMs: 14,
  queueFilterSettleDelayMs: 15,
  cpiFrameSearchAttempts: 16,
  deskDataPeopleUrl: 'https://deskdata.example/pessoas',
  navigationTimeoutMs: 17,
  downloadStartTimeoutMs: 18,
  deskDataFormPollingIntervalMs: 19,
  deskDataResultPollingIntervalMs: 20,
  deskDataHistoryNavigationIntervalMs: 21,
  submitSettleDelayMs: 22,
  queueReturnDelayMs: 23,
  cpiIdentitySearchAttempts: 24,
  cpiAttachmentSearchAttempts: 25,
  cpiResultSearchAttempts: 26,
  cpiResultStabilizationAttempts: 27,
  deskDataFormReadyAttempts: 28,
  deskDataResultSearchAttempts: 29,
  deskDataHistoryNavigationAttempts: 30,
  pdfOutputDirectory: 'C:\\safe\\pdf'
}

function createInput(): Parameters<typeof createPlaywrightResearchCycleAdapter>[0] {
  const detailFrame = {
    url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
  }

  return {
    context: { id: 'factory-context' } as never,
    cpiPage: {
      frames: () => [detailFrame],
      waitForTimeout: async (milliseconds: number) =>
        void factoryFakes.queueWaits.push(milliseconds),
      bringToFront: async () => undefined,
      url: () => 'https://cpi.example/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'
    } as never,
    deskDataPage: { id: 'factory-deskdata-main' } as never,
    config
  }
}

function historicalPage(): {
  isClosed(): boolean
  close(options?: unknown): Promise<void>
} {
  return {
    isClosed: vi.fn(() => false),
    close: vi.fn(async () => undefined)
  }
}

describe('createPlaywrightResearchCycleAdapter', () => {
  it('wires canonical options and closes the shared historical result only after save', async () => {
    factoryFakes.reset()
    const page = historicalPage()
    factoryFakes.resultPages.push(page)
    factoryFakes.saveOperations.push(async () => ({ saved: true, confirmationAccepted: true }))

    const input = createInput()

    await createPlaywrightResearchCycleAdapter(input).execute({
      token: new ExecutionControl().token
    })

    expect(page.close).toHaveBeenCalledOnce()
    expect(factoryFakes.options).toEqual({
      opener: { frameSearchAttempts: 16, frameSearchIntervalMs: 12, actionTimeoutMs: 13 },
      identity: { searchAttempts: 24, searchIntervalMs: 12, readTimeoutMs: 14 },
      saver: { actionTimeoutMs: 13 },
      confirmedSave: { dialogTimeoutMs: 13 },
      nextSearch: {
        peopleUrl: 'https://deskdata.example/pessoas',
        formReadyAttempts: 28,
        pollingIntervalMs: 19,
        navigationTimeoutMs: 17,
        actionTimeoutMs: 13,
        readTimeoutMs: 14
      }
    })
    expect(factoryFakes.queueWaits).toEqual([23])
    expect(factoryFakes.preparationInputs[0]).toMatchObject({
      context: input.context,
      deskDataPage: input.deskDataPage,
      detailFrame: input.cpiPage.frames()[0],
      config: input.config
    })
    expect(factoryFakes.deskDataInputs[0]).toMatchObject({
      page: input.deskDataPage,
      dependencies: {
        prepare: expect.anything()
      }
    })
    expect(factoryFakes.deskDataInputs[0].preparationState).toBe(
      factoryFakes.preparationInputs[0].state
    )
  })

  it('keeps preparation state isolated across a failed cycle and its replacement', async () => {
    factoryFakes.reset()
    const failedPage = historicalPage()
    const successfulPage = historicalPage()
    factoryFakes.resultPages.push(failedPage, successfulPage)
    factoryFakes.saveOperations.push(
      async () => {
        throw new Error('synthetic save failure')
      },
      async () => ({ saved: true, confirmationAccepted: true })
    )

    const failedInput = createInput()
    const successfulInput = createInput()

    await expect(
      createPlaywrightResearchCycleAdapter(failedInput).execute({
        token: new ExecutionControl().token
      })
    ).rejects.toMatchObject({ stage: 'SAVING_CPI' })

    await createPlaywrightResearchCycleAdapter(successfulInput).execute({
      token: new ExecutionControl().token
    })

    expect(failedPage.close).not.toHaveBeenCalled()
    expect(successfulPage.close).toHaveBeenCalledOnce()
    expect(factoryFakes.preparationInputs[0].state).not.toBe(
      factoryFakes.preparationInputs[1].state
    )
    expect(factoryFakes.deskDataInputs[0].preparationState).toBe(
      factoryFakes.preparationInputs[0].state
    )
    expect(factoryFakes.deskDataInputs[1].preparationState).toBe(
      factoryFakes.preparationInputs[1].state
    )
  })
})
