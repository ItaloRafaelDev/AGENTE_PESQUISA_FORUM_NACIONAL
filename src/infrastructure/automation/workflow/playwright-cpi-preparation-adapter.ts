import type { CpiResearchPreparationPort } from '@/application/ports/research-preparation-ports'
import type {
  CpiResearchPdfPreparationFrame,
  CpiResearchPdfPreparationWorkflow
} from '../cpi/cpi-research-pdf-preparation-workflow'

export interface CpiResearchPdfPreparationPort {
  prepareWithAttachment: CpiResearchPdfPreparationWorkflow['prepareWithAttachment']
}

export class PlaywrightCpiPreparationAdapter implements CpiResearchPreparationPort {
  constructor(
    private readonly detailFrame: CpiResearchPdfPreparationFrame,
    private readonly workflow: CpiResearchPdfPreparationPort
  ) {}

  async prepareAndAttach(
    classification: Parameters<CpiResearchPreparationPort['prepareAndAttach']>[0],
    reportReference: string
  ): Promise<{
    attached: boolean
    requiredFieldsConfirmed: boolean
  }> {
    const result = await this.workflow.prepareWithAttachment(
      this.detailFrame,
      classification,
      reportReference
    )

    return {
      attached: result.attachment.attached,
      requiredFieldsConfirmed: Boolean(result.prepared)
    }
  }
}
