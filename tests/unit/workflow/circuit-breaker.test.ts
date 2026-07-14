import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '@/automation/workflow/circuit-breaker'

describe('CircuitBreaker', () => {
  it('deve abrir após cinco falhas consecutivas', () => {
    const breaker = new CircuitBreaker(5)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      breaker.recordFailure()
    }

    expect(breaker.getFailureCount()).toBe(5)
    expect(breaker.isOpen()).toBe(true)
  })

  it('deve permanecer fechado abaixo do limite', () => {
    const breaker = new CircuitBreaker(5)

    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordFailure()

    expect(breaker.isOpen()).toBe(false)
  })

  it('deve zerar falhas consecutivas após uma operação bem-sucedida', () => {
    const breaker = new CircuitBreaker(5)

    breaker.recordFailure()
    breaker.recordFailure()
    breaker.recordSuccess()

    expect(breaker.getFailureCount()).toBe(0)
    expect(breaker.isOpen()).toBe(false)
  })

  it('deve rejeitar um limite inválido', () => {
    expect(() => new CircuitBreaker(0)).toThrow('Limite do circuit breaker inválido')
  })
})
