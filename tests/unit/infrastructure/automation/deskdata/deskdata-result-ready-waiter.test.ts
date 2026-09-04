import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '@/infrastructure/automation/deskdata/deskdata-result-ready-waiter'
import { DESKDATA_PDF_EXPORT_SELECTOR } from '@/infrastructure/automation/deskdata/deskdata-selectors'

describe('DeskDataResultReadyWaiter', () => {
  it('libera o fluxo quando a página de resultado possui um único botão Exportar', async () => {
    const page: DeskDataResultReadyPage = {
      url: () => 'https://app.deskdata.com.br/pessoas/resultado/',
      locator: vi.fn((selector: string) => {
        if (selector !== DESKDATA_PDF_EXPORT_SELECTOR) {
          throw new Error('Seletor inesperado: ' + selector)
        }

        return {
          count: async () => 1,
          textContent: async () => null
        }
      }),
      waitForTimeout: vi.fn(async () => undefined)
    }

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 1,
        searchIntervalMs: 0
      }).waitUntilReady(page)
    ).resolves.toEqual({
      status: 'READY',
      resultPath: '/pessoas/resultado/',
      expectedProcessCount: 0,
      expectedProcessNumbers: []
    })
  })

  it('continua aguardando enquanto o botão Exportar ainda não estiver disponível', async () => {
    let attempts = 0
    const waitForTimeout = vi.fn(async () => undefined)
    const page: DeskDataResultReadyPage = {
      url: () => 'https://app.deskdata.com.br/pessoas/resultado/',
      locator: vi.fn(() => ({
        count: async () => {
          attempts += 1
          return attempts >= 3 ? 1 : 0
        },
        textContent: async () => null
      })),
      waitForTimeout
    }

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 3,
        searchIntervalMs: 500
      }).waitUntilReady(page)
    ).resolves.toMatchObject({ status: 'READY' })

    expect(waitForTimeout).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 500)
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 500)
  })
})
