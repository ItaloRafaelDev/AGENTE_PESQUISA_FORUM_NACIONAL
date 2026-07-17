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
  it('consulta os seis conjuntos, classifica somente por Esfera e prepara a CPI', async () => {
    const callOrder: string[] = []
    const filePath = 'E:\\PDF-AGENTE-CPI\\deskdata-teste.pdf'

    const identity: CpiResearchIdentity = {
      cpf: '00000000000',
      maskedCpf: '***.***.***-**',
      detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    }

    const processes: DeskDataProcessRecord[] = [
      {
        processKey: 'proc-criminal',
        processNumber: '0000001-00.2024.0.00.0001',
        sphereRaw: 'Especial criminal',
        sourcePage: 1
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

    const collect = vi.fn(async () => {
      callOrder.push('COLLECT_PROCESSES')

      return processes
    })

    const processCollectorFactory = vi.fn(() => ({
      collect
    }))

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
      processCollectorFactory,
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
      'COLLECT_PROCESSES',
      'DOWNLOAD_PDF',
      'PREPARE_CPI'
    ])
    expect(applyApprovedDatasets).toHaveBeenCalledWith(deskDataPage)

    expect(processCollectorFactory).toHaveBeenCalledWith(deskDataPage)

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

  it('mapeia somente o resultado criminal para Consta Restrição na CPI', () => {
    expect(mapDeskDataResultToResearchClassification('SIM_CONSTA_RESTRICAO')).toBe(
      'CONSTA_RESTRICAO'
    )

    expect(mapDeskDataResultToResearchClassification('HA_INFORMACOES')).toBe('HA_INFORMACOES')
  })
})
