import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiResearchIdentity } from '@/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '@/automation/cpi/cpi-research-pdf-preparation-workflow'
import {
  FullResearchPreparationWorkflow,
  mapDeskDataResultToResearchClassification,
  type FullResearchPreparationDependencies
} from '@/automation/flow/full-research-preparation-workflow'
import type { DeskDataProcessRecord } from '@/domain/research/deskdata-process-record'

describe('FullResearchPreparationWorkflow', () => {
  it('baixa o PDF, classifica somente pela Esfera e prepara a CPI', async () => {
    const callOrder: string[] = []
    const filePath = 'E:\\PDF-AGENTE-CPI\\deskdata-teste.pdf'

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

    const fillCpf = vi.fn(async () => {
      callOrder.push('FILL_CPF')

      return {
        cpf: identity.cpf,
        maskedCpf: identity.maskedCpf
      }
    })

    const applyApprovedDatasets = vi.fn(async () => {
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

    const submitOnce = vi.fn(async () => {
      callOrder.push('SUBMIT_DESKDATA')

      return {
        status: 'SUBMITTED' as const,
        resultPath: '/pessoas/resultado/teste'
      }
    })

    const waitUntilReady = vi.fn(async () => {
      callOrder.push('WAIT_RESULT')

      return {
        status: 'READY' as const,
        resultPath: '/pessoas/resultado/teste'
      }
    })

    const downloadOnce = vi.fn(async () => {
      callOrder.push('DOWNLOAD_PDF')

      return {
        filePath,
        sizeBytes: 100
      }
    })

    const read = vi.fn(async () => {
      callOrder.push('READ_PDF_PROCESSES')

      return processes
    })

    const prepareWithAttachment = vi.fn(async () => {
      callOrder.push('PREPARE_CPI')

      return {
        prepared: {
          classification: 'CONSTA_RESTRICAO' as const,
          selectedResultLabel: 'Sim, Consta RestriÃ§Ãµes',
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

    const dependencies: FullResearchPreparationDependencies = {
      cpfForm: { fillCpf },
      dataset: { applyApprovedDatasets },
      submit: { submitOnce },
      resultReady: { waitUntilReady },
      pdfDownloader: { downloadOnce },
      pdfProcessReader: { read },
      cpiPreparation: { prepareWithAttachment }
    }

    const context = {} as BrowserContext
    const deskDataPage = {} as Page
    const detailFrame = {} as CpiResearchPdfPreparationFrame

    const result = await new FullResearchPreparationWorkflow(dependencies).prepare(
      context,
      deskDataPage,
      detailFrame,
      identity
    )

    expect(callOrder).toEqual([
      'FILL_CPF',
      'SELECT_DATASETS',
      'SUBMIT_DESKDATA',
      'WAIT_RESULT',
      'DOWNLOAD_PDF',
      'READ_PDF_PROCESSES',
      'PREPARE_CPI'
    ])

    expect(applyApprovedDatasets).toHaveBeenCalledWith(deskDataPage)
    expect(read).toHaveBeenCalledWith(filePath)

    expect(prepareWithAttachment).toHaveBeenCalledWith(detailFrame, 'CONSTA_RESTRICAO', filePath)

    expect(result.classification).toEqual({
      result: 'SIM_CONSTA_RESTRICAO',
      reason: 'CRIMINAL_SPHERE_FOUND',
      totalProcesses: 1,
      normalizedSpheres: ['especial criminal'],
      classification: 'CONSTA_RESTRICAO'
    })

    expect(result.selectedDatasetCount).toBe(6)
    expect(result.maskedCpf).toBe(identity.maskedCpf)
    expect(result).not.toHaveProperty('cpf')
  })

  it('nÃ£o prepara a CPI quando a leitura do PDF falha', async () => {
    const prepareWithAttachment = vi.fn()

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
        {} as Page,
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

  it('mapeia somente o resultado criminal para Consta RestriÃ§Ã£o na CPI', () => {
    expect(mapDeskDataResultToResearchClassification('SIM_CONSTA_RESTRICAO')).toBe(
      'CONSTA_RESTRICAO'
    )

    expect(mapDeskDataResultToResearchClassification('HA_INFORMACOES')).toBe('HA_INFORMACOES')
  })
})
