import type { Dialog, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  CpiResearchConfirmedSaveController,
  type CpiResearchSavePort
} from '@/infrastructure/automation/cpi/cpi-research-confirmed-save-controller'
import type { CpiResearchSaveFrame } from '@/infrastructure/automation/cpi/cpi-research-result-saver'

describe('CpiResearchConfirmedSaveController', () => {
  it('deve aceitar a confirmação esperada da CPI', async () => {
    const callOrder: string[] = []

    const accept = vi.fn(async () => {
      callOrder.push('ACCEPT_DIALOG')
    })

    const dismiss = vi.fn(async () => {
      callOrder.push('DISMISS_DIALOG')
    })

    const dialog = {
      type: vi.fn(() => 'confirm'),
      message: vi.fn(() => 'Deseja Realmente Alterar esta Pesquisa? Resultado >>> Há Informações'),
      accept,
      dismiss
    } as unknown as Dialog

    const waitForEvent = vi.fn(async () => {
      callOrder.push('WAIT_DIALOG')
      return dialog
    })

    const page = {
      waitForEvent
    } as unknown as Page

    const saveOnce = vi.fn(async () => {
      callOrder.push('CLICK_ALTERAR')

      return {
        saved: true as const
      }
    })

    const saver: CpiResearchSavePort = {
      saveOnce
    }

    const frame = {} as CpiResearchSaveFrame

    const result = await new CpiResearchConfirmedSaveController(saver, {
      dialogTimeoutMs: 12_345
    }).saveOnce(page, frame)

    expect(callOrder).toEqual(['WAIT_DIALOG', 'CLICK_ALTERAR', 'ACCEPT_DIALOG'])

    expect(waitForEvent).toHaveBeenCalledWith('dialog', { timeout: 12_345 })
    expect(accept).toHaveBeenCalledTimes(1)
    expect(dismiss).not.toHaveBeenCalled()
    expect(saveOnce).toHaveBeenCalledTimes(1)
    expect(result.saved).toBe(true)
    expect(result.confirmationAccepted).toBe(true)
  })

  it('deve rejeitar um diálogo diferente do esperado', async () => {
    const accept = vi.fn(async () => undefined)
    const dismiss = vi.fn(async () => undefined)

    const dialog = {
      type: vi.fn(() => 'alert'),
      message: vi.fn(() => 'Mensagem inesperada'),
      accept,
      dismiss
    } as unknown as Dialog

    const page = {
      waitForEvent: vi.fn(async () => dialog)
    } as unknown as Page

    const saver: CpiResearchSavePort = {
      saveOnce: vi.fn(async () => ({
        saved: true as const
      }))
    }

    await expect(
      new CpiResearchConfirmedSaveController(saver).saveOnce(page, {} as CpiResearchSaveFrame)
    ).rejects.toThrow('A CPI apresentou um diálogo diferente da confirmação esperada.')

    expect(accept).not.toHaveBeenCalled()
    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
