import type {
  CpiResearchPreparationPort,
  DeskDataResearchPort,
  ResearchReportPort
} from '@/application/ports/research-preparation-ports'
import { describe, expect, it, vi } from 'vitest'
import {
  createPlaywrightResearchPreparationAdapter,
  PlaywrightResearchPreparationAdapter
} from '@/infrastructure/automation/workflow/playwright-research-preparation-adapter'
import type { PlaywrightAutomationConfig } from '@/infrastructure/automation/workflow/playwright-automation-config'
import { PlaywrightResearchPreparationState } from '@/infrastructure/automation/workflow/playwright-research-preparation-state'
import { PlaywrightDeskDataResearchAdapter } from '@/infrastructure/automation/workflow/playwright-deskdata-research-adapter'
import { PlaywrightCpiPreparationAdapter } from '@/infrastructure/automation/workflow/playwright-cpi-preparation-adapter'
import type { CpiResearchPdfPreparationFrame } from '@/infrastructure/automation/cpi/cpi-research-pdf-preparation-workflow'
import type { Page } from 'playwright'

const factoryFakes = vi.hoisted(() => {
  const calls: string[] = []
  const constructorOptions: Record<string, unknown> = {}
  const resultPage = { id: 'factory-result-page' }

  return {
    calls,
    constructorOptions,
    resultPage,
    reset(): void {
      calls.length = 0
      Object.keys(constructorOptions).forEach((key) => delete constructorOptions[key])
    }
  }
})

vi.mock('@/infrastructure/automation/deskdata/deskdata-cpf-form-controller', () => ({
  DeskDataCpfFormController: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.cpfForm = options
    }

    async fillCpf(page: { id: string }, cpf: string): Promise<{ cpf: string; maskedCpf: string }> {
      factoryFakes.calls.push(`fill:${page.id}:${cpf}`)
      return { cpf, maskedCpf: '***.***.***-00' }
    }
  }
}))

vi.mock('@/infrastructure/automation/deskdata/deskdata-dataset-controller', () => ({
  DeskDataDatasetController: class {
    async applyApprovedDatasets(page: {
      id: string
    }): Promise<{ selectedIds: string[]; selectedCount: number }> {
      factoryFakes.calls.push(`datasets:${page.id}`)
      return { selectedIds: ['processes'], selectedCount: 1 }
    }
  }
}))

vi.mock('@/infrastructure/automation/deskdata/deskdata-search-submit-controller', () => ({
  DeskDataSearchSubmitController: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.submit = options
    }

    async submitOnce(page: { id: string }): Promise<{ status: 'SUBMITTED'; resultPath: string }> {
      factoryFakes.calls.push(`submit:${page.id}`)
      return { status: 'SUBMITTED' as const, resultPath: '/pessoas/resultado' }
    }
  }
}))

vi.mock('@/infrastructure/automation/deskdata/deskdata-search-result-page-resolver', () => ({
  DeskDataSearchResultPageResolver: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.resolver = options
    }

    async resolve(
      page: { id: string },
      cpf: string
    ): Promise<{
      source: 'DIRECT_RESULT'
      page: { id: string }
      resultPath: string
      closeAfterConfirmedSave: boolean
    }> {
      factoryFakes.calls.push(`resolve:${page.id}:${cpf}`)
      return {
        source: 'DIRECT_RESULT' as const,
        page: factoryFakes.resultPage,
        resultPath: '/pessoas/resultado',
        closeAfterConfirmedSave: false
      }
    }
  }
}))

vi.mock('@/infrastructure/automation/deskdata/deskdata-result-ready-waiter', () => ({
  DeskDataResultReadyWaiter: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.ready = options
    }

    async waitUntilReady(page: { id: string }): Promise<{
      status: 'READY'
      resultPath: string
      expectedProcessCount: number
      expectedProcessNumbers: readonly string[]
    }> {
      factoryFakes.calls.push(`ready:${page.id}`)
      return {
        status: 'READY' as const,
        resultPath: '/pessoas/resultado',
        expectedProcessCount: 0,
        expectedProcessNumbers: []
      }
    }
  }
}))

vi.mock('@/infrastructure/automation/pdf/deskdata-pdf-download-controller', () => ({
  DeskDataPdfDownloadController: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.downloader = options
    }

    async downloadOnce(
      context: { id: string },
      page: { id: string }
    ): Promise<{ filePath: string; sizeBytes: number }> {
      factoryFakes.calls.push(`download:${context.id}:${page.id}`)
      return { filePath: 'C:\\safe\\factory.pdf', sizeBytes: 42 }
    }
  }
}))

