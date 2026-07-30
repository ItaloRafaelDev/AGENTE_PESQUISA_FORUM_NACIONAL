import type { BrowserContext, Frame, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiResearchIdentity } from '@/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '@/automation/cpi/cpi-research-pdf-preparation-workflow'
import type { FullResearchPreparationResult } from '@/automation/flow/full-research-preparation-workflow'
import {
  SingleResearchCycle,
  createSingleResearchCycle,
  type SingleResearchCycleDependencies
} from '@/automation/flow/single-research-cycle'

const DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

function createFlowResult(
  detailFrame: CpiResearchPdfPreparationFrame
): FullResearchPreparationResult {
  const filePath = 'E:\\PDF-AGENTE-CPI\\deskdata-ciclo-teste.pdf'

  return {
    maskedCpf: '***.***.***-01',
    selectedDatasetCount: 6,
    classification: {
      summary: {
        hasProcesses: true,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'HA_INFORMACOES'
    },
    pdf: {
      filePath,
      sizeBytes: 1234
    },
    cpi: {
      prepared: {
        classification: 'HA_INFORMACOES',
        selectedResultLabel: 'Há Informações',
        researcherLabel: 'Desk Data',
        primaryResearcherLabel: 'Desk Data',
        statusLabel: 'Respondida',
        responseChanged: false,
        saved: false
      },
      attachment: {
        attached: true,
        filePath,
        fileName: 'deskdata-ciclo-teste.pdf',
        sizeBytes: 1234
      }
    },
    detailFrame
  }
}

function createPages(): {
  cpiPage: Page
  deskDataPage: Page
  detailFrame: CpiResearchPdfPreparationFrame
} {
  const detailFrame = {
    url: () => 'https://adm.cpicentral.com.br' + DETAIL_FRAME_PATH
  } as unknown as Frame

  const cpiPage = {
    frames: () => [detailFrame],
    url: () =>
      'https://adm.cpicentral.com.br/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'
  } as unknown as Page

  const deskDataPage = {
    url: () => 'https://app.deskdata.com.br/pessoas/'
  } as unknown as Page

  return {
    cpiPage,
    deskDataPage,
    detailFrame: detailFrame as CpiResearchPdfPreparationFrame
  }
}

function createIdentity(): CpiResearchIdentity {
  return {
    cpf: '12345678901',
    maskedCpf: '***.***.***-01',
    detailFramePath: DETAIL_FRAME_PATH
  }
}

describe('SingleResearchCycle', () => {
  it('compõe o ciclo produtivo com a configuração validada sem seam de teste', () => {
    const cycle = createSingleResearchCycle({
      cpiFrameSearchAttempts: 40,
      cpiSearchPollingIntervalMs: 250,
      actionTimeoutMs: 10_000,
      deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/',
      navigationTimeoutMs: 30_000,
      readTimeoutMs: 5_000,
      downloadStartTimeoutMs: 30_000,
      deskDataFormPollingIntervalMs: 250,
      deskDataResultPollingIntervalMs: 500,
      deskDataHistoryNavigationIntervalMs: 250,
      submitSettleDelayMs: 1_000,
      queueReturnDelayMs: 3_000,
      cpiIdentitySearchAttempts: 40,
      cpiAttachmentSearchAttempts: 40,
      cpiResultSearchAttempts: 40,
      cpiResultStabilizationAttempts: 3,
      deskDataFormReadyAttempts: 40,
      deskDataResultSearchAttempts: 180,
      deskDataHistoryNavigationAttempts: 120,
      pdfOutputDirectory: 'E:\\PDF-AGENTE-CPI'
    })

    expect(cycle).toBeInstanceOf(SingleResearchCycle)
  })

  it('deve propagar a configuração explícita para as dependências produtivas', () => {
    const captured: Record<string, unknown> = {}

    createSingleResearchCycle(
      {
        cpiFrameSearchAttempts: 19,
        cpiSearchPollingIntervalMs: 432,
        actionTimeoutMs: 13_579,
        deskDataPeopleUrl: 'https://config.deskdata.com.br/pessoas/',
        navigationTimeoutMs: 31_579,
        readTimeoutMs: 4_579,
        downloadStartTimeoutMs: 32_579,
        deskDataFormPollingIntervalMs: 543,
        deskDataResultPollingIntervalMs: 654,
        deskDataHistoryNavigationIntervalMs: 765,
        submitSettleDelayMs: 1_579,
        queueReturnDelayMs: 3_579,
        cpiIdentitySearchAttempts: 20,
        cpiAttachmentSearchAttempts: 21,
        cpiResultSearchAttempts: 22,
        cpiResultStabilizationAttempts: 4,
        deskDataFormReadyAttempts: 23,
        deskDataResultSearchAttempts: 24,
        deskDataHistoryNavigationAttempts: 25,
        pdfOutputDirectory: 'E:\\resolved-cycle-output'
      },
      {
        createOpener: (options) => {
          captured.opener = options

          return {
            openFirst: vi.fn()
          }
        },
        createIdentityReader: (options) => {
          captured.identity = options
          return {} as never
        },
        createNextSearchController: (options) => {
          captured.nextSearch = options
          return {} as never
        },
        createPreparationWorkflow: (config) => {
          captured.preparationConfig = config
          return {} as never
        },
        createResultSaver: (options) => {
          captured.resultSaver = options
          return {} as never
        },
        createSaveController: (saver, options) => {
          captured.saveController = {
            saver,
            options
          }
          return {} as never
        },
        createQueueReturnController: (delayMs) => {
          captured.queueReturnDelayMs = delayMs
          return {} as never
        }
      }
    )

    expect(captured).toEqual({
      opener: {
        frameSearchAttempts: 19,
        frameSearchIntervalMs: 432,
        actionTimeoutMs: 13_579
      },
      identity: {
        searchAttempts: 20,
        searchIntervalMs: 432,
        readTimeoutMs: 4_579
      },
      nextSearch: {
        peopleUrl: 'https://config.deskdata.com.br/pessoas/',
        formReadyAttempts: 23,
        pollingIntervalMs: 543,
        navigationTimeoutMs: 31_579,
        actionTimeoutMs: 13_579,
        readTimeoutMs: 4_579
      },
      preparationConfig: {
        navigationTimeoutMs: 31_579,
        actionTimeoutMs: 13_579,
        readTimeoutMs: 4_579,
        downloadStartTimeoutMs: 32_579,
        cpiSearchPollingIntervalMs: 432,
        deskDataFormPollingIntervalMs: 543,
        deskDataResultPollingIntervalMs: 654,
        deskDataHistoryNavigationIntervalMs: 765,
        submitSettleDelayMs: 1_579,
        queueReturnDelayMs: 3_579,
        cpiIdentitySearchAttempts: 20,
        cpiAttachmentSearchAttempts: 21,
        cpiResultSearchAttempts: 22,
        cpiResultStabilizationAttempts: 4,
        deskDataFormReadyAttempts: 23,
        deskDataResultSearchAttempts: 24,
        deskDataHistoryNavigationAttempts: 25,
        pdfOutputDirectory: 'E:\\resolved-cycle-output'
      },
      resultSaver: {
        actionTimeoutMs: 13_579
      },
      saveController: {
        saver: {},
        options: {
          dialogTimeoutMs: 13_579
        }
      },
      queueReturnDelayMs: 3_579
    })
  })

  it('deve executar uma pesquisa automática completa na ordem correta', async () => {
    const callOrder: string[] = []
    const pages = createPages()
    const identity = createIdentity()
    const flowResult = createFlowResult(pages.detailFrame)

    let deskDataPreparationCount = 0

    const openFirst = vi.fn(async () => {
      callOrder.push('OPEN_CPI_RESEARCH')

      return {
        availableRows: 1,
        detailFramePath: DETAIL_FRAME_PATH
      }
    })

    const read = vi.fn(async () => {
      callOrder.push('READ_CPI_IDENTITY')
      return identity
    })

    const prepareDeskData = vi.fn(async () => {
      deskDataPreparationCount += 1

      callOrder.push(
        deskDataPreparationCount === 1 ? 'PREPARE_DESKDATA_BEFORE' : 'PREPARE_DESKDATA_AFTER'
      )

      return {
        status: 'READY' as const,
        pagePath: '/pessoas/' as const,
        cpfCleared: true as const
      }
    })

    const prepareResearch = vi.fn(async () => {
      callOrder.push('RUN_FULL_PREPARATION')
      return flowResult
    })

    const saveOnce = vi.fn(async () => {
      callOrder.push('SAVE_CPI')

      return {
        saved: true as const,
        confirmationAccepted: true as const,
        confirmationMessage: 'Deseja Realmente Alterar esta Pesquisa?'
      }
    })

    const returnToQueue = vi.fn(async () => {
      callOrder.push('RETURN_TO_CPI_QUEUE')
    })

    const dependencies: SingleResearchCycleDependencies = {
      opener: {
        openFirst
      },
      identityReader: {
        read
      },
      nextSearchController: {
        prepare: prepareDeskData
      },
      preparationWorkflow: {
        prepare: prepareResearch
      },
      saveController: {
        saveOnce
      },
      queueReturnController: {
        returnToQueue
      }
    }

    const result = await new SingleResearchCycle(dependencies).run({
      context: {} as BrowserContext,
      cpiPage: pages.cpiPage,
      deskDataPage: pages.deskDataPage
    })

    expect(callOrder).toEqual([
      'OPEN_CPI_RESEARCH',
      'READ_CPI_IDENTITY',
      'PREPARE_DESKDATA_BEFORE',
      'RUN_FULL_PREPARATION',
      'SAVE_CPI',
      'PREPARE_DESKDATA_AFTER',
      'RETURN_TO_CPI_QUEUE'
    ])

    expect(openFirst).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(prepareResearch).toHaveBeenCalledTimes(1)
    expect(saveOnce).toHaveBeenCalledTimes(1)
    expect(prepareDeskData).toHaveBeenCalledTimes(2)
    expect(returnToQueue).toHaveBeenCalledTimes(1)

    expect(result).toEqual({
      maskedCpf: '***.***.***-01',
      selectedDatasetCount: 6,
      classification: 'HA_INFORMACOES',
      pdfPath: 'E:\\PDF-AGENTE-CPI\\deskdata-ciclo-teste.pdf',
      pdfSizeBytes: 1234,
      saved: true,
      confirmationAccepted: true
    })

    expect(result).not.toHaveProperty('cpf')
  })

  it('deve interromper no erro de gravação sem preparar outra pesquisa', async () => {
    const pages = createPages()
    const identity = createIdentity()
    const flowResult = createFlowResult(pages.detailFrame)

    const prepareDeskData = vi.fn(async () => ({
      status: 'READY' as const,
      pagePath: '/pessoas/' as const,
      cpfCleared: true as const
    }))

    const returnToQueue = vi.fn(async () => undefined)

    const dependencies: SingleResearchCycleDependencies = {
      opener: {
        openFirst: vi.fn(async () => ({
          availableRows: 1,
          detailFramePath: DETAIL_FRAME_PATH
        }))
      },
      identityReader: {
        read: vi.fn(async () => identity)
      },
      nextSearchController: {
        prepare: prepareDeskData
      },
      preparationWorkflow: {
        prepare: vi.fn(async () => flowResult)
      },
      saveController: {
        saveOnce: vi.fn(async () => {
          throw new Error('Falha ao salvar na CPI')
        })
      },
      queueReturnController: {
        returnToQueue
      }
    }

    await expect(
      new SingleResearchCycle(dependencies).run({
        context: {} as BrowserContext,
        cpiPage: pages.cpiPage,
        deskDataPage: pages.deskDataPage
      })
    ).rejects.toMatchObject({
      name: 'ContinuousResearchStageError',
      stage: 'SAVING_CPI',
      message: 'Falha ao salvar na CPI'
    })

    expect(prepareDeskData).toHaveBeenCalledTimes(1)
    expect(returnToQueue).not.toHaveBeenCalled()
  })

  it('não deve abrir uma pesquisa quando o sinal já estiver cancelado', async () => {
    const pages = createPages()
    const abortController = new AbortController()
    abortController.abort()

    const openFirst = vi.fn(async () => ({
      availableRows: 1,
      detailFramePath: DETAIL_FRAME_PATH
    }))

    const dependencies = {
      opener: {
        openFirst
      },
      identityReader: {
        read: vi.fn()
      },
      nextSearchController: {
        prepare: vi.fn()
      },
      preparationWorkflow: {
        prepare: vi.fn()
      },
      saveController: {
        saveOnce: vi.fn()
      },
      queueReturnController: {
        returnToQueue: vi.fn()
      }
    } as unknown as SingleResearchCycleDependencies

    await expect(
      new SingleResearchCycle(dependencies).run({
        context: {} as BrowserContext,
        cpiPage: pages.cpiPage,
        deskDataPage: pages.deskDataPage,
        signal: abortController.signal
      })
    ).rejects.toMatchObject({
      name: 'ContinuousResearchStageError',
      stage: 'OPENING_CPI_RESEARCH'
    })

    expect(openFirst).not.toHaveBeenCalled()
  })
})
