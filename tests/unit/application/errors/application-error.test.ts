import { describe, expect, it } from 'vitest'
import { ApplicationError } from '@/application/errors/application-error'

describe('ApplicationError', () => {
  it('preserva a causa sem expô-la na mensagem', () => {
    const cause = new Error('detalhe técnico')
    const error = new ApplicationError({
      code: 'INTEGRATION',
      message: 'Falha segura',
      stage: 'WAITING_DESKDATA_RESULT',
      cause
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Falha segura')
    expect(error.stage).toBe('WAITING_DESKDATA_RESULT')
    expect(error.cause).toBe(cause)
  })
})