vi.mock('@/infrastructure/automation/pdf/deskdata-pdf-process-reader', () => ({
  DeskDataPdfProcessReader: class {
    async read(reference: string): Promise<never[]> {
      factoryFakes.calls.push(`read:${reference}`)
      return []
    }
  }
}))

vi.mock('@/infrastructure/automation/pdf/deskdata-pdf-report-adapter', () => ({
  DeskDataPdfReportAdapter: class {
    constructor(
      private readonly context: { id: string },
      private readonly resultPage: () => { id: string },
      private readonly downloader: {
        downloadOnce(context: { id: string }, page: { id: string }): Promise<unknown>
      },
      private readonly reader: { read(reference: string): Promise<unknown> }
    ) {}

    async create(): Promise<{ reference: string; compatibilityPath: string; sizeBytes: number }> {
      const pdf = (await this.downloader.downloadOnce(this.context, this.resultPage())) as {
        filePath: string
        sizeBytes: number
      }

      return {
        reference: pdf.filePath,
        compatibilityPath: pdf.filePath,
        sizeBytes: pdf.sizeBytes
      }
    }

    readProcesses(reference: string): Promise<unknown> {
      return this.reader.read(reference)
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-result-controller', () => ({
  CpiResearchResultController: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.cpiResult = options
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-pdf-attachment-controller', () => ({
  CpiResearchPdfAttachmentController: class {
    constructor(options: unknown) {
      factoryFakes.constructorOptions.cpiAttachment = options
    }
  }
}))

vi.mock('@/infrastructure/automation/cpi/cpi-research-pdf-preparation-workflow', () => ({
  CpiResearchPdfPreparationWorkflow: class {
    async prepareWithAttachment(
      frame: { id: string },
      classification: string,
      reference: string
    ): Promise<{
      prepared: {
        classification: string
        selectedResultLabel: string
        researcherLabel: string
        primaryResearcherLabel: string
        statusLabel: string
        responseChanged: boolean
        saved: boolean
      }
      attachment: {
        attached: boolean
        filePath: string
        fileName: string
        sizeBytes: number
      }
    }> {
      factoryFakes.calls.push(`cpi:${frame.id}:${classification}:${reference}`)
      return {
        prepared: {
          classification,
          selectedResultLabel: 'Há Informações',
          researcherLabel: 'Desk Data',
          primaryResearcherLabel: 'Desk Data',
          statusLabel: 'Respondida',
          responseChanged: false,
          saved: false
        },
        attachment: {
          attached: true,
          filePath: reference,
          fileName: 'factory.pdf',
          sizeBytes: 42
        }
      }
    }
  }
}))

describe('PlaywrightResearchPreparationAdapter', () => {
  it('delegates the exact preparation order through semantic ports', async () => {
    const calls: string[] = []
    const submitOnce = vi.fn(async () => void calls.push('submit'))
    const createReport = vi.fn(async () => {
      calls.push('report')
      return { reference: 'report-1', compatibilityPath: 'C:\\safe\\report.pdf', sizeBytes: 42 }
    })
    const prepareAndAttach = vi.fn(async () => {
      calls.push('attach')
      return { attached: true, requiredFieldsConfirmed: true }
    })
    const deskData: DeskDataResearchPort = {
      fillCpf: async () => void calls.push('fillCpf'),
      applyApprovedDatasets: async () => {
        calls.push('datasets')
        return { selectedCount: 3 }
      },
      submitOnce,
      waitUntilResultReady: async () => void calls.push('ready')
    }
    const report: ResearchReportPort = {
      create: createReport,
      readProcesses: async () => {
        calls.push('read')
        return []
      }
    }
    const cpi: CpiResearchPreparationPort = {
      prepareAndAttach
    }
    const adapter = new PlaywrightResearchPreparationAdapter(deskData, report, cpi)

    const result = await adapter.execute({ cpf: '00000000000', maskedCpf: '***.***.***-00' })

    expect(calls).toEqual(['fillCpf', 'datasets', 'submit', 'ready', 'report', 'read', 'attach'])
    expect(submitOnce).toHaveBeenCalledTimes(1)
    expect(createReport).toHaveBeenCalledTimes(1)
    expect(prepareAndAttach).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      maskedCpf: '***.***.***-00',
      selectedDatasetCount: 3,
      classification: {
        classification: 'HA_INFORMACOES',
        evidence: {
          result: 'HA_INFORMACOES',
          reason: 'NO_CRIMINAL_SPHERE',
          totalProcesses: 0,
          normalizedSpheres: []
        }
      },
      report: { reference: 'report-1', compatibilityPath: 'C:\\safe\\report.pdf', sizeBytes: 42 },
      attachmentConfirmed: true,
      requiredFieldsConfirmed: true
    })
  })
})

