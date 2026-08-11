import type { CpiResearchCyclePort } from '@/application/ports/research-cycle-ports'
import type { Page } from 'playwright'
import type { CpiFirstResearchOpener } from '../cpi/cpi-first-research-opener'
import type { CpiResearchConfirmedSaveController } from '../cpi/cpi-research-confirmed-save-controller'
import type { CpiResearchIdentityReader } from '../cpi/cpi-research-identity-reader'
import type { CpiResearchPdfPreparationFrame } from '../cpi/cpi-research-pdf-preparation-workflow'
import type { ResearchIdentity } from '@/application/ports/research-preparation-ports'
import type { ResearchPreparationPort } from '@/application/ports/research-cycle-ports'
import { PlaywrightResearchCycleState } from './playwright-research-cycle-state'

const CPI_QUEUE_PATH = '/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx'

export interface CpiQueueReturnPort {
  returnToQueue(page: Page): Promise<void>
}

export interface PlaywrightCpiResearchCycleDependencies {
  opener: Pick<CpiFirstResearchOpener, 'openFirst'>
  identityReader: Pick<CpiResearchIdentityReader, 'read'>
  saveController: Pick<CpiResearchConfirmedSaveController, 'saveOnce'>
  queueReturnController: CpiQueueReturnPort
  createPreparation(detailFrame: CpiResearchPdfPreparationFrame): ResearchPreparationPort
}

export class PlaywrightCpiQueueReturnController implements CpiQueueReturnPort {
  constructor(private readonly delayMs = 3_000) {}

  async returnToQueue(page: Page): Promise<void> {
    await page.waitForTimeout(this.delayMs)
    await page.bringToFront()

    let pathname: string

    try {
      pathname = new URL(page.url()).pathname.toLowerCase()
    } catch {
      throw new Error('A URL atual da CPI não pôde ser validada.')
    }

    if (pathname !== CPI_QUEUE_PATH) {
      throw new Error('A CPI não retornou para a página da fila.')
    }
  }
}

export class PlaywrightCpiResearchCycleAdapter implements CpiResearchCyclePort {
  constructor(
    private readonly cpiPage: Page,
    private readonly dependencies: PlaywrightCpiResearchCycleDependencies,
    private readonly state: PlaywrightResearchCycleState
  ) {}

  async openNext(): Promise<void> {
    this.clearCurrentResearch()

    try {
      await this.dependencies.opener.openFirst(this.cpiPage)
    } catch (error: unknown) {
      this.clearCurrentResearch()
      throw error
    }
  }

  async readIdentity(): Promise<ResearchIdentity> {
    this.clearCurrentResearch()

    try {
      const identity = await this.dependencies.identityReader.read(this.cpiPage)
      this.state.setPendingDetailFramePath(identity.detailFramePath)

      return {
        cpf: identity.cpf,
        maskedCpf: identity.maskedCpf
      }
    } catch (error: unknown) {
      this.clearCurrentResearch()
      throw error
    }
  }

  async bindCurrentResearch(): Promise<void> {
    const expectedDetailFramePath = this.state.takePendingDetailFramePath()

    if (!expectedDetailFramePath) {
      this.clearCurrentResearch()
      throw new Error('O formulário interno da pesquisa não foi resolvido.')
    }

    try {
      const detailFrame = this.findDetailFrame(expectedDetailFramePath)

      this.state.setDetailFrame(detailFrame)
      this.state.setPreparation(this.dependencies.createPreparation(detailFrame))
    } catch (error: unknown) {
      this.clearCurrentResearch()
      throw error
    }
  }

  async saveOnce(): Promise<{ saved: boolean; confirmationAccepted: boolean }> {
    return this.dependencies.saveController.saveOnce(this.cpiPage, this.state.requireDetailFrame())
  }

  async returnToQueue(): Promise<void> {
    await this.dependencies.queueReturnController.returnToQueue(this.cpiPage)
  }

  private findDetailFrame(expectedPath: string): CpiResearchPdfPreparationFrame {
    const normalizedExpectedPath = expectedPath.toLowerCase()
    const detailFrames = this.cpiPage.frames().filter((frame) => {
      try {
        return new URL(frame.url()).pathname.toLowerCase() === normalizedExpectedPath
      } catch {
        return false
      }
    })

    if (detailFrames.length !== 1) {
      throw new Error(
        'O formulário interno da pesquisa deveria possuir exatamente um frame. Encontrados: ' +
          detailFrames.length
      )
    }

    return detailFrames[0] as CpiResearchPdfPreparationFrame
  }

  private clearCurrentResearch(): void {
    this.state.clear()
  }
}
