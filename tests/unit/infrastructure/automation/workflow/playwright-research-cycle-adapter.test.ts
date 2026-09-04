import { ExecutionControl } from '@/application/agent/execution-control'
import { ContinuousResearchStageError } from '@/application/agent/continuous-research-stage'
import { ApplicationError } from '@/application/errors/application-error'
import type {
  ResearchPreparationPort,
  RunResearchCycleDependencies
} from '@/application/ports/research-cycle-ports'
import type { PreparedResearch } from '@/application/ports/research-preparation-ports'
import { describe, expect, it, vi } from 'vitest'
import { PlaywrightCpiResearchCycleAdapter } from '@/infrastructure/automation/workflow/playwright-cpi-research-cycle-adapter'
import { PlaywrightDeskDataCycleAdapter } from '@/infrastructure/automation/workflow/playwright-deskdata-cycle-adapter'
import { PlaywrightResearchCycleAdapter } from '@/infrastructure/automation/workflow/playwright-research-cycle-adapter'
import { PlaywrightResearchCycleState } from '@/infrastructure/automation/workflow/playwright-research-cycle-state'
import { PlaywrightResearchPreparationState } from '@/infrastructure/automation/workflow/playwright-research-preparation-state'

const SYNTHETIC_CPF = '00000000000'
const MASKED_SYNTHETIC_CPF = '***.***.***-00'

const preparedResearch: PreparedResearch = {
  maskedCpf: MASKED_SYNTHETIC_CPF,
  selectedDatasetCount: 2,
  classification: {
    classification: 'HA_INFORMACOES',
    evidence: {
      result: 'NAO_CONSTA_RESTRICAO',
      reason: 'NO_CRIMINAL_SPHERE',
      totalProcesses: 0,
      normalizedSpheres: []
    }
  },
  report: {
    reference: 'synthetic-report-reference',
    compatibilityPath: 'opaque-synthetic-compatibility-reference',
    sizeBytes: 128
  },
  attachmentConfirmed: true,
  requiredFieldsConfirmed: true
}

function createDependencies(input: {
  calls: string[]
  preparation?: ResearchPreparationPort
  deskData?: RunResearchCycleDependencies['deskData']
  saveOnce?: RunResearchCycleDependencies['cpi']['saveOnce']
}): RunResearchCycleDependencies {
  return {
    cpi: {
      openNext: async () => void input.calls.push('open'),
      readIdentity: async () => {
        input.calls.push('identity')
        return { cpf: SYNTHETIC_CPF, maskedCpf: MASKED_SYNTHETIC_CPF }
      },
      bindCurrentResearch: async () => void input.calls.push('bind'),
      saveOnce:
        input.saveOnce ??
        (async () => {
          input.calls.push('save')
          return { saved: true, confirmationAccepted: true }
        }),
      returnToQueue: async () => void input.calls.push('return')
    },
    deskData: input.deskData ?? {
      prepareNextSearch: async () => void input.calls.push('next'),
      closeHistoricalResult: async () => void input.calls.push('cleanup')
    },
    preparation: input.preparation ?? {
      execute: async () => {
        input.calls.push('preparation')
        return preparedResearch
      }
    }
  }
}

