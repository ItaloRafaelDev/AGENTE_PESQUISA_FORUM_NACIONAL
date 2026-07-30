import { describe, expect, it } from 'vitest'
import {
  CONTINUOUS_RESEARCH_STAGES as APPLICATION_STAGES,
  ContinuousResearchStageError
} from '@/application/agent/continuous-research-stage'
import {
  CONTINUOUS_RESEARCH_STAGES as LEGACY_STAGES,
  ContinuousResearchStageError as LegacyContinuousResearchStageError
} from '@/automation/flow/continuous-research-stage'
import { CONTINUOUS_RESEARCH_STAGES as PUBLIC_STAGES } from '@/shared/types/agent-runtime-api'

describe('ContinuousResearchStage', () => {
  it('preserva os valores internos e públicos na mesma ordem', () => {
    expect(APPLICATION_STAGES).toEqual([
      'WAITING_QUEUE',
      'OPENING_CPI_RESEARCH',
      'READING_CPI_IDENTITY',
      'PREPARING_DESKDATA',
      'SUBMITTING_DESKDATA',
      'WAITING_DESKDATA_RESULT',
      'CLASSIFYING_RESULT',
      'DOWNLOADING_PDF',
      'PREPARING_CPI_RESULT',
      'ATTACHING_PDF',
      'SAVING_CPI',
      'PREPARING_NEXT_SEARCH',
      'RETURNING_TO_QUEUE'
    ])
    expect(PUBLIC_STAGES).toEqual(APPLICATION_STAGES)
    expect(LEGACY_STAGES).toBe(APPLICATION_STAGES)
  })

  it('preserva a etapa e a referência exata da causa', () => {
    const cause = new Error('Falha controlada ao baixar PDF')
    const error = new ContinuousResearchStageError('DOWNLOADING_PDF', cause)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContinuousResearchStageError')
    expect(error.stage).toBe('DOWNLOADING_PDF')
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Falha controlada ao baixar PDF')
  })

  it('converte causa não Error na mensagem atual', () => {
    const error = new ContinuousResearchStageError('SAVING_CPI', 'Falha desconhecida')

    expect(error.stage).toBe('SAVING_CPI')
    expect(error.cause).toBe('Falha desconhecida')
    expect(error.message).toBe('Falha desconhecida')
  })

  it('mantém o caminho legado apontando para a mesma classe', () => {
    expect(LegacyContinuousResearchStageError).toBe(ContinuousResearchStageError)

    const error = new LegacyContinuousResearchStageError(
      'PREPARING_NEXT_SEARCH',
      new Error('Falha controlada')
    )

    expect(error).toBeInstanceOf(ContinuousResearchStageError)
  })
})
