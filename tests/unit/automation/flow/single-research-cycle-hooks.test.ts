import type { BrowserContext, Frame, Page } from 'playwright'
import { describe, expect, it } from 'vitest'
import {
  SingleResearchCycle,
  type SingleResearchCycleDependencies
} from '@/automation/flow/single-research-cycle'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '@/automation/flow/continuous-research-stage'

const QUEUE_URL =
  'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'

const DETAIL_URL = 'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/detalhe.aspx'

function createPages(): {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  detailFrame: Frame
} {
  const detailFrame = {
    url: () => DETAIL_URL
  } as unknown as Frame

  const cpiPage = {
    frames: () => [detailFrame],
    url: () => QUEUE_URL,
    waitForTimeout: async () => undefined,
    bringToFront: async () => undefined
  } as unknown as Page

  const deskDataPage = {} as Page

  const context = {} as BrowserContext

  return {
    context,
    cpiPage,
    deskDataPage,
    detailFrame
  }
}

function createDependencies(
  detailFrame: Frame,
  openerError?: Error
): SingleResearchCycleDependencies {
  let nextSearchPreparationCount = 0

  return {
    opener: {
      openFirst: async () => {
        if (openerError) {
          throw openerError
        }

        return {} as never
      }
    },

    identityReader: {
      read: async () =>
        ({
          detailFramePath: '/zpersEspecial/pesquisas/detalhe.aspx'
        }) as never
    },

    nextSearchController: {
      prepare: async () => {
        nextSearchPreparationCount += 1

        return {
          prepared: nextSearchPreparationCount > 0
        } as never
      }
    },

    preparationWorkflow: {
      prepare: async () =>
        ({
          maskedCpf: '***.***.***-44',
          selectedDatasetCount: 6,
          classification: {
            classification: 'HA_INFORMACOES'
          },
          pdf: {
            filePath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
            sizeBytes: 2048
          },
          cpi: {
            attachment: {
              attached: true
            },
            prepared: {
              researcherLabel: 'Desk Data',
              primaryResearcherLabel: 'Desk Data',
              statusLabel: 'Respondida'
            }
          },
          detailFrame
        }) as never
    },

    saveController: {
      saveOnce: async () =>
        ({
          saved: true,
          confirmationAccepted: true
        }) as never
    },

    queueReturnController: {
      returnToQueue: async () => undefined
    }
  }
}

describe('SingleResearchCycle hooks', () => {
  it('informa cada etapa operacional antes de executá-la', async () => {
    const { context, cpiPage, deskDataPage, detailFrame } = createPages()

    const stages: ContinuousResearchStage[] = []

    const cycle = new SingleResearchCycle(createDependencies(detailFrame))

    await cycle.run({
      context,
      cpiPage,
      deskDataPage,
      hooks: {
        onStage: (stage) => {
          stages.push(stage)
        }
      }
    })

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
  })

  it('informa somente o CPF mascarado produzido pelo fluxo seguro', async () => {
    const { context, cpiPage, deskDataPage, detailFrame } = createPages()

    const identities: string[] = []

    const cycle = new SingleResearchCycle(createDependencies(detailFrame))

    await cycle.run({
      context,
      cpiPage,
      deskDataPage,
      hooks: {
        onIdentity: (maskedCpf) => {
          identities.push(maskedCpf)
        }
      }
    })

    expect(identities).toEqual(['***.***.***-44'])

    expect(JSON.stringify(identities)).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it('mantém a etapa correta quando uma operação falha', async () => {
    const { context, cpiPage, deskDataPage, detailFrame } = createPages()

    const stages: ContinuousResearchStage[] = []

    const cycle = new SingleResearchCycle(
      createDependencies(detailFrame, new Error('Falha controlada'))
    )

    const execution = cycle.run({
      context,
      cpiPage,
      deskDataPage,
      hooks: {
        onStage: (stage) => {
          stages.push(stage)
        }
      }
    })

    await expect(execution).rejects.toMatchObject({
      name: 'ContinuousResearchStageError',
      stage: 'OPENING_CPI_RESEARCH'
    } satisfies Partial<ContinuousResearchStageError>)

    expect(stages).toEqual(['OPENING_CPI_RESEARCH'])
  })
})
