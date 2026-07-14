import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '@/automation/deskdata/deskdata-result-ready-waiter'
import { DESKDATA_PDF_EXPORT_SELECTOR } from '@/automation/deskdata/deskdata-pdf-download-controller'

describe('DeskDataResultReadyWaiter', () => {
  it('deve aguardar a rota de resultado e o botão Exportar', async () => {
    let attempts = 0

    const count = vi.fn(async () => {
      attempts += 1

      return attempts >= 3 ? 1 : 0
    })

    const waitForTimeout = vi.fn(async () => undefined)

    const page: DeskDataResultReadyPage = {
      url: () =>
        attempts >= 2
          ? 'https://deskdata.com.br/pessoas/resultado/teste'
          : 'https://deskdata.com.br/pessoas/',
      locator: vi.fn((selector: string) => {
        if (selector !== DESKDATA_PDF_EXPORT_SELECTOR) {
          throw new Error('Seletor inesperado: ' + selector)
        }

        return { count }
      }),
      waitForTimeout
    }

    const result = await new DeskDataResultReadyWaiter({
      searchAttempts: 4,
      searchIntervalMs: 0
    }).waitUntilReady(page)

    expect(result).toEqual({
      status: 'READY',
      resultPath: '/pessoas/resultado/teste'
    })
    expect(count.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(waitForTimeout).toHaveBeenCalledTimes(2)
  })
})