describe('PlaywrightResearchPreparationState', () => {
  it('requires a result with the safe message and overwrites only the compatibility handle', () => {
    const state = new PlaywrightResearchPreparationState()
    const initialPage = { id: 'initial-result' } as never
    const replacementPage = { id: 'replacement-result' } as never

    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )

    state.setResolvedResult({
      resultPage: initialPage,
      closeResultPageAfterSave: false,
      expectedProcessCount: 1,
      expectedProcessNumbers: ['1000878-26.2017.5.02.0067']
    })
    state.setResolvedResult({
      resultPage: replacementPage,
      closeResultPageAfterSave: true,
      expectedProcessCount: 2,
      expectedProcessNumbers: ['1000878-26.2017.5.02.0067', '0010652-30.2020.8.26.0502']
    })

    expect(state.requireResolvedResult()).toEqual({
      resultPage: replacementPage,
      closeResultPageAfterSave: true,
      expectedProcessCount: 2,
      expectedProcessNumbers: ['1000878-26.2017.5.02.0067', '0010652-30.2020.8.26.0502']
    })

    state.clearResolvedResult()

    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })
})

describe('PlaywrightDeskDataResearchAdapter', () => {
  it('delegates the four DeskData port operations and retains only the resolved result handle', async () => {
    const calls: string[] = []
    const state = new PlaywrightResearchPreparationState()
    const deskDataPage = { id: 'deskdata-main' } as unknown as Page
    const resultPage = { id: 'deskdata-result' } as unknown as Page
    const fillCpf = vi.fn(async (_page: Page, cpf: string) => {
      calls.push(`fill:${cpf}`)
      return { cpf, maskedCpf: '***.***.***-00' }
    })
    const applyApprovedDatasets = vi.fn(async () => {
      calls.push('datasets')
      return { selectedIds: ['processes'], selectedCount: 1 }
    })
    const submitOnce = vi.fn(async () => {
      calls.push('submit')
      return { status: 'SUBMITTED' as const, resultPath: '/pessoas/resultado' }
    })
    const resolve = vi.fn(async (_page: Page, cpf: string) => {
      calls.push(`resolve:${cpf}`)
      return {
        source: 'SIMILAR_QUERY' as const,
        page: resultPage,
        resultPath: '/historico/detalhes',
        closeAfterConfirmedSave: true
      }
    })
    const waitUntilReady = vi.fn(async (page: Page) => {
      calls.push(`ready:${(page as unknown as { id: string }).id}`)
      return {
        status: 'READY' as const,
        resultPath: '/historico/detalhes',
        expectedProcessCount: 2,
        expectedProcessNumbers: ['1000878-26.2017.5.02.0067', '0010652-30.2020.8.26.0502']
      }
    })
    const adapter = new PlaywrightDeskDataResearchAdapter(
      deskDataPage,
      {
        cpfForm: { fillCpf },
        dataset: { applyApprovedDatasets },
        submit: { submitOnce },
        resultPageResolver: { resolve },
        resultReady: { waitUntilReady }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.applyApprovedDatasets()).resolves.toEqual({ selectedCount: 1 })
    await adapter.submitOnce()
    await adapter.waitUntilResultReady()

    expect(calls).toEqual([
      'fill:00000000000',
      'datasets',
      'submit',
      'resolve:00000000000',
      'ready:deskdata-result'
    ])
    expect(state.requireResolvedResult()).toEqual({
      resultPage,
      closeResultPageAfterSave: true,
      expectedProcessCount: 2,
      expectedProcessNumbers: ['1000878-26.2017.5.02.0067', '0010652-30.2020.8.26.0502']
    })
  })

  it('invalidates a previous identity before a replacement CPF fill fails', async () => {
    const state = new PlaywrightResearchPreparationState()
    const resolve = vi.fn()
    const fillCpf = vi
      .fn()
      .mockResolvedValueOnce({ cpf: '00000000000', maskedCpf: '***.***.***-00' })
      .mockRejectedValueOnce(new Error('synthetic fill failure'))
    const adapter = new PlaywrightDeskDataResearchAdapter(
      { isClosed: () => false } as unknown as Page,
      {
        cpfForm: { fillCpf },
        dataset: { applyApprovedDatasets: vi.fn() },
        submit: { submitOnce: vi.fn() },
        resultPageResolver: { resolve },
        resultReady: { waitUntilReady: vi.fn() }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.fillCpf('00000000001')).rejects.toThrow('synthetic fill failure')
    await expect(adapter.waitUntilResultReady()).rejects.toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )

    expect(resolve).not.toHaveBeenCalled()
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('invalidates the active identity after dataset or submit failures', async () => {
    const state = new PlaywrightResearchPreparationState()
    const resolve = vi.fn()
    const datasetFailure = new Error('synthetic dataset failure')
    const submitFailure = new Error('synthetic submit failure')
    const applyApprovedDatasets = vi
      .fn()
      .mockRejectedValueOnce(datasetFailure)
      .mockResolvedValueOnce({ selectedIds: ['processes'], selectedCount: 1 })
    const submitOnce = vi.fn().mockRejectedValueOnce(submitFailure)
    const adapter = new PlaywrightDeskDataResearchAdapter(
      { isClosed: () => false } as unknown as Page,
      {
        cpfForm: { fillCpf: vi.fn().mockResolvedValue({}) },
        dataset: { applyApprovedDatasets },
        submit: { submitOnce },
        resultPageResolver: { resolve },
        resultReady: { waitUntilReady: vi.fn() }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.applyApprovedDatasets()).rejects.toBe(datasetFailure)
    await expect(adapter.waitUntilResultReady()).rejects.toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )

    await adapter.fillCpf('00000000000')
    await adapter.applyApprovedDatasets()
    await expect(adapter.submitOnce()).rejects.toBe(submitFailure)
    await expect(adapter.waitUntilResultReady()).rejects.toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )

    expect(resolve).not.toHaveBeenCalled()
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('clears old state when resolution fails', async () => {
    const state = new PlaywrightResearchPreparationState()
    state.setResolvedResult({
      resultPage: { id: 'stale' } as never,
      closeResultPageAfterSave: true,
      expectedProcessCount: 0,
      expectedProcessNumbers: []
    })
    const resolveFailure = new Error('synthetic resolver failure')
    const adapter = new PlaywrightDeskDataResearchAdapter(
      { isClosed: () => false } as unknown as Page,
      {
        cpfForm: { fillCpf: vi.fn().mockResolvedValue({}) },
        dataset: { applyApprovedDatasets: vi.fn() },
        submit: { submitOnce: vi.fn() },
        resultPageResolver: { resolve: vi.fn().mockRejectedValue(resolveFailure) },
        resultReady: { waitUntilReady: vi.fn() }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.waitUntilResultReady()).rejects.toBe(resolveFailure)

    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('closes only an unresolved historical popup and preserves the readiness error', async () => {
    const state = new PlaywrightResearchPreparationState()
    const mainPage = {
      isClosed: vi.fn(() => false),
      close: vi.fn()
    } as unknown as Page
    const popup = {
      isClosed: vi.fn(() => false),
      close: vi.fn().mockResolvedValue(undefined)
    } as unknown as Page
    const readinessFailure = new Error('synthetic readiness failure')
    const adapter = new PlaywrightDeskDataResearchAdapter(
      mainPage,
      {
        cpfForm: { fillCpf: vi.fn().mockResolvedValue({}) },
        dataset: { applyApprovedDatasets: vi.fn() },
        submit: { submitOnce: vi.fn() },
        resultPageResolver: {
          resolve: vi.fn().mockResolvedValue({
            source: 'SIMILAR_QUERY',
            page: popup,
            resultPath: '/historico/detalhes',
            closeAfterConfirmedSave: true
          })
        },
        resultReady: { waitUntilReady: vi.fn().mockRejectedValue(readinessFailure) }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.waitUntilResultReady()).rejects.toBe(readinessFailure)

    expect(popup.close).toHaveBeenCalledWith({ runBeforeUnload: false })
    expect(mainPage.close).not.toHaveBeenCalled()
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('preserves the readiness error when historical-popup cleanup fails', async () => {
    const state = new PlaywrightResearchPreparationState()
    const cleanupFailure = new Error('synthetic cleanup failure')
    const readinessFailure = new Error('synthetic readiness failure')
    const popup = {
      isClosed: vi.fn(() => false),
      close: vi.fn().mockRejectedValue(cleanupFailure)
    } as unknown as Page
    const adapter = new PlaywrightDeskDataResearchAdapter(
      { isClosed: () => false } as unknown as Page,
      {
        cpfForm: { fillCpf: vi.fn().mockResolvedValue({}) },
        dataset: { applyApprovedDatasets: vi.fn() },
        submit: { submitOnce: vi.fn() },
        resultPageResolver: {
          resolve: vi.fn().mockResolvedValue({
            source: 'SIMILAR_QUERY',
            page: popup,
            resultPath: '/historico/detalhes',
            closeAfterConfirmedSave: true
          })
        },
        resultReady: { waitUntilReady: vi.fn().mockRejectedValue(readinessFailure) }
      },
      state
    )

    await adapter.fillCpf('00000000000')
    await expect(adapter.waitUntilResultReady()).rejects.toBe(readinessFailure)

    expect(popup.close).toHaveBeenCalledTimes(1)
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })
})

describe('PlaywrightCpiPreparationAdapter', () => {
  it('delegates once and maps only the CPI preparation port result', async () => {
    const frame = { id: 'cpi-detail-frame' } as unknown as CpiResearchPdfPreparationFrame
    const prepareWithAttachment = vi.fn(async () => ({
      prepared: {
        classification: 'HA_INFORMACOES' as const,
        selectedResultLabel: 'Há Informações',
        researcherLabel: 'Desk Data',
        primaryResearcherLabel: 'Desk Data',
        statusLabel: 'Respondida',
        responseChanged: false as const,
        saved: false as const
      },
      attachment: {
        attached: true as const,
        filePath: 'C:\\safe\\report.pdf',
        fileName: 'report.pdf',
        sizeBytes: 42
      }
    }))
    const adapter = new PlaywrightCpiPreparationAdapter(frame, { prepareWithAttachment })

    await expect(
      adapter.prepareAndAttach('HA_INFORMACOES', 'C:\\safe\\report.pdf')
    ).resolves.toEqual({
      attached: true,
      requiredFieldsConfirmed: true
    })
    expect(prepareWithAttachment).toHaveBeenCalledTimes(1)
    expect(prepareWithAttachment).toHaveBeenCalledWith(
      frame,
      'HA_INFORMACOES',
      'C:\\safe\\report.pdf'
    )
  })
})

describe('createPlaywrightResearchPreparationAdapter', () => {
  it('composes identifiable handles and canonical configuration through a complete preparation', async () => {
    factoryFakes.reset()

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
    const context = { id: 'factory-context' } as never
    const deskDataPage = { id: 'factory-deskdata-page' } as never
    const detailFrame = { id: 'factory-detail-frame' } as never

    const adapter = createPlaywrightResearchPreparationAdapter({
      context,
      deskDataPage,
      detailFrame,
      config
    })

    await expect(
      adapter.execute({ cpf: '00000000000', maskedCpf: '***.***.***-00' })
    ).resolves.toEqual({
      maskedCpf: '***.***.***-00',
      selectedDatasetCount: 1,
      classification: {
        classification: 'HA_INFORMACOES',
        evidence: {
          result: 'HA_INFORMACOES',
          reason: 'NO_CRIMINAL_SPHERE',
          totalProcesses: 0,
          normalizedSpheres: []
        }
      },
      report: {
        reference: 'C:\\safe\\factory.pdf',
        compatibilityPath: 'C:\\safe\\factory.pdf',
        sizeBytes: 42
      },
      attachmentConfirmed: true,
      requiredFieldsConfirmed: true
    })

    expect(factoryFakes.calls).toEqual([
      'fill:factory-deskdata-page:00000000000',
      'datasets:factory-deskdata-page',
      'submit:factory-deskdata-page',
      'resolve:factory-deskdata-page:00000000000',
      'ready:factory-result-page',
      'download:factory-context:factory-result-page',
      'read:C:\\safe\\factory.pdf',
      'cpi:factory-detail-frame:HA_INFORMACOES:C:\\safe\\factory.pdf'
    ])
    expect(factoryFakes.constructorOptions).toEqual({
      cpfForm: { actionTimeoutMs: 13, readTimeoutMs: 14 },
      submit: { actionTimeoutMs: 13, navigationTimeoutMs: 17, submitSettleDelayMs: 22 },
      resolver: {
        searchAttempts: 29,
        searchIntervalMs: 20,
        navigationTimeoutMs: 17,
        historyNavigationAttempts: 30,
        historyNavigationIntervalMs: 21,
        actionTimeoutMs: 13
      },
      ready: { searchAttempts: 29, searchIntervalMs: 20 },
      downloader: {
        outputDirectory: 'C:\\safe\\pdf',
        downloadTimeoutMs: 18,
        actionTimeoutMs: 13
      },
      cpiResult: {
        resultSearchAttempts: 26,
        resultSearchIntervalMs: 12,
        stabilizationAttempts: 27,
        readTimeoutMs: 14
      },
      cpiAttachment: {
        controlSearchAttempts: 25,
        controlSearchIntervalMs: 12
      }
    })
  })
})
