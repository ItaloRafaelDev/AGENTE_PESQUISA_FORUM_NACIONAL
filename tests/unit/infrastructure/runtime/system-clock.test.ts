import { describe, expect, it } from 'vitest'
import { SystemClock } from '@/infrastructure/runtime/system-clock'

describe('SystemClock', () => {
  it('fornece uma data válida do sistema', () => {
    const now = new SystemClock().now()

    expect(now).toBeInstanceOf(Date)
    expect(Number.isFinite(now.getTime())).toBe(true)
  })
})
