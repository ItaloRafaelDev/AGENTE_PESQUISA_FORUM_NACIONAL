import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiResearchIdentity } from '@/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '@/automation/cpi/cpi-research-pdf-preparation-workflow'
import {
  createFullResearchPreparationWorkflow,
  FullResearchPreparationWorkflow,
  mapDeskDataResultToResearchClassification,
  type FullResearchPreparationDependencies
} from '@/automation/flow/full-research-preparation-workflow'
import * as fullResearchWorkflowModule from '@/automation/flow/full-research-preparation-workflow'
import type { ResearchCycleRuntimeConfig } from '@/automation/flow/single-research-cycle'
import type { DeskDataProcessRecord } from '@/domain/research/deskdata-process-record'

describe('FullResearchPreparationWorkflow', () => {
  it('compõe o workflow produtivo com a configuração validada sem seam de teste', () => {
    const workflow = createFullResearchPreparationWorkflow({
      navigationTimeoutMs: 30_000,
      actionTimeoutMs: 10_000,
      readTimeoutMs: 5_000,
      downloadStartTimeoutMs: 30_000,
      cpiSearchPollingIntervalMs: 250,
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

    expect(workflow).toBeInstanceOf(FullResearchPreparationWorkflow)
  })

  it('propaga as sentinelas de runtime para todos os controllers configuráveis', () => {
    const captured: Record<string, unknown> = {}

    const createWorkflow = Reflect.get(
      fullResearchWorkflowModule,
      'createFullResearchPreparationWorkflow'
    ) as
      | ((
          config: ResearchCycleRuntimeConfig,
          seam: Record<string, (options: unknown) => never>
        ) => FullResearchPreparationWorkflow)
      | undefined

    expect(createWorkflow).toBeTypeOf('function')

    createWorkflow?.(
      {
        navigationTimeoutMs: 31_234,
        actionTimeoutMs: 12_345,
        readTimeoutMs: 4_321,
        downloadStartTimeoutMs: 32_345,
        cpiSearchPollingIntervalMs: 321,
        deskDataFormPollingIntervalMs: 432,
        deskDataResultPollingIntervalMs: 543,
        deskDataHistoryNavigationIntervalMs: 654,
        submitSettleDelayMs: 1_234,
        queueReturnDelayMs: 3_210,
        cpiIdentitySearchAttempts: 17,
        cpiAttachmentSearchAttempts: 18,
        cpiResultSearchAttempts: 19,
        cpiResultStabilizationAttempts: 4,
        deskDataFormReadyAttempts: 20,
        deskDataResultSearchAttempts: 21,
        deskDataHistoryNavigationAttempts: 22,
        pdfOutputDirectory: 'E:\\resolved-output'
      },
      {
        createCpfForm: (options) => {
          captured.cpfForm = options
          return {} as never
        },
        createSubmit: (options) => {
          captured.submit = options
          return {} as never
        },
        createResultPageResolver: (options) => {
          captured.resultPageResolver = options
          return {} as never
        },
        createResultReady: (options) => {
          captured.resultReady = options
          return {} as never
        },
        createPdfDownloader: (options) => {
          captured.pdfDownloader = options
          return {} as never
        },
        createCpiResultController: (options) => {
          captured.cpiResult = options
          return {} as never
        },
        createCpiAttachmentController: (options) => {
          captured.cpiAttachment = options
          return {} as never
        }
      }
    )

    expect(captured).toEqual({
      cpfForm: {
        actionTimeoutMs: 12_345,
        readTimeoutMs: 4_321
      },
      submit: {
        actionTimeoutMs: 12_345,
        navigationTimeoutMs: 31_234,
        submitSettleDelayMs: 1_234
      },
      resultPageResolver: {
        searchAttempts: 21,
        searchIntervalMs: 543,
        navigationTimeoutMs: 31_234,
        historyNavigationAttempts: 22,
        historyNavigationIntervalMs: 654,
        actionTimeoutMs: 12_345
      },
      resultReady: {
        searchAttempts: 21,
        searchIntervalMs: 543
      },
      pdfDownloader: {
        outputDirectory: 'E:\\resolved-output',
        downloadTimeoutMs: 32_345,
        actionTimeoutMs: 12_345
      },
      cpiResult: {
        resultSearchAttempts: 19,
        resultSearchIntervalMs: 321,
        stabilizationAttempts: 4,
        readTimeoutMs: 4_321
      },
      cpiAttachment: {
        controlSearchAttempts: 18,
        controlSearchIntervalMs: 321
      }
    })
  })

  it('uses the historical popup for PDF, classification and CPI preparation', async () => {
    const callOrder: string[] = []
    const filePath = 'E:\\PDF-AGENTE-CPI\\deskdata-teste.pdf'
    const mainPage = {} as Page
    const historicalPage = {} as Page

    const identity: CpiResearchIdentity = {
      cpf: '00000000000',
      maskedCpf: '***.***.***-**',
      detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    }

    const processes: DeskDataProcessRecord[] = [
      {
        processKey: 'proc-criminal:0',
        processNumber: '0000001-00.2024.0.00.0001',
        sphereRaw: 'Especial criminal',
        sourcePage: 8
      }
    ]

    const dependencies: FullResearchPreparationDependencies = {
      cpfForm: {
        fillCpf: vi.fn(async () => {
          callOrder.push('FILL_CPF')

          return {
            cpf: identity.cpf,
            maskedCpf: identity.maskedCpf
          }
        })
      },
      dataset: {
        applyApprovedDatasets: vi.fn(async () => {
          callOrder.push('SELECT_DATASETS')

          return {
            selectedIds: [
              'basic_data',
              'emails_extended',
              'addresses_extended',
              'phones_extended',
              'occupation_data',
              'processes'
            ],
            selectedCount: 6
          }
        })
      },
      submit: {
        submitOnce: vi.fn(async () => {
          callOrder.push('SUBMIT_DESKDATA')

          return {
            status: 'SUBMITTED' as const,
            resultPath: '/pessoas/'
          }
        })
      },
      resultPageResolver: {
        resolve: vi.fn(async () => {
          callOrder.push('RESOLVE_RESULT_PAGE')

          return {
            source: 'SIMILAR_QUERY' as const,
            page: historicalPage,
            resultPath: '/historico/detalhes',
            closeAfterConfirmedSave: true
          }
        })
      },
      resultReady: {
        waitUntilReady: vi.fn(async (page) => {
          callOrder.push('WAIT_RESULT')
          expect(page).toBe(historicalPage)

          return {
            status: 'READY' as const,
            resultPath: '/historico/detalhes'
          }
        })
      },
      pdfDownloader: {
        downloadOnce: vi.fn(async (_context, page) => {
          callOrder.push('DOWNLOAD_PDF')
          expect(page).toBe(historicalPage)

          return {
            filePath,
            sizeBytes: 100
          }
        })
      },
      pdfProcessReader: {
        read: vi.fn(async () => {
          callOrder.push('READ_PDF_PROCESSES')
          return processes
        })
      },
      cpiPreparation: {
        prepareWithAttachment: vi.fn(async () => {
          callOrder.push('PREPARE_CPI')

          return {
            prepared: {
              classification: 'CONSTA_RESTRICAO' as const,
              selectedResultLabel: 'Sim, Consta Restricoes',
              researcherLabel: 'Desk Data',
              primaryResearcherLabel: 'Desk Data',
              statusLabel: 'Respondida',
              responseChanged: false as const,
              saved: false as const
            },
            attachment: {
              attached: true as const,
              filePath,
              fileName: 'deskdata-teste.pdf',
              sizeBytes: 100
            }
          }
        })
      }
    }

    const detailFrame = {} as CpiResearchPdfPreparationFrame

    const result = await new FullResearchPreparationWorkflow(dependencies).prepare(
      {} as BrowserContext,
      mainPage,
      detailFrame,
      identity
    )

    expect(callOrder).toEqual([
      'FILL_CPF',
      'SELECT_DATASETS',
      'SUBMIT_DESKDATA',
      'RESOLVE_RESULT_PAGE',
      'WAIT_RESULT',
      'DOWNLOAD_PDF',
      'READ_PDF_PROCESSES',
      'PREPARE_CPI'
    ])

    expect(result.deskDataResultPage).toBe(historicalPage)
    expect(result.closeDeskDataResultPageAfterSave).toBe(true)

    expect(result.classification).toEqual({
      result: 'SIM_CONSTA_RESTRICAO',
      reason: 'CRIMINAL_SPHERE_FOUND',
      totalProcesses: 1,
      normalizedSpheres: ['especial criminal'],
      classification: 'CONSTA_RESTRICAO'
    })
  })

  it('does not prepare CPI when PDF reading fails', async () => {
    const prepareWithAttachment = vi.fn()
    const page = {} as Page

    const dependencies: FullResearchPreparationDependencies = {
      cpfForm: {
        fillCpf: vi.fn(async () => ({
          cpf: '00000000000',
          maskedCpf: '***.***.***-**'
        }))
      },
      dataset: {
        applyApprovedDatasets: vi.fn(async () => ({
          selectedIds: ['processes'],
          selectedCount: 1
        }))
      },
      submit: {
        submitOnce: vi.fn(async () => ({
          status: 'SUBMITTED' as const,
          resultPath: '/pessoas/resultado/teste'
        }))
      },
      resultPageResolver: {
        resolve: vi.fn(async () => ({
          source: 'DIRECT_RESULT' as const,
          page,
          resultPath: '/pessoas/resultado/teste',
          closeAfterConfirmedSave: false
        }))
      },
      resultReady: {
        waitUntilReady: vi.fn(async () => ({
          status: 'READY' as const,
          resultPath: '/pessoas/resultado/teste'
        }))
      },
      pdfDownloader: {
        downloadOnce: vi.fn(async () => ({
          filePath: 'E:\\PDF-AGENTE-CPI\\invalido.pdf',
          sizeBytes: 100
        }))
      },
      pdfProcessReader: {
        read: vi.fn(async () => {
          throw new Error('PDF_INVALIDO')
        })
      },
      cpiPreparation: {
        prepareWithAttachment
      }
    }

    await expect(
      new FullResearchPreparationWorkflow(dependencies).prepare(
        {} as BrowserContext,
        page,
        {} as CpiResearchPdfPreparationFrame,
        {
          cpf: '00000000000',
          maskedCpf: '***.***.***-**',
          detailFramePath: '/pesquisa'
        }
      )
    ).rejects.toThrow('PDF_INVALIDO')

    expect(prepareWithAttachment).not.toHaveBeenCalled()
  })

  it('maps only criminal result to Consta Restricao', () => {
    expect(mapDeskDataResultToResearchClassification('SIM_CONSTA_RESTRICAO')).toBe(
      'CONSTA_RESTRICAO'
    )

    expect(mapDeskDataResultToResearchClassification('HA_INFORMACOES')).toBe('HA_INFORMACOES')
  })
})
