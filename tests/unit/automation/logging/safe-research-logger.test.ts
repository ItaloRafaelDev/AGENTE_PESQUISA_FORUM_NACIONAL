import { describe, expect, it, vi } from 'vitest'
import { SafeResearchLogger } from '@/automation/logging/safe-research-logger'

describe('SafeResearchLogger', () => {
  it('deve mascarar CPF sem pontuação', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.info('CPF capturado: 12345678901')

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('CPF capturado: ***.***.***-01')
    expect(write).not.toHaveBeenCalledWith(expect.stringContaining('12345678901'))
  })

  it('deve mascarar CPF formatado', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.info('Documento: 987.654.321-00')

    expect(write).toHaveBeenCalledWith('Documento: ***.***.***-00')
  })

  it('deve sanitizar CPF presente em mensagens de erro', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.error('READING_CPI_IDENTITY', new Error('Falha ao processar 111.222.333-44'))

    expect(write).toHaveBeenCalledWith('[READING_CPI_IDENTITY] Falha ao processar ***.***.***-44')

    expect(write).not.toHaveBeenCalledWith(expect.stringContaining('111.222.333-44'))
  })

  it('deve rejeitar valor que não possua onze dígitos', () => {
    const logger = new SafeResearchLogger(() => undefined)

    expect(logger.maskCpf('12345')).toBe('[CPF_INVALIDO]')
  })
})
