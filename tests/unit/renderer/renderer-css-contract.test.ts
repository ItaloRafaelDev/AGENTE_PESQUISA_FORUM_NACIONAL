import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('renderer CSS contract', () => {
  it('preserva byte a byte o CSS aceito na Stage 7', () => {
    const css = readFileSync('src/renderer/src/assets/main.css')
    const hash = createHash('sha256').update(css).digest('hex').toUpperCase()

    expect(hash).toBe('949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6')
  })
})
