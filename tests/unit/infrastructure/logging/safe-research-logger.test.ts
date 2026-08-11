import { describe, expect, it, vi } from 'vitest'
import { SafeResearchLogger } from '@/infrastructure/logging/safe-research-logger'

describe('SafeResearchLogger', () => {
  it('mascara CPF sem pontuação e formatado', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.info('CPF capturado: 12345678901')
    logger.info('Documento: 987.654.321-00')

    expect(write).toHaveBeenNthCalledWith(1, 'CPF capturado: ***.***.***-01')
    expect(write).toHaveBeenNthCalledWith(2, 'Documento: ***.***.***-00')
    expect(write).not.toHaveBeenCalledWith(expect.stringContaining('12345678901'))
  })

  it('sanitiza CPF presente em mensagens de erro e rejeita máscara inválida', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.error('READING_CPI_IDENTITY', new Error('Falha ao processar 111.222.333-44'))

    expect(write).toHaveBeenCalledWith('[READING_CPI_IDENTITY] Falha ao processar ***.***.***-44')
    expect(logger.maskCpf('12345')).toBe('[CPF_INVALIDO]')
  })

  it('mascara CPF e preserva o limite seguro de mil caracteres', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)
    const message = `CPF 00000000011 ${'x'.repeat(1_100)}`

    logger.info(message)

    const loggedMessage = write.mock.calls[0]?.[0]
    expect(loggedMessage).toHaveLength(1_000)
    expect(loggedMessage).toContain('***.***.***-11')
    expect(loggedMessage).not.toContain('00000000011')
  })
})
