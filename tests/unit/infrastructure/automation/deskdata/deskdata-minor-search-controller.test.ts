import type { Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { DeskDataMinorSearchController } from '@/infrastructure/automation/deskdata/deskdata-minor-search-controller'
import { DESKDATA_MINOR_SEARCH_SELECTORS } from '@/infrastructure/automation/deskdata/deskdata-selectors'

function setup(notice = true): {
  page: Page
  controller: DeskDataMinorSearchController
  actions: string[]
  readDetails: ReturnType<typeof vi.fn>
  values: Map<string, string>
} {
  const actions: string[] = []
  const values = new Map<string, string>()
  const page = {
    locator: (selector: string) => ({
      count: async () => (selector === DESKDATA_MINOR_SEARCH_SELECTORS.notice ? Number(notice) : 1),
      click: async () => {
        actions.push('back')
      },
      selectOption: async (value: string) => {
        actions.push(value)
        values.set(selector, value)
        return [value]
      },
      fill: async (value: string) => {
        actions.push(selector === DESKDATA_MINOR_SEARCH_SELECTORS.fullName ? 'name' : 'birthdate')
        values.set(selector, value)
      },
      inputValue: async () => values.get(selector) ?? ''
    })
  } as unknown as Page
  const readDetails = vi.fn(async () => ({
    fullName: 'Pessoa Fictícia Teste',
    birthDate: '29/02/2012'
  }))
  const controller = new DeskDataMinorSearchController({
    readDetails,
    dataset: {
      applyApprovedDatasets: async () => {
        actions.push('datasets')
        return { selectedCount: 6, selectedIds: [] }
      }
    },
    submit: {
      submitOnce: async () => {
        actions.push('submit-and-wait')
        return { status: 'SUBMITTED', resultPath: '/pessoas/resultado/' }
      }
    }
  })
  return { page, controller, actions, readDetails, values }
}

describe('segunda consulta DeskData por nome e nascimento', () => {
  it('não lê dados pessoais nem altera a página para consulta normal', async () => {
    const test = setup(false)
    expect(await test.controller.retryIfRequired(test.page, '52998224725')).toBe(false)
    expect(test.readDetails).not.toHaveBeenCalled()
    expect(test.actions).toEqual([])
  })

  it('volta e preenche as duas chaves antes dos conjuntos e do envio', async () => {
    const test = setup()
    expect(await test.controller.retryIfRequired(test.page, '52998224725')).toBe(true)
    expect(test.actions).toEqual([
      'back',
      'fullname',
      'birthdate',
      'name',
      'birthdate',
      'datasets',
      'submit-and-wait'
    ])
    expect(test.values.get(DESKDATA_MINOR_SEARCH_SELECTORS.fullName)).toBe('Pessoa Fictícia Teste')
    expect(test.values.get(DESKDATA_MINOR_SEARCH_SELECTORS.birthDate)).toBe('29/02/2012')
    expect(test.readDetails).toHaveBeenCalledWith('52998224725')
  })

  it('consome a única tentativa inclusive em caso de falha', async () => {
    const test = setup()
    test.readDetails.mockRejectedValue(new Error('Dados inválidos'))
    await expect(test.controller.retryIfRequired(test.page, '52998224725')).rejects.toThrow()
    await expect(test.controller.retryIfRequired(test.page, '52998224725')).rejects.toThrow(
      /tentativa/
    )
    expect(test.actions).toEqual([])
    expect(test.readDetails).toHaveBeenCalledTimes(1)
  })

  it('não reenvia em chamadas concorrentes', async () => {
    const test = setup()
    const results = await Promise.allSettled([
      test.controller.retryIfRequired(test.page, '52998224725'),
      test.controller.retryIfRequired(test.page, '52998224725')
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(test.actions.filter((action) => action === 'submit-and-wait')).toHaveLength(1)
  })

  it('bloqueia resultado que permanece indisponível', async () => {
    const test = setup()
    await expect(test.controller.assertAvailable(test.page)).rejects.toThrow(/indisponível/)
  })

  it('aceita resultado sem aviso', async () => {
    const test = setup(false)
    await expect(test.controller.assertAvailable(test.page)).resolves.toBeUndefined()
  })

  it('interrompe sem enviar se o formulário não mantém os valores', async () => {
    const test = setup()
    const locate = test.page.locator.bind(test.page)
    test.page.locator = ((selector: string) => ({
      ...locate(selector),
      inputValue: async () => 'valor alterado'
    })) as Page['locator']
    await expect(test.controller.retryIfRequired(test.page, '52998224725')).rejects.toThrow()
    expect(test.actions).not.toContain('submit-and-wait')
  })
})
