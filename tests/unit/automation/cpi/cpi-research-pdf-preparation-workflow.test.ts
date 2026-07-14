import type { Frame } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  CpiResearchPdfPreparationWorkflow,
  type CpiResearchPdfAttachmentPort,
  type CpiResearchPdfPreparationFrame,
  type CpiResearchResultPreparationPort
} from '@/automation/cpi/cpi-research-pdf-preparation-workflow'

describe('CpiResearchPdfPreparationWorkflow', () => {
  it('deve preparar, anexar e preparar novamente', async () => {
    const callOrder: string[] = []

    const prepare = vi.fn(async () => {
      callOrder.push('PREPARE_RESULT')

      return {
        classification: 'HA_INFORMACOES' as const,
        selectedResultLabel: 'Há Informações',
        researcherLabel: 'Desk Data',
        primaryResearcherLabel: 'Desk Data',
        statusLabel: 'Respondida',
        responseChanged: false as const,
        saved: false as const
      }
    })

    const attachOnce = vi.fn(async (_frame: Frame, filePath: string) => {
      callOrder.push('ATTACH_PDF')

      return {
        attached: true as const,
        filePath,
        fileName: 'deskdata-teste.pdf',
        sizeBytes: 100
      }
    })

    const resultController: CpiResearchResultPreparationPort = {
      prepare
    }

    const attachmentController: CpiResearchPdfAttachmentPort = {
      attachOnce
    }

    const frame = {} as CpiResearchPdfPreparationFrame

    const result = await new CpiResearchPdfPreparationWorkflow(
      resultController,
      attachmentController
    ).prepareWithAttachment(frame, 'HA_INFORMACOES', 'E:\\PDF-AGENTE-CPI\\deskdata-teste.pdf')

    expect(callOrder).toEqual(['PREPARE_RESULT', 'ATTACH_PDF', 'PREPARE_RESULT'])

    expect(prepare).toHaveBeenCalledTimes(2)
    expect(result.prepared.primaryResearcherLabel).toBe('Desk Data')
    expect(result.attachment.attached).toBe(true)
  })
})
