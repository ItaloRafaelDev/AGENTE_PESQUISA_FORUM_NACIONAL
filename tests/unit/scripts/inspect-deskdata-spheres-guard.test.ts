import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

const source = readFileSync(join(root, 'scripts', 'inspect-deskdata-process-result.ts'), 'utf8')

function structuredBlock(): string {
  const startMarker = '// STRUCTURED_SPHERE_INSPECTION_START'

  const endMarker = '// STRUCTURED_SPHERE_INSPECTION_END'

  const start = source.indexOf(startMarker)

  const end = source.indexOf(endMarker, start)

  if (start < 0 || end < 0) {
    return ''
  }

  return source.slice(start, end + endMarker.length)
}

describe('inspector autenticado por Esfera', () => {
  it('importa os componentes estruturados', () => {
    expect(source).toContain(
      "from '../src/automation/deskdata/playwright-deskdata-process-page-adapter'"
    )

    expect(source).toContain("from '../src/automation/deskdata/deskdata-process-collector'")

    expect(source).toContain("from '../src/domain/research/classify-deskdata-spheres'")
  })

  it('remove a flag legada antes do parser de cenário', () => {
    expect(source).toContain(
      "const legacyInspection = process.argv.includes('--legacy-inspection')"
    )

    expect(source).toContain(".filter((argument) => argument !== '--legacy-inspection')")
  })

  it('executa o modo estruturado por padrão', () => {
    const block = structuredBlock()

    expect(block).not.toBe('')

    expect(block).toContain('if (!legacyInspection)')

    expect(block).toContain('PlaywrightDeskDataProcessPageAdapter')

    expect(block).toContain('DeskDataProcessCollector')

    expect(block).toContain('classifyDeskDataSpheres')

    expect(block).toContain('return')
  })

  it('emite somente evidência operacional segura', () => {
    const block = structuredBlock()

    expect(block).toContain('processCount')

    expect(block).toContain('pageCount')

    expect(block).toContain('normalizedSpheres')

    expect(block).toContain('classification.result')

    expect(block).toContain('classification.reason')

    expect(block).not.toMatch(/\bprocessNumber\b/)

    expect(block).not.toMatch(/\bbodyText\b/)

    expect(block).not.toMatch(/\bhtml\b/i)

    expect(block).not.toMatch(/\bcpf\b/i)

    expect(block).not.toMatch(/\bname\b/i)
  })

  it('preserva o inspector textual após o bloco estruturado', () => {
    const end = source.indexOf('// STRUCTURED_SPHERE_INSPECTION_END')

    const legacySource = source.slice(end)

    expect(legacySource).toContain('new DeskDataProcessResultInspector()')

    expect(legacySource).toContain('captureRawInspection(deskDataPage, scenario)')
  })
})
