import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const CPI_ROOT = resolve('src/infrastructure/automation/cpi')

function sourceImportsSelectorCatalog(source: string, selectorName: string): boolean {
  return new RegExp(
    `^import\\s+{[^}]*\\b${selectorName}\\b[^}]*}\\s+from ['"]\\.\\/cpi-selectors['"]`,
    'm'
  ).test(source)
}

describe('CPI selector ownership', () => {
  it('keeps the catalog as the only CPI selector owner', () => {
    const selectorCatalog = readFileSync(resolve(CPI_ROOT, 'cpi-selectors.ts'), 'utf8')
    const cpiSources = readdirSync(CPI_ROOT)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => file !== 'cpi-selectors.ts')
      .map((file) => ({ file, source: readFileSync(resolve(CPI_ROOT, file), 'utf8') }))

    const selectorExports = [
      ...selectorCatalog.matchAll(/^export const (CPI_\w*SELECTOR\w*)/gm)
    ].map(([, name]) => name)
    const selectorLiterals = selectorCatalog
      .replace(/^import .*$/gm, '')
      .split('\n')
      .flatMap((line) => [...line.matchAll(/'([^']+)'/g)].map(([, value]) => value))

    expect(selectorCatalog).toMatch(/^export const CPI_.*SELECTOR/m)
    expect(selectorExports).not.toEqual([])
    expect(cpiSources.map(({ source }) => source).join('\n')).not.toMatch(
      /\bexport\s+(?:const|{)[^\n]*SELECTOR/
    )
    expect(cpiSources.map(({ source }) => source).join('\n')).not.toMatch(
      /\b(?:const|let|var)\s+\w*SELECTOR\w*\s*=/
    )
    expect(cpiSources.map(({ source }) => source).join('\n')).not.toMatch(/\.locator\(\s*['"`]/)
    expect(selectorLiterals).not.toEqual([])

    for (const { source } of cpiSources) {
      for (const selectorExport of selectorExports) {
        if (source.includes(selectorExport)) {
          expect(sourceImportsSelectorCatalog(source, selectorExport)).toBe(true)
        }
      }

      for (const selectorLiteral of selectorLiterals) {
        expect(source).not.toContain(`'${selectorLiteral}'`)
        expect(source).not.toContain(`"${selectorLiteral}"`)
      }
    }
  })
})
