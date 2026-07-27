import type { BrowserContext, Frame, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { CpiResearchPdfPreparationFrame } from '@/automation/cpi/cpi-research-pdf-preparation-workflow'
import type { FullResearchPreparationResult } from '@/automation/flow/full-research-preparation-workflow'
import {
  SingleResearchCycle,
  type SingleResearchCycleDependencies
} from '@/automation/flow/single-research-cycle'

const DETAIL_FRAME_PATH = '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'

describe('SingleResearchCycle historical DeskData result', () => {
  it('closes the historical popup only after CPI save and prepares the main page', async () => {
    const order: string[] = []
    let mainPreparationCalls = 0

    const detailFrame = {
      url: () => 'https://adm.cpicentral.com.br' + DETAIL_FRAME_PATH
    } as unknown as Frame

    const cpiPage = {
      frames: () => [detailFrame]
    } as unknown as Page

    const mainDeskDataPage = {
      url: () => 'https://app.deskdata.com.br/pessoas/'
    } as unknown as Page

    let popupClosed = false

    const historicalPage = {
      isClosed: () => popupClosed,
      close: vi.fn(async () => {
        order.push('CLOSE_HISTORICAL_POPUP')
        popupClosed = true
      })
    } as unknown as Page

    const preparation: FullResearchPreparationResult = {
      maskedCpf: '***.***.***-01',
      selectedDatasetCount: 6,
      classification: {
        result: 'HA_INFORMACOES',
        reason: 'NO_CRIMINAL_SPHERE',
        totalProcesses: 0,
        normalizedSpheres: [],
        classification: 'HA_INFORMACOES'
      },
      pdf: {
        filePath: 'E:\\PDF-AGENTE-CPI\\deskdata.pdf',
        sizeBytes: 100
      },
      cpi: {
        prepared: {
          classification: 'HA_INFORMACOES',
          selectedResultLabel: 'Ha Informacoes',
          researcherLabel: 'Desk Data',
          primaryResearcherLabel: 'Desk Data',
          statusLabel: 'Respondida',
          responseChanged: false,
          saved: false
        },
        attachment: {
          attached: true,
          filePath: 'E:\\PDF-AGENTE-CPI\\deskdata.pdf',
          fileName: 'deskdata.pdf',
          sizeBytes: 100
        }
      },
      detailFrame: detailFrame as CpiResearchPdfPreparationFrame,
      deskDataResultPage: historicalPage,
      closeDeskDataResultPageAfterSave: true
    }

    const dependencies: SingleResearchCycleDependencies = {
      opener: {
        openFirst: vi.fn(async () => ({
          availableRows: 1,
          detailFramePath: DETAIL_FRAME_PATH
        }))
      },
      identityReader: {
        read: vi.fn(async () => ({
          cpf: '12345678901',
          maskedCpf: '***.***.***-01',
          detailFramePath: DETAIL_FRAME_PATH
        }))
      },
      nextSearchController: {
        prepare: vi.fn(async (page) => {
          expect(page).toBe(mainDeskDataPage)
          mainPreparationCalls += 1

          order.push(mainPreparationCalls === 1 ? 'PREPARE_MAIN_BEFORE' : 'PREPARE_MAIN_AFTER')

          return {
            status: 'READY' as const,
            pagePath: '/pessoas/' as const,
            cpfCleared: true as const
          }
        })
      },
      preparationWorkflow: {
        prepare: vi.fn(async () => {
          order.push('PREPARE_RESEARCH')
          return preparation
        })
      },
      saveController: {
        saveOnce: vi.fn(async () => {
          order.push('SAVE_CPI')

          return {
            saved: true as const,
            confirmationAccepted: true as const,
            confirmationMessage: 'Confirmado'
          }
        })
      },
      queueReturnController: {
        returnToQueue: vi.fn(async () => {
          order.push('RETURN_TO_QUEUE')
        })
      }
    }

    await new SingleResearchCycle(dependencies).run({
      context: {} as BrowserContext,
      cpiPage,
      deskDataPage: mainDeskDataPage
    })

    expect(order).toEqual([
      'PREPARE_MAIN_BEFORE',
      'PREPARE_RESEARCH',
      'SAVE_CPI',
      'CLOSE_HISTORICAL_POPUP',
      'PREPARE_MAIN_AFTER',
      'RETURN_TO_QUEUE'
    ])

    expect(historicalPage.close).toHaveBeenCalledWith({
      runBeforeUnload: false
    })

    expect(popupClosed).toBe(true)
  })
})
