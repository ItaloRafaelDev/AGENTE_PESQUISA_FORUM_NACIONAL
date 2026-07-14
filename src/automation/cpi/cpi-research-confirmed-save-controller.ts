import type { Dialog, Page } from 'playwright'
import {
  CpiResearchResultSaver,
  type CpiResearchSaveFrame,
  type CpiResearchSaveResult
} from './cpi-research-result-saver'

const EXPECTED_CONFIRMATION_PATTERN = /deseja\s+realmente\s+alterar\s+esta\s+pesquisa/i

export interface CpiResearchSavePort {
  saveOnce(frame: CpiResearchSaveFrame): Promise<CpiResearchSaveResult>
}

export interface CpiResearchConfirmedSaveOptions {
  dialogTimeoutMs?: number
}

export interface CpiResearchConfirmedSaveResult extends CpiResearchSaveResult {
  confirmationAccepted: true
  confirmationMessage: string
}

export class CpiResearchConfirmedSaveController {
  private readonly dialogTimeoutMs: number

  constructor(
    private readonly saver: CpiResearchSavePort = new CpiResearchResultSaver(),
    options: CpiResearchConfirmedSaveOptions = {}
  ) {
    this.dialogTimeoutMs = options.dialogTimeoutMs ?? 10_000

    if (this.dialogTimeoutMs < 1) {
      throw new Error('O tempo limite da confirmação deve ser maior que zero.')
    }
  }

  async saveOnce(page: Page, frame: CpiResearchSaveFrame): Promise<CpiResearchConfirmedSaveResult> {
    const dialogPromise = page.waitForEvent('dialog', {
      timeout: this.dialogTimeoutMs
    })

    const savePromise = this.saver.saveOnce(frame)

    let dialog: Dialog

    try {
      dialog = await dialogPromise
    } catch {
      await savePromise.catch(() => undefined)

      throw new Error('A confirmação da CPI não apareceu após clicar em Alterar.')
    }

    const confirmationMessage = this.sanitizeMessage(dialog.message())

    const isExpectedConfirmation =
      dialog.type() === 'confirm' && EXPECTED_CONFIRMATION_PATTERN.test(confirmationMessage)

    if (!isExpectedConfirmation) {
      await dialog.dismiss()
      await savePromise.catch(() => undefined)

      throw new Error('A CPI apresentou um diálogo diferente da confirmação esperada.')
    }

    await dialog.accept()

    const saveResult = await savePromise

    return {
      ...saveResult,
      confirmationAccepted: true,
      confirmationMessage
    }
  }

  private sanitizeMessage(value: string): string {
    return value
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[DADO_REMOVIDO]')
      .replace(/\b\d{11}\b/g, '[DADO_REMOVIDO]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
  }
}
