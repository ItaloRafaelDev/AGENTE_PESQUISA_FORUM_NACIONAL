import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const legacyAutomationRoot = ['src', 'automation'].join('/')
const legacyAutomationAlias = ['@', 'automation'].join('/')

function collectTypeScriptFiles(roots: readonly string[]): string[] {
  const visit = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = resolve(path, entry.name)

      return entry.isDirectory() ? visit(entryPath) : /\.tsx?$/.test(entry.name) ? [entryPath] : []
    })

  return roots.flatMap(visit)
}

function findOldImportLines(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const moduleSpecifiers = [...source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  )

  return moduleSpecifiers
    .filter((moduleSpecifier) =>
      new RegExp(
        `(?:${legacyAutomationAlias}|${legacyAutomationRoot}|(?:^|/)\\.\\.?/automation/)`
      ).test(moduleSpecifier)
    )
    .map((moduleSpecifier) => `${relative('.', file)}:${moduleSpecifier}`)
}

describe('localização dos adapters externos', () => {
  it('mantém browser e sessão na infraestrutura', () => {
    expect(existsSync('src/infrastructure/automation/browser/browser-manager.ts')).toBe(true)
    expect(existsSync('src/infrastructure/automation/session/platform-session-service.ts')).toBe(
      true
    )
  })

  it('remove a camada automation e todos os imports compiláveis antigos', () => {
    expect(existsSync(legacyAutomationRoot)).toBe(false)

    const oldImports = collectTypeScriptFiles(['src', 'scripts', 'tests']).flatMap(
      findOldImportLines
    )

    expect(oldImports).toEqual([])
  })
})
