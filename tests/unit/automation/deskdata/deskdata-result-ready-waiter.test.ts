import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '@/automation/deskdata/deskdata-result-ready-waiter'
import { DESKDATA_PDF_EXPORT_SELECTOR } from '@/automation/deskdata/deskdata-pdf-download-controller'

describe('DeskDataResultReadyWaiter', () => {
  it('waits for the normal result route and Exportar button', async () => {
    let attempts = 0

    const count = vi.fn(async () => {
      attempts += 1
      return attempts >= 3 ? 1 : 0
    })

    const waitForTimeout = vi.fn(async () => undefined)

    const page: DeskDataResultReadyPage = {
      url: () =>
        attempts >= 2
          ? 'https://app.deskdata.com.br/pessoas/resultado/teste'
          : 'https://app.deskdata.com.br/pessoas/',
      locator: vi.fn((selector: string) => {
        if (selector !== DESKDATA_PDF_EXPORT_SELECTOR) {
          throw new Error('Seletor inesperado: ' + selector)
        }

        return { count }
      }),
      waitForTimeout
    }

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 4,
        searchIntervalMs: 617
      }).waitUntilReady(page)
    ).resolves.toEqual({
      status: 'READY',
      resultPath: '/pessoas/resultado/teste'
    })

    expect(waitForTimeout).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 617)
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 617)
  })

  it('accepts the historical result route with a trailing slash', async () => {
    const page: DeskDataResultReadyPage = {
      url: () => 'https://deskdata.com.br/historico/detalhes/?q=Q-TESTE',
      locator: vi.fn((selector: string) => {
        if (selector !== DESKDATA_PDF_EXPORT_SELECTOR) {
          throw new Error('Seletor inesperado: ' + selector)
        }

        return {
          count: async () => 1
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
      resultPath: '/historico/detalhes/'
    })
  })
})
