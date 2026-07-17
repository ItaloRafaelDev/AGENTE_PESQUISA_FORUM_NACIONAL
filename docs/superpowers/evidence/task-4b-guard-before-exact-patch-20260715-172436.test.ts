import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

const inspectionScriptPath = join(root, 'scripts', 'inspect-deskdata-process-result.ts')

const source = readFileSync(inspectionScriptPath, 'utf8')

function structuredInspectionBlock(): string {
  const startMarker = '// STRUCTURED_SPHERE_INSPECTION_START'

  const endMarker = '// STRUCTURED_SPHERE_INSPECTION_END'

  const start = source.indexOf(startMarker)

  const end = source.indexOf(endMarker, start)

  if (start < 0 || end < 0) {
    return ''
  }

  return source.slice(start, end + endMarker.length)
}

describe('inspeção segura por Esfera', () => {
  it('usa adaptador, coletor e classificador novos', () => {
    expect(source).toContain('PlaywrightDeskDataProcessPageAdapter')

    expect(source).toContain('DeskDataProcessCollector')

    expect(source).toContain('classifyDeskDataSpheres')
  })

  it('usa o modo estruturado por padrão', () => {
    const block = structuredInspectionBlock()

    expect(block).not.toBe('')

    expect(block).toContain("process.argv.includes('--legacy-inspection')")

    expect(block).toContain('return')
  })

  it('emite somente evidência operacional segura', () => {
    const block = structuredInspectionBlock()

    expect(block).toContain('processCount')

    expect(block).toContain('pageCount')

    expect(block).toContain('normalizedSpheres')

    expect(block).toContain('classification.result')

    expect(block).toContain('classification.reason')

    expect(block).not.toMatch(/\bprocessNumber\b/)

    expect(block).not.toMatch(/\bbodyText\b/)

    expect(block).not.toMatch(/\bhtml\b/)

    expect(block).not.toMatch(/\bcpf\b/i)

    expect(block).not.toMatch(/\bname\b/i)
  })
})
