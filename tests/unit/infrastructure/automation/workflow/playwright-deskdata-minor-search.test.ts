import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { PlaywrightDeskDataResearchAdapter } from '@/infrastructure/automation/workflow/playwright-deskdata-research-adapter'
import { PlaywrightDeskDataCycleAdapter } from '@/infrastructure/automation/workflow/playwright-deskdata-cycle-adapter'
import { PlaywrightResearchPreparationState } from '@/infrastructure/automation/workflow/playwright-research-preparation-state'

function setup(retry = true): {
  adapter: PlaywrightDeskDataResearchAdapter
  minorSearch: {
    retryIfRequired: ReturnType<typeof vi.fn>
    assertAvailable: ReturnType<typeof vi.fn>
  }
  resolve: ReturnType<typeof vi.fn>
  calls: string[]
  state: PlaywrightResearchPreparationState
  page: Page
} {
  const calls: string[] = []
  const page = { isClosed: () => false, close: vi.fn() } as unknown as Page
  const state = new PlaywrightResearchPreparationState()
  const minorSearch = {
    retryIfRequired: vi.fn(async () => {
      calls.push('fallback')
      return retry
    }),
    assertAvailable: vi.fn(async () => {
      calls.push('check-warning')
    })
  }
  const resolve = vi.fn(async () => {
    calls.push('resolve')
    return {
      page,
      source: 'DIRECT_RESULT' as const,
      resultPath: '/pessoas/resultado/',
      closeAfterConfirmedSave: false
    }
  })
  const adapter = new PlaywrightDeskDataResearchAdapter(
    page,
    {
      cpfForm: { fillCpf: async () => ({ cpf: '52998224725', maskedCpf: '***.***.***-25' }) },
      dataset: { applyApprovedDatasets: async () => ({ selectedCount: 6, selectedIds: [] }) },
      submit: {
        submitOnce: async () => ({ status: 'SUBMITTED', resultPath: '/pessoas/resultado/' })
      },
      resultPageResolver: { resolve },
      resultReady: {
        waitUntilReady: async () => {
          calls.push('ready')
          return {
            status: 'READY',
            resultPath: '/pessoas/resultado/',
            expectedProcessCount: 0,
            expectedProcessNumbers: []
          }
        }
      },
      minorSearch
    },
    state
  )
  return { adapter, minorSearch, resolve, calls, state, page }
}

describe('preparação do resultado para menor de idade', () => {
  it('resolve a segunda consulta e verifica o aviso antes de liberar o relatório', async () => {
    const test = setup()
    await test.adapter.fillCpf('52998224725')
    await test.adapter.submitOnce()
    await test.adapter.waitUntilResultReady()
    expect(test.calls).toEqual(['resolve', 'fallback', 'resolve', 'check-warning', 'ready'])
    expect(test.minorSearch.retryIfRequired).toHaveBeenCalledWith(test.page, '52998224725')
    expect(test.state.requireResolvedResult().resultPage).toBe(test.page)
  })

  it('mantém apenas uma consulta quando não existe o aviso', async () => {
    const test = setup(false)
    await test.adapter.fillCpf('52998224725')
    await test.adapter.waitUntilResultReady()
    expect(test.calls).toEqual(['resolve', 'fallback', 'ready'])
  })

  it('não libera relatório nem permite nova tentativa quando o aviso reaparece', async () => {
    const test = setup()
    test.minorSearch.assertAvailable.mockRejectedValue(new Error('Busca indisponível'))
    await test.adapter.fillCpf('52998224725')
    await expect(test.adapter.waitUntilResultReady()).rejects.toThrow('Busca indisponível')
    expect(test.calls).not.toContain('ready')
    expect(() => test.state.requireResolvedResult()).toThrow()
    await expect(test.adapter.waitUntilResultReady()).rejects.toThrow()
    expect(test.minorSearch.retryIfRequired).toHaveBeenCalledTimes(1)
  })

  it('preserva a responsabilidade de fechar a aba histórica após a segunda consulta', async () => {
    const test = setup()
    const close = vi.fn(async () => undefined)
    const historicalPage = { isClosed: () => false, close } as unknown as Page
    test.resolve.mockResolvedValue({
      page: historicalPage,
      source: 'DIRECT_RESULT',
      resultPath: '/historico/detalhes/',
      closeAfterConfirmedSave: true
    })
    await test.adapter.fillCpf('52998224725')
    await test.adapter.waitUntilResultReady()
    const cycle = new PlaywrightDeskDataCycleAdapter(
      test.page,
      { prepare: { prepare: vi.fn() } },
      test.state
    )

    await cycle.closeHistoricalResult()

    expect(close).toHaveBeenCalledWith({ runBeforeUnload: false })
    expect(() => test.state.requireResolvedResult()).toThrow()
  })

  it('fecha somente a aba histórica quando o aviso reaparece após a tentativa', async () => {
    const test = setup()
    const close = vi.fn(async () => undefined)
    const historicalPage = { isClosed: () => false, close } as unknown as Page
    test.resolve.mockResolvedValue({
      page: historicalPage,
      source: 'DIRECT_RESULT',
      resultPath: '/historico/detalhes/',
      closeAfterConfirmedSave: true
    })
    test.minorSearch.assertAvailable.mockRejectedValue(new Error('Busca indisponível'))

    await test.adapter.fillCpf('52998224725')
    await expect(test.adapter.waitUntilResultReady()).rejects.toThrow('Busca indisponível')

    expect(close).toHaveBeenCalledWith({ runBeforeUnload: false })
    expect(test.page.close).not.toHaveBeenCalled()
  })
})
