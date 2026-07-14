import { describe, expect, it } from 'vitest'
import { ContinuousResearchStageError } from '@/automation/flow/continuous-research-stage'

describe('ContinuousResearchStageError', () => {
  it('deve preservar a etapa e a causa original', () => {
    const cause = new Error('Falha ao baixar PDF')

    const error = new ContinuousResearchStageError('DOWNLOADING_PDF', cause)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContinuousResearchStageError')
    expect(error.stage).toBe('DOWNLOADING_PDF')
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Falha ao baixar PDF')
  })

  it('deve converter causa não Error em mensagem segura', () => {
    const error = new ContinuousResearchStageError('SAVING_CPI', 'Falha desconhecida')

    expect(error.stage).toBe('SAVING_CPI')
    expect(error.cause).toBe('Falha desconhecida')
    expect(error.message).toBe('Falha desconhecida')
  })
})
