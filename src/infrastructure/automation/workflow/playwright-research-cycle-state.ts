import type { ResearchPreparationPort } from '@/application/ports/research-cycle-ports'
import type { CpiResearchPdfPreparationFrame } from '../cpi/cpi-research-pdf-preparation-workflow'

export class PlaywrightResearchCycleState {
  private detailFrame: CpiResearchPdfPreparationFrame | null = null
  private preparation: ResearchPreparationPort | null = null
  private pendingDetailFramePath: string | null = null

  setPendingDetailFramePath(path: string): void {
    this.pendingDetailFramePath = path
  }

  takePendingDetailFramePath(): string | null {
    const path = this.pendingDetailFramePath
    this.pendingDetailFramePath = null

    return path
  }

  setDetailFrame(detailFrame: CpiResearchPdfPreparationFrame): void {
    this.detailFrame = detailFrame
  }

  requireDetailFrame(): CpiResearchPdfPreparationFrame {
    if (!this.detailFrame) {
      throw new Error('O formulário interno da pesquisa não foi resolvido.')
    }

    return this.detailFrame
  }

  setPreparation(preparation: ResearchPreparationPort): void {
    this.preparation = preparation
  }

  requirePreparation(): ResearchPreparationPort {
    if (!this.preparation) {
      throw new Error('A preparação da pesquisa não foi concluída antes da gravação.')
    }

    return this.preparation
  }

  clear(): void {
    this.detailFrame = null
    this.preparation = null
    this.pendingDetailFramePath = null
  }
}
