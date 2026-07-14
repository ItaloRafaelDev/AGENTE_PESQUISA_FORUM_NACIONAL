import type { Frame } from 'playwright'
import type { ResearchClassification } from '../../domain/research/research-classification'
import {
  CpiResearchPdfAttachmentController,
  type CpiResearchPdfAttachmentResult
} from './cpi-research-pdf-attachment-controller'
import {
  CpiResearchResultController,
  type CpiResearchResultFrame,
  type PreparedCpiResearchResult
} from './cpi-research-result-controller'

export type CpiResearchPdfPreparationFrame = Frame & CpiResearchResultFrame

export interface CpiResearchResultPreparationPort {
  prepare(
    frame: CpiResearchResultFrame,
    classification: ResearchClassification
  ): Promise<PreparedCpiResearchResult>
}

export interface CpiResearchPdfAttachmentPort {
  attachOnce(frame: Frame, filePath: string): Promise<CpiResearchPdfAttachmentResult>
}

export interface CpiResearchPdfPreparationResult {
  prepared: PreparedCpiResearchResult
  attachment: CpiResearchPdfAttachmentResult
}

export class CpiResearchPdfPreparationWorkflow {
  constructor(
    private readonly resultController: CpiResearchResultPreparationPort = new CpiResearchResultController(),
    private readonly attachmentController: CpiResearchPdfAttachmentPort = new CpiResearchPdfAttachmentController()
  ) {}

  async prepareWithAttachment(
    frame: CpiResearchPdfPreparationFrame,
    classification: ResearchClassification,
    filePath: string
  ): Promise<CpiResearchPdfPreparationResult> {
    await this.resultController.prepare(frame, classification)

    const attachment = await this.attachmentController.attachOnce(frame, filePath)

    const prepared = await this.resultController.prepare(frame, classification)

    return {
      prepared,
      attachment
    }
  }
}
