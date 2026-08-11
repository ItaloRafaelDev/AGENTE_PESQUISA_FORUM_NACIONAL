import { describe, expect, it } from 'vitest'
import { SafeMessageSanitizerAdapter } from '@/infrastructure/logging/safe-message-sanitizer'

describe('SafeMessageSanitizerAdapter', () => {
  it('remove CPF sintético de uma mensagem e preserva a truncagem segura', () => {
    const sanitizer = new SafeMessageSanitizerAdapter()
    const message = `falha para 000.000.000-11 ${'x'.repeat(1_100)}`

    const sanitized = sanitizer.sanitize(message)

    expect(sanitized).toHaveLength(1_000)
    expect(sanitized).toContain('***.***.***-11')
    expect(sanitized).not.toContain('000.000.000-11')
  })
})