describe('PlaywrightResearchCycleAdapter', () => {
  it('keeps application sequencing, stage notifications and non-idempotent calls exact', async () => {
    const calls: string[] = []
    const openNext = vi.fn(async () => void calls.push('open'))
    const readIdentity = vi.fn(async () => {
      calls.push('identity')
      return { cpf: SYNTHETIC_CPF, maskedCpf: MASKED_SYNTHETIC_CPF }
    })
    const bindCurrentResearch = vi.fn(async () => void calls.push('bind'))
    const execute = vi.fn(async () => {
      calls.push('preparation')
      return preparedResearch
    })
    const saveOnce = vi.fn(async () => {
      calls.push('save')
      return { saved: true, confirmationAccepted: true }
    })
    const returnToQueue = vi.fn(async () => void calls.push('return'))
    const stages: string[] = []
    const adapter = new PlaywrightResearchCycleAdapter({
      cpi: { openNext, readIdentity, bindCurrentResearch, saveOnce, returnToQueue },
      deskData: {
        closeHistoricalResult: async () => void calls.push('cleanup'),
        prepareNextSearch: async () => void calls.push('next')
      },
      preparation: { execute }
    })

    await adapter.execute({
      token: new ExecutionControl().token,
      hooks: { onStage: (stage) => stages.push(stage) }
    })

    expect(calls).toEqual([
      'open',
      'identity',
      'bind',
      'next',
      'preparation',
      'save',
      'cleanup',
      'next',
      'return'
    ])
    expect(stages).toEqual([
      'OPENING_CPI_RESEARCH',
      'READING_CPI_IDENTITY',
      'READING_CPI_IDENTITY',
      'PREPARING_DESKDATA',
      'PREPARING_CPI_RESULT',
      'SAVING_CPI',
      'PREPARING_NEXT_SEARCH',
      'RETURNING_TO_QUEUE'
    ])
    expect(openNext).toHaveBeenCalledTimes(1)
    expect(readIdentity).toHaveBeenCalledTimes(1)
    expect(bindCurrentResearch).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(saveOnce).toHaveBeenCalledTimes(1)
    expect(returnToQueue).toHaveBeenCalledTimes(1)
  })

  it('does not save or return when preparation fails', async () => {
    const calls: string[] = []
    const preparationFailure = new Error('synthetic preparation failure')
    const saveOnce = vi.fn(async () => ({ saved: true, confirmationAccepted: true }))
    const returnToQueue = vi.fn(async () => undefined)
    const dependencies = createDependencies({
      calls,
      preparation: { execute: vi.fn().mockRejectedValue(preparationFailure) },
      saveOnce
    })
    dependencies.cpi.returnToQueue = returnToQueue

    await expect(
      new PlaywrightResearchCycleAdapter(dependencies).execute({
        token: new ExecutionControl().token
      })
    ).rejects.toMatchObject({
      stage: 'PREPARING_CPI_RESULT',
      message: 'Não foi possível concluir a etapa do ciclo de pesquisa.'
    })
    expect(saveOnce).not.toHaveBeenCalled()
    expect(returnToQueue).not.toHaveBeenCalled()
  })

  it('honors STOP only before the cycle and does not treat PAUSE as cancellation', async () => {
    const paused = new ExecutionControl()
    paused.requestPause()
    const pausedCalls: string[] = []

    await new PlaywrightResearchCycleAdapter(createDependencies({ calls: pausedCalls })).execute({
      token: paused.token
    })
    expect(pausedCalls).toContain('save')

    const stopped = new ExecutionControl()
    stopped.requestStop()
    const stoppedCalls: string[] = []

    await expect(
      new PlaywrightResearchCycleAdapter(createDependencies({ calls: stoppedCalls })).execute({
        token: stopped.token
      })
    ).rejects.toMatchObject({ stage: 'OPENING_CPI_RESEARCH' })
    expect(stoppedCalls).toEqual([])
  })

  it('closes only the historical result after confirmed save and clears its handle', async () => {
    const calls: string[] = []
    const state = new PlaywrightResearchPreparationState()
    const mainPage = { isClosed: vi.fn(() => false), close: vi.fn() } as never
    const historicalPage = {
      isClosed: vi.fn(() => false),
      close: vi.fn(async () => undefined)
    } as never
    state.setResolvedResult({
      resultPage: historicalPage,
      closeResultPageAfterSave: true,
      expectedProcessCount: 0,
      expectedProcessNumbers: []
    })
    const deskData = new PlaywrightDeskDataCycleAdapter(
      mainPage,
      { prepare: { prepare: vi.fn(async () => void calls.push('next')) } },
      state
    )
    const adapter = new PlaywrightResearchCycleAdapter(createDependencies({ calls, deskData }))

    await adapter.execute({ token: new ExecutionControl().token })

    expect(historicalPage.close).toHaveBeenCalledTimes(1)
    expect(mainPage.close).not.toHaveBeenCalled()
    expect(calls).toEqual([
      'open',
      'identity',
      'bind',
      'next',
      'preparation',
      'save',
      'next',
      'return'
    ])
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('keeps a confirmed-save cleanup failure as the primary public-stage error', async () => {
    const state = new PlaywrightResearchPreparationState()
    const cleanupFailure = new Error('synthetic popup close failure')
    const historicalPage = {
      isClosed: vi.fn(() => false),
      close: vi.fn().mockRejectedValue(cleanupFailure)
    } as never
    state.setResolvedResult({
      resultPage: historicalPage,
      closeResultPageAfterSave: true,
      expectedProcessCount: 0,
      expectedProcessNumbers: []
    })
    const deskData = new PlaywrightDeskDataCycleAdapter(
      { isClosed: vi.fn(() => false), close: vi.fn() } as never,
      { prepare: { prepare: vi.fn(async () => undefined) } },
      state
    )

    await expect(
      new PlaywrightResearchCycleAdapter(createDependencies({ calls: [], deskData })).execute({
        token: new ExecutionControl().token
      })
    ).rejects.toMatchObject({
      stage: 'PREPARING_NEXT_SEARCH',
      message: 'Não foi possível concluir a etapa do ciclo de pesquisa.'
    })
    expect(historicalPage.close).toHaveBeenCalledTimes(1)
    expect(() => state.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
  })

  it('rewraps only public application errors and preserves technical failures', async () => {
    const publicFailure = new ApplicationError({
      code: 'PREPARATION',
      message: 'safe public message',
      stage: 'PREPARING_CPI_RESULT',
      cause: new Error('technical cause')
    })
    const publicDependencies = createDependencies({
      calls: [],
      preparation: { execute: vi.fn().mockRejectedValue(publicFailure) }
    })

    await expect(
      new PlaywrightResearchCycleAdapter(publicDependencies).execute({
        token: new ExecutionControl().token
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        ContinuousResearchStageError.isPublic(error) &&
        error.stage === 'PREPARING_CPI_RESULT' &&
        error.message === 'safe public message'
    )

    const technicalFailure = new Error('technical adapter cause')
    const technicalDependencies = createDependencies({ calls: [] })
    technicalDependencies.cpi.openNext = vi.fn().mockRejectedValue(technicalFailure)

    await expect(
      new PlaywrightResearchCycleAdapter(technicalDependencies).execute({
        token: new ExecutionControl().token
      })
    ).rejects.toBeInstanceOf(ContinuousResearchStageError)

    await expect(
      new PlaywrightResearchCycleAdapter(technicalDependencies).execute({
        token: new ExecutionControl().token
      })
    ).rejects.not.toThrow('technical adapter cause')
  })
})

describe('PlaywrightCpiResearchCycleAdapter', () => {
  it('invalidates stale detail and preparation handles when opening the next CPI research fails', async () => {
    const state = new PlaywrightResearchCycleState()
    state.setDetailFrame({ id: 'stale-frame' } as never)
    state.setPreparation({ execute: vi.fn() })
    const openingFailure = new Error('synthetic opening failure')
    const adapter = new PlaywrightCpiResearchCycleAdapter(
      { frames: vi.fn(() => []) } as never,
      {
        opener: { openFirst: vi.fn().mockRejectedValue(openingFailure) },
        identityReader: { read: vi.fn() },
        saveController: { saveOnce: vi.fn() },
        queueReturnController: { returnToQueue: vi.fn() },
        createPreparation: vi.fn()
      },
      state
    )

    await expect(adapter.openNext()).rejects.toBe(openingFailure)
    expect(() => state.requireDetailFrame()).toThrow(
      'O formulário interno da pesquisa não foi resolvido.'
    )
    expect(() => state.requirePreparation()).toThrow(
      'A preparação da pesquisa não foi concluída antes da gravação.'
    )
  })

  it('delegates each CPI command once and binds the exact resolved frame to preparation and save', async () => {
    const state = new PlaywrightResearchCycleState()
    const detailFrame = {
      url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    } as never
    const page = { frames: vi.fn(() => [detailFrame]) } as never
    const openFirst = vi.fn(async () => ({ availableRows: 1, detailFramePath: '/safe' }))
    const read = vi.fn(async () => ({
      cpf: SYNTHETIC_CPF,
      maskedCpf: MASKED_SYNTHETIC_CPF,
      detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    }))
    const preparation = { execute: vi.fn(async () => preparedResearch) }
    const createPreparation = vi.fn(() => preparation)
    const saveOnce = vi.fn(async () => ({ saved: true, confirmationAccepted: true }))
    const returnToQueue = vi.fn(async () => undefined)
    const adapter = new PlaywrightCpiResearchCycleAdapter(
      page,
      {
        opener: { openFirst },
        identityReader: { read },
        saveController: { saveOnce },
        queueReturnController: { returnToQueue },
        createPreparation
      },
      state
    )

    await adapter.openNext()
    await expect(adapter.readIdentity()).resolves.toEqual({
      cpf: SYNTHETIC_CPF,
      maskedCpf: MASKED_SYNTHETIC_CPF
    })
    await adapter.bindCurrentResearch()
    await adapter.saveOnce()
    await adapter.returnToQueue()

    expect(openFirst).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(createPreparation).toHaveBeenCalledOnce()
    expect(createPreparation).toHaveBeenCalledWith(detailFrame)
    expect(saveOnce).toHaveBeenCalledTimes(1)
    expect(saveOnce).toHaveBeenCalledWith(page, detailFrame)
    expect(returnToQueue).toHaveBeenCalledTimes(1)
    expect(state.requirePreparation()).toBe(preparation)
  })

  it.each([
    ['missing', []],
    [
      'duplicate',
      [
        {
          url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
        },
        {
          url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
        }
      ]
    ]
  ] as const)(
    'emits both identity stages before a %s detail-frame binding error',
    async (_scenario, frames) => {
      const createPreparation = vi.fn()
      const cpi = new PlaywrightCpiResearchCycleAdapter(
        { frames: vi.fn(() => frames) } as never,
        {
          opener: {
            openFirst: vi.fn(async () => ({ availableRows: 1, detailFramePath: '/safe' }))
          },
          identityReader: {
            read: vi.fn(async () => ({
              cpf: SYNTHETIC_CPF,
              maskedCpf: MASKED_SYNTHETIC_CPF,
              detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
            }))
          },
          saveController: { saveOnce: vi.fn() },
          queueReturnController: { returnToQueue: vi.fn() },
          createPreparation
        },
        new PlaywrightResearchCycleState()
      )
      const stages: string[] = []

      await expect(
        new PlaywrightResearchCycleAdapter({
          cpi,
          deskData: { prepareNextSearch: vi.fn(), closeHistoricalResult: vi.fn() },
          preparation: { execute: vi.fn() }
        }).execute({
          token: new ExecutionControl().token,
          hooks: { onStage: (stage) => stages.push(stage) }
        })
      ).rejects.toMatchObject({ stage: 'READING_CPI_IDENTITY' })

      expect(stages).toEqual([
        'OPENING_CPI_RESEARCH',
        'READING_CPI_IDENTITY',
        'READING_CPI_IDENTITY'
      ])
      expect(createPreparation).not.toHaveBeenCalled()
    }
  )

  it('clears the pending frame when the second identity hook fails before bind', async () => {
    const state = new PlaywrightResearchCycleState()
    const detailFrame = {
      url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    } as never
    const cpi = new PlaywrightCpiResearchCycleAdapter(
      { frames: vi.fn(() => [detailFrame]) } as never,
      {
        opener: { openFirst: vi.fn(async () => ({ availableRows: 1, detailFramePath: '/safe' })) },
        identityReader: {
          read: vi.fn(async () => ({
            cpf: SYNTHETIC_CPF,
            maskedCpf: MASKED_SYNTHETIC_CPF,
            detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
          }))
        },
        saveController: { saveOnce: vi.fn() },
        queueReturnController: { returnToQueue: vi.fn() },
        createPreparation: vi.fn()
      },
      state
    )
    let identityStages = 0

    await expect(
      new PlaywrightResearchCycleAdapter(
        {
          cpi,
          deskData: { prepareNextSearch: vi.fn(), closeHistoricalResult: vi.fn() },
          preparation: { execute: vi.fn() }
        },
        { clear: () => state.clear() }
      ).execute({
        token: new ExecutionControl().token,
        hooks: {
          onStage: (stage) => {
            if (stage === 'READING_CPI_IDENTITY' && ++identityStages === 2) {
              throw new Error('synthetic second identity hook failure')
            }
          }
        }
      })
    ).rejects.toMatchObject({ stage: 'READING_CPI_IDENTITY' })

    await expect(cpi.bindCurrentResearch()).rejects.toThrow(
      'O formulário interno da pesquisa não foi resolvido.'
    )
    expect(() => state.requireDetailFrame()).toThrow(
      'O formulário interno da pesquisa não foi resolvido.'
    )
  })

  it('shares one preparation compatibility state between preparation and post-save DeskData cleanup', async () => {
    const cycleState = new PlaywrightResearchCycleState()
    const preparationState = new PlaywrightResearchPreparationState()
    const detailFrame = {
      url: () => 'https://cpi.example/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    } as never
    const historicalPage = {
      isClosed: vi.fn(() => false),
      close: vi.fn(async () => undefined)
    } as never
    const cpi = new PlaywrightCpiResearchCycleAdapter(
      { frames: vi.fn(() => [detailFrame]) } as never,
      {
        opener: { openFirst: vi.fn(async () => ({ availableRows: 1, detailFramePath: '/safe' })) },
        identityReader: {
          read: vi.fn(async () => ({
            cpf: SYNTHETIC_CPF,
            maskedCpf: MASKED_SYNTHETIC_CPF,
            detailFramePath: '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
          }))
        },
        saveController: {
          saveOnce: vi.fn(async () => ({ saved: true, confirmationAccepted: true }))
        },
        queueReturnController: { returnToQueue: vi.fn(async () => undefined) },
        createPreparation: () => ({
          execute: async () => {
            preparationState.setResolvedResult({
              resultPage: historicalPage,
              closeResultPageAfterSave: true,
              expectedProcessCount: 0,
              expectedProcessNumbers: []
            })
            return preparedResearch
          }
        })
      },
      cycleState
    )
    const deskData = new PlaywrightDeskDataCycleAdapter(
      { isClosed: vi.fn(() => false), close: vi.fn() } as never,
      { prepare: { prepare: vi.fn(async () => undefined) } },
      preparationState
    )
    const adapter = new PlaywrightResearchCycleAdapter(
      {
        cpi,
        deskData,
        preparation: {
          execute: (identity) => cycleState.requirePreparation().execute(identity)
        }
      },
      {
        clear: () => {
          cycleState.clear()
          preparationState.clearResolvedResult()
        }
      }
    )

    await adapter.execute({ token: new ExecutionControl().token })

    expect(historicalPage.close).toHaveBeenCalledTimes(1)
    expect(() => preparationState.requireResolvedResult()).toThrow(
      'O resultado da DeskData não foi resolvido para gerar o relatório.'
    )
    expect(() => cycleState.requireDetailFrame()).toThrow(
      'O formulário interno da pesquisa não foi resolvido.'
    )
  })
})
