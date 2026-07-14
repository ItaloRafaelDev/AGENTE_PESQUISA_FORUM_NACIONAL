import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiResearchIdentity } from '@/automation/cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '@/automation/cpi/cpi-research-pdf-preparation-workflow'
import {
  FullResearchPreparationWorkflow,
  type FullResearchPreparationDependencies
} from '@/automation/flow/full-research-preparation-workflow'

describe('FullResearchPreparationWorkflow', () => {
  it('deve executar consulta, classificação, PDF e preparação da CPI na ordem correta', async () => {
    const callOrder: string[] = []
    const filePath = 'E:\\PDF-AGENTE-CPI\\deskdata-teste.pdf'

    const identity: CpiResearchIdentity = {
      cpf: '00000000000',
      maskedCpf: '***.***.***-**',
      detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    }

    const inspection = {
      schemaVersion: 1 as const,
      scenario: 'fluxo-real' as const,
      capturedAt: '2026-07-14T12:00:00.000Z',
      sourcePath: '/pessoas/resultado/teste',
      pageTitle: 'Resultado',
      relevantBodyLines: [],
      headings: [],
      tables: [],
      candidates: []
    }

    const classification = {
      summary: {
        hasProcesses: true,
        hasCriminalProcesses: true,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      },
      classification: 'CONSTA_RESTRICAO' as const
    }

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

    const capture = vi.fn(async () => {
      callOrder.push('CAPTURE_RESULT')

      return inspection
    })

    const classify = vi.fn(() => {
      callOrder.push('CLASSIFY_RESULT')

      return classification
    })

    const downloadOnce = vi.fn(async () => {
      callOrder.push('DOWNLOAD_PDF')

      return {
        filePath,
        sizeBytes: 100
      }
    })

    const prepareWithAttachment = vi.fn(async () => {
      callOrder.push('PREPARE_CPI')

      return {
        prepared: {
          classification: 'CONSTA_RESTRICAO' as const,
          selectedResultLabel: 'Sim, Consta Restrições',
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
      resultCapture: { capture },
      classifier: { classify },
      pdfDownloader: { downloadOnce },
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
      'CAPTURE_RESULT',
      'CLASSIFY_RESULT',
      'DOWNLOAD_PDF',
      'PREPARE_CPI'
    ])

    expect(prepareWithAttachment).toHaveBeenCalledWith(detailFrame, 'CONSTA_RESTRICAO', filePath)
    expect(result.maskedCpf).toBe(identity.maskedCpf)
    expect(result.selectedDatasetCount).toBe(6)
    expect(result).not.toHaveProperty('cpf')
  })
})
