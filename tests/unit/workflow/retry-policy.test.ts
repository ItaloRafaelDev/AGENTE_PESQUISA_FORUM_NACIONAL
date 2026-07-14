import { describe, expect, it } from 'vitest'
import { RetryPolicy } from '@/automation/workflow/retry-policy'

describe('RetryPolicy', () => {
  it('deve retornar os intervalos progressivos aprovados', () => {
    const policy = new RetryPolicy([30_000, 60_000, 120_000])

    expect(policy.getDelay(1)).toBe(30_000)
    expect(policy.getDelay(2)).toBe(60_000)
    expect(policy.getDelay(3)).toBe(120_000)
  })

  it('deve impedir tentativas acima do limite', () => {
    const policy = new RetryPolicy([30_000, 60_000, 120_000])

    expect(policy.canRetry(1)).toBe(true)
    expect(policy.canRetry(3)).toBe(true)
    expect(policy.canRetry(4)).toBe(false)
  })

  it('deve rejeitar número de tentativa inválido', () => {
    const policy = new RetryPolicy([30_000, 60_000, 120_000])

    expect(() => policy.getDelay(0)).toThrow('Tentativa fora da política: 0')
    expect(() => policy.getDelay(4)).toThrow('Tentativa fora da política: 4')
  })

  it('deve rejeitar uma política sem intervalos', () => {
    expect(() => new RetryPolicy([])).toThrow('Política de retentativa inválida')
  })
})
