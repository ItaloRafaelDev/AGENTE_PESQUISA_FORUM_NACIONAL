import { describe, expect, it } from 'vitest'
import { UuidGenerator } from '@/infrastructure/runtime/uuid-generator'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('UuidGenerator', () => {
  it('gera UUIDs válidos e distintos para ciclos diferentes', () => {
    const generator = new UuidGenerator()
    const firstId = generator.next()
    const secondId = generator.next()

    expect(firstId).toMatch(UUID_PATTERN)
    expect(secondId).toMatch(UUID_PATTERN)
    expect(secondId).not.toBe(firstId)
  })
})
