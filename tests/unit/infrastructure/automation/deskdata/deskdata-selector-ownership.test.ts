import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKDATA_DATASET_SELECTORS,
  DESKDATA_NEXT_SEARCH_SELECTORS,
  DESKDATA_PDF_EXPORT_SELECTOR,
  DESKDATA_SEARCH_SELECTORS,
  DESKDATA_SIMILAR_QUERY_SELECTORS,
  DESKDATA_SUBMIT_SELECTORS
} from '@/infrastructure/automation/deskdata/deskdata-selectors'

const selectorCatalogPath = resolve('src/infrastructure/automation/deskdata/deskdata-selectors.ts')

const expectedCatalogExports = [
  'DESKDATA_SEARCH_SELECTORS',
  'DESKDATA_DATASET_SELECTORS',
  'DESKDATA_NEXT_SEARCH_SELECTORS',
  'DESKDATA_SUBMIT_SELECTORS',
  'DESKDATA_SIMILAR_QUERY_SELECTORS',
  'DESKDATA_PDF_EXPORT_SELECTOR'
] as const

const selectorLiterals = [
  'form#form',
  'form#form select#key-select[name="key-select"]',
  'form#form button[title="CPF"]',
  'form#form input#cpf[name="cpf"][type="text"]',
  'form#form input#search[name="submit"][type="submit"]',
  'form#form input[type="checkbox"]',
  'h5:has-text("Consultas semelhantes encontradas")',
  'a[href="https://app.deskdata.com.br/pessoas/"]:visible, a[href="https://app.deskdata.com.br/pessoas"]:visible',
  'table tbody tr:has(a[href*="/historico/detalhes"])',
  'a[href*="/historico/detalhes"]',
  'td',
  'form[method="POST"] input[type="submit"][name="export"][value="Exportar"][formtarget="_blank"]'
] as const

function collectTypeScriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(root, entry.name)

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(entryPath)
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : []
  })
}

function expectNoCatalogEscapeHatches(source: string): void {
  expect(source).not.toMatch(
    /export\s*\*\s*from\s*['"][^'"]*(?:\.?\.\/)?deskdata-selectors(?:\.ts)?['"]/
  )
  expect(source).not.toMatch(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*DESKDATA_[A-Z_]+\b/)
  expect(source).not.toMatch(/\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*DESKDATA_[A-Z_]+\b/)
}

describe('ownership dos seletores DeskData', () => {
  it('preserva chave, literal e ordem de cada coleção e do seletor escalar', () => {
    expect(Object.entries(DESKDATA_SEARCH_SELECTORS)).toEqual([
      ['form', 'form#form'],
      ['cpfKeyButton', 'form#form button[title="CPF"]'],
      ['cpfInput', 'form#form input#cpf[name="cpf"][type="text"]'],
      ['searchButton', 'form#form input#search[name="submit"][type="submit"]']
    ])
    expect(Object.entries(DESKDATA_DATASET_SELECTORS)).toEqual([
      ['allCheckboxes', 'form#form input[type="checkbox"]']
    ])
    expect(Object.entries(DESKDATA_NEXT_SEARCH_SELECTORS)).toEqual([
      ['primaryKey', 'form#form select#key-select[name="key-select"]'],
      ['cpfInput', 'form#form input#cpf[name="cpf"][type="text"]'],
      ['searchButton', 'form#form input#search[name="submit"][type="submit"]'],
      ['similarQueriesHeading', 'h5:has-text("Consultas semelhantes encontradas")'],
      [
        'consultPeopleLink',
        'a[href="https://app.deskdata.com.br/pessoas/"]:visible, a[href="https://app.deskdata.com.br/pessoas"]:visible'
      ]
    ])
    expect(Object.entries(DESKDATA_SUBMIT_SELECTORS)).toEqual([
      ['searchButton', 'form#form input#search[name="submit"][type="submit"]']
    ])
    expect(Object.entries(DESKDATA_SIMILAR_QUERY_SELECTORS)).toEqual([
      ['rows', 'table tbody tr:has(a[href*="/historico/detalhes"])'],
      ['historyLink', 'a[href*="/historico/detalhes"]'],
      ['rowCells', 'td']
    ])
    expect(DESKDATA_PDF_EXPORT_SELECTOR).toBe(
      'form[method="POST"] input[type="submit"][name="export"][value="Exportar"][formtarget="_blank"]'
    )
  })

  it('centraliza o seletor de células da tabela de consultas semelhantes', () => {
    expect(Object.entries(DESKDATA_SIMILAR_QUERY_SELECTORS)).toEqual([
      ['rows', 'table tbody tr:has(a[href*="/historico/detalhes"])'],
      ['historyLink', 'a[href*="/historico/detalhes"]'],
      ['rowCells', 'td']
    ])

    const resolverSource = readFileSync(
      resolve('src/infrastructure/automation/deskdata/deskdata-search-result-page-resolver.ts'),
      'utf8'
    )

    expect(resolverSource).not.toContain(".locator('td')")
  })

  it('mantém o catálogo como único owner', () => {
    const selectorSource = readFileSync(selectorCatalogPath, 'utf8')

    for (const exportName of expectedCatalogExports) {
      expect(selectorSource).toContain(`export const ${exportName}`)
    }

    for (const selectorLiteral of selectorLiterals) {
      expect(selectorSource).toContain(selectorLiteral)
    }

    const consumerFiles = [
      ...collectTypeScriptFiles(resolve('src/infrastructure/automation/deskdata')),
      ...collectTypeScriptFiles(resolve('src/infrastructure/automation/pdf'))
    ].filter((file) => file !== selectorCatalogPath)

    for (const file of consumerFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source).not.toMatch(/\.locator\(\s*['"]/)
      expectNoCatalogEscapeHatches(source)

      for (const exportName of expectedCatalogExports) {
        expect(source).not.toMatch(new RegExp(`(?:export\\s+)?const\\s+${exportName}\\b`))
        expect(source).not.toMatch(new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b`))
        expect(source).not.toMatch(new RegExp(`\\b${exportName}\\s+as\\b`))
      }

      for (const selectorLiteral of selectorLiterals) {
        expect(source).not.toContain(selectorLiteral)
      }

      const referencedCatalogNames = expectedCatalogExports.filter((exportName) =>
        new RegExp(`\\b${exportName}\\b`).test(source)
      )

      if (referencedCatalogNames.length > 0) {
        for (const exportName of referencedCatalogNames) {
          expect(source).toMatch(
            new RegExp(
              `import\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}\\s*from\\s*['"][^'"]*deskdata-selectors['"]`
            )
          )
        }
      }
    }
  })
})
