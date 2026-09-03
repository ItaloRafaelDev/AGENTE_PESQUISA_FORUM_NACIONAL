import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataResultReadyWaiter,
  type DeskDataResultReadyPage
} from '@/infrastructure/automation/deskdata/deskdata-result-ready-waiter'
import {
  DESKDATA_PDF_EXPORT_SELECTOR,
  DESKDATA_PROCESSES_SECTION_SELECTOR,
  DESKDATA_PROCESSES_UPDATED_SELECTOR
} from '@/infrastructure/automation/deskdata/deskdata-selectors'

describe('DeskDataResultReadyWaiter', () => {
  it('waits for stable process content after the update confirmation', async () => {
    let attempts = 0

    const exportCount = vi.fn(async () => {
      attempts += 1
      return 1
    })
    const processesTextContent = vi.fn(async () =>
      attempts <= 2
        ? 'Processos 1000878-26.2017.5.02.0067'
        : 'Processos 1000878-26.2017.5.02.0067 0010652-30.2020.8.26.0502'
    )
    const processesUpdatedCount = vi.fn(async () => (attempts >= 2 ? 1 : 0))

    const waitForTimeout = vi.fn(async () => undefined)

    const page: DeskDataResultReadyPage = {
      url: () => 'https://app.deskdata.com.br/pessoas/resultado/teste',
      locator: vi.fn((selector: string) => {
        if (selector === DESKDATA_PDF_EXPORT_SELECTOR) {
          return {
            count: exportCount,
            textContent: async () => null
          }
        }

        if (selector === DESKDATA_PROCESSES_SECTION_SELECTOR) {
          return {
            count: async () => 1,
            textContent: processesTextContent
          }
        }

        if (selector === DESKDATA_PROCESSES_UPDATED_SELECTOR) {
          return {
            count: processesUpdatedCount,
            textContent: async () => null
          }
        }

        throw new Error('Seletor inesperado: ' + selector)
      }),
      waitForTimeout
    }

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 5,
        searchIntervalMs: 617,
        settledContentChecks: 3
      }).waitUntilReady(page)
    ).resolves.toEqual({
      status: 'READY',
      resultPath: '/pessoas/resultado/teste'
    })

    expect(waitForTimeout).toHaveBeenCalledTimes(4)
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 617)
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 617)
    expect(waitForTimeout).toHaveBeenNthCalledWith(3, 617)
    expect(waitForTimeout).toHaveBeenNthCalledWith(4, 617)
    expect(processesTextContent).toHaveBeenCalledTimes(5)
    expect(processesUpdatedCount).toHaveBeenCalledTimes(5)
  })

  it('does not accept the no-processes message before the update confirmation', async () => {
    let noticeAttempts = 0
    const processesUpdatedCount = vi.fn(async () => {
      noticeAttempts += 1
      return noticeAttempts >= 3 ? 1 : 0
    })
    const waitForTimeout = vi.fn(async () => undefined)

    const page: DeskDataResultReadyPage = {
      url: () => 'https://deskdata.com.br/historico/detalhes/?q=Q-TESTE',
      locator: vi.fn((selector: string) => {
        if (selector === DESKDATA_PDF_EXPORT_SELECTOR) {
          return {
            count: async () => 1,
            textContent: async () => null
          }
        }

        if (selector === DESKDATA_PROCESSES_SECTION_SELECTOR) {
          return {
            count: async () => 1,
            textContent: async () => 'Processos Não foram encontrados processos.'
          }
        }

        if (selector === DESKDATA_PROCESSES_UPDATED_SELECTOR) {
          return {
            count: processesUpdatedCount,
            textContent: async () => null
          }
        }

        throw new Error('Seletor inesperado: ' + selector)
      }),
      waitForTimeout
    }

    await expect(
      new DeskDataResultReadyWaiter({
        searchAttempts: 3,
        searchIntervalMs: 503,
        settledContentChecks: 1
      }).waitUntilReady(page)
    ).resolves.toEqual({
      status: 'READY',
      resultPath: '/historico/detalhes/'
    })

    expect(waitForTimeout).toHaveBeenCalledTimes(2)
    expect(waitForTimeout).toHaveBeenNthCalledWith(1, 503)
    expect(waitForTimeout).toHaveBeenNthCalledWith(2, 503)
    expect(processesUpdatedCount).toHaveBeenCalledTimes(3)
  })
})
