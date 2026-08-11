import { setTimeout as wait } from 'node:timers/promises'
import { open, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { Frame, Locator } from 'playwright'
import { CPI_RESEARCH_PDF_UPLOAD_SELECTOR } from './cpi-selectors'

type AttachmentState = 'IDLE' | 'ATTACHING' | 'ATTACHED'

interface AttachedFileState {
  count: number
  name: string
}

export interface CpiResearchPdfAttachmentControllerOptions {
  controlSearchAttempts?: number
  controlSearchIntervalMs?: number
}

export interface CpiResearchPdfAttachmentResult {
  attached: true
  filePath: string
  fileName: string
  sizeBytes: number
}

export class CpiResearchPdfAttachmentController {
  private readonly controlSearchAttempts: number
  private readonly controlSearchIntervalMs: number
  private state: AttachmentState = 'IDLE'

  constructor(options: CpiResearchPdfAttachmentControllerOptions = {}) {
    this.controlSearchAttempts = options.controlSearchAttempts ?? 40

    this.controlSearchIntervalMs = options.controlSearchIntervalMs ?? 250

    if (this.controlSearchAttempts < 1) {
      throw new Error('O número de tentativas do campo de anexo deve ser maior que zero.')
    }

    if (this.controlSearchIntervalMs < 0) {
      throw new Error('O intervalo do campo de anexo não pode ser negativo.')
    }
  }

  async attachOnce(frame: Frame, filePath: string): Promise<CpiResearchPdfAttachmentResult> {
    if (this.state !== 'IDLE') {
      throw new Error('O PDF já foi anexado ou está sendo anexado nesta execução.')
    }

    this.state = 'ATTACHING'

    try {
      const sizeBytes = await this.validatePdf(filePath)
      const fileName = basename(filePath)

      const uploadControl = await this.waitForUploadControl(frame)

      await uploadControl.setInputFiles(filePath)

      const attachedState = await uploadControl.evaluate<AttachedFileState>((element) => {
        const input = element as HTMLInputElement

        return {
          count: input.files?.length ?? 0,
          name: input.files?.item(0)?.name ?? ''
        }
      })

      if (attachedState.count !== 1) {
        throw new Error('A CPI não confirmou exatamente um arquivo no campo de anexo.')
      }

      if (attachedState.name !== fileName) {
        throw new Error('O arquivo confirmado no campo da CPI não corresponde ao PDF selecionado.')
      }

      this.state = 'ATTACHED'

      return {
        attached: true,
        filePath,
        fileName,
        sizeBytes
      }
    } catch (error: unknown) {
      this.state = 'IDLE'

      throw error
    }
  }

  private async waitForUploadControl(frame: Frame): Promise<Locator> {
    const uploadControl = frame.locator(CPI_RESEARCH_PDF_UPLOAD_SELECTOR)

    for (let attempt = 0; attempt < this.controlSearchAttempts; attempt += 1) {
      const count = await uploadControl.count()

      if (count === 1) {
        return uploadControl
      }

      if (count > 1) {
        throw new Error(
          'O campo de anexo deveria possuir exatamente um controle. Encontrados: ' + count
        )
      }

      if (attempt < this.controlSearchAttempts - 1) {
        await wait(this.controlSearchIntervalMs)
      }
    }

    throw new Error('O campo de anexo deveria possuir exatamente um controle. Encontrados: 0')
  }

  private async validatePdf(filePath: string): Promise<number> {
    if (extname(filePath).toLowerCase() !== '.pdf') {
      throw new Error('O arquivo selecionado não possui extensão PDF.')
    }

    const fileStat = await stat(filePath)

    if (!fileStat.isFile() || fileStat.size < 5) {
      throw new Error('O arquivo PDF selecionado está vazio ou inválido.')
    }

    const signature = Buffer.alloc(5)
    const fileHandle = await open(filePath, 'r')

    try {
      const readResult = await fileHandle.read(signature, 0, signature.length, 0)

      if (readResult.bytesRead !== signature.length || signature.toString('ascii') !== '%PDF-') {
        throw new Error('O arquivo selecionado não possui uma assinatura PDF válida.')
      }
    } finally {
      await fileHandle.close()
    }

    return fileStat.size
  }
}
