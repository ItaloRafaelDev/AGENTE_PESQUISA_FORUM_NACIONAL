import { describe, expect, it, vi } from 'vitest'
import {
  CpiResearchResultController,
  type CpiResearchResultFrame
} from '@/automation/cpi/cpi-research-result-controller'

interface FrameOptions {
  resetPrimaryAfterFirstResultClick?: boolean
  delayedResultAttempts?: number
}

interface FrameContext {
  frame: CpiResearchResultFrame
  callOrder: string[]
  readTimeouts: number[]
  getPrimaryResearcher(): string
}

function createFrame(options: FrameOptions = {}): FrameContext {
  const callOrder: string[] = []
  const readTimeouts: number[] = []

  const state = {
    researcher: '* Indefinido *',
    primaryResearcher: '* Indefinido *',
    status: 'Aguardando Pesquisa',
    resultChecked: false
  }

  let resultCountCalls = 0
  let resultClickCalls = 0

  const countResult = async (): Promise<number> => {
    resultCountCalls += 1

    return resultCountCalls > (options.delayedResultAttempts ?? 0) ? 1 : 0
  }

  const frame: CpiResearchResultFrame = {
    locator: vi.fn((selector: string) => {
      if (selector === 'select[name="id_pesq_status"]') {
        return {
          count: async () => 1,
          selectOption: async ({ label }: { label: string }) => {
            callOrder.push('STATUS:' + label)
            state.status = label
          }
        }
      }

      if (selector === 'select[name="id_pesq_status"] option:checked') {
        return {
          count: async () => 1,
          innerText: async (innerTextOptions?: { timeout?: number }) => {
            readTimeouts.push(innerTextOptions?.timeout ?? -1)

            return state.status
          }
        }
      }

      if (selector === 'select[name="id_pesquisador"]') {
        return {
          count: async () => 1,
          selectOption: async ({ label }: { label: string }) => {
            callOrder.push('RESEARCHER:' + label)
            state.researcher = label
          }
        }
      }

      if (selector === 'select[name="id_pesquisador"] option:checked') {
        return {
          count: async () => 1,
          innerText: async (innerTextOptions?: { timeout?: number }) => {
            readTimeouts.push(innerTextOptions?.timeout ?? -1)

            return state.researcher
          }
        }
      }

      if (selector === 'select[name="id_pesquisador_prim"]') {
        return {
          count: async () => 1,
          selectOption: async ({ label }: { label: string }) => {
            callOrder.push('PRIMARY:' + label)
            state.primaryResearcher = label
          }
        }
      }

      if (selector === 'select[name="id_pesquisador_prim"] option:checked') {
        return {
          count: async () => 1,
          innerText: async (innerTextOptions?: { timeout?: number }) => {
            readTimeouts.push(innerTextOptions?.timeout ?? -1)

            return state.primaryResearcher
          }
        }
      }

      if (selector === '#consta2') {
        return {
          count: countResult,
          isChecked: async () => state.resultChecked
        }
      }

      if (selector === 'label[for="consta2"]') {
        return {
          count: countResult,
          click: async () => {
            resultClickCalls += 1
            callOrder.push('RESULT:Há Informações')
            state.resultChecked = true

            if (options.resetPrimaryAfterFirstResultClick && resultClickCalls === 1) {
              state.primaryResearcher = '* Indefinido *'
            }
          }
        }
      }

      throw new Error('Seletor inesperado: ' + selector)
    })
  }

  return {
    frame,
    callOrder,
    readTimeouts,
    getPrimaryResearcher: () => state.primaryResearcher
  }
}

describe('CpiResearchResultController', () => {
  it('deve selecionar o status antes das duas fontes', async () => {
    const context = createFrame()

    const result = await new CpiResearchResultController({
      resultSearchIntervalMs: 0,
      readTimeoutMs: 4_567
    }).prepare(context.frame, 'HA_INFORMACOES')

    expect(context.callOrder).toEqual([
      'STATUS:Respondida',
      'RESEARCHER:Desk Data',
      'PRIMARY:Desk Data',
      'RESULT:Há Informações'
    ])

    expect(result.primaryResearcherLabel).toBe('Desk Data')
    expect(context.getPrimaryResearcher()).toBe('Desk Data')
    expect(context.readTimeouts).toEqual([4_567, 4_567, 4_567])
  })

  it('deve reaplicar os campos quando a renderização restaurar o segundo pesquisador', async () => {
    const context = createFrame({
      resetPrimaryAfterFirstResultClick: true
    })

    await new CpiResearchResultController({
      resultSearchIntervalMs: 0,
      stabilizationAttempts: 3
    }).prepare(context.frame, 'HA_INFORMACOES')

    expect(context.getPrimaryResearcher()).toBe('Desk Data')
    expect(context.callOrder.filter((item) => item === 'PRIMARY:Desk Data')).toHaveLength(2)
  })

  it('deve aguardar a seção dinâmica de resultado', async () => {
    const context = createFrame({
      delayedResultAttempts: 2
    })

    await new CpiResearchResultController({
      resultSearchAttempts: 5,
      resultSearchIntervalMs: 0
    }).prepare(context.frame, 'HA_INFORMACOES')

    expect(context.getPrimaryResearcher()).toBe('Desk Data')
  })
})
