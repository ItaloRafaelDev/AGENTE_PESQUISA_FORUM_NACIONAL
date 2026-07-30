import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { collectSourceDependencies } from '../../support/architecture/source-import-graph'

const temporaryDirectories: string[] = []

function createSourceRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-architecture-'))

  temporaryDirectories.push(directory)

  return join(directory, 'src')
}

function writeSource(sourceRoot: string, relativePath: string, source: string): void {
  const filePath = join(sourceRoot, relativePath)

  mkdirSync(dirname(filePath), {
    recursive: true
  })

  writeFileSync(filePath, source, 'utf8')
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()

    if (directory) {
      rmSync(directory, {
        recursive: true,
        force: true
      })
    }
  }
})

describe('collectSourceDependencies', () => {
  it('lê imports estáticos, imports de tipo e reexports', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'domain/value.ts', 'export type Value = string')
    writeSource(
      sourceRoot,
      'application/use-value.ts',
      [
        "import type { Value } from '../domain/value'",
        "export type { Value as PublicValue } from '../domain/value'"
      ].join('\n')
    )

    expect(collectSourceDependencies(sourceRoot)).toEqual([
      {
        sourceFile: 'application/use-value.ts',
        sourceLayer: 'application',
        moduleSpecifier: '../domain/value',
        kind: 'internal',
        targetFile: 'domain/value.ts',
        targetLayer: 'domain'
      },
      {
        sourceFile: 'application/use-value.ts',
        sourceLayer: 'application',
        moduleSpecifier: '../domain/value',
        kind: 'internal',
        targetFile: 'domain/value.ts',
        targetLayer: 'domain'
      }
    ])
  })

  it('lê import types e imports dinâmicos', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'domain/value.ts', 'export interface Value { id: string }')
    writeSource(
      sourceRoot,
      'application/load-value.ts',
      [
        "type LazyValue = import('../domain/value').Value",
        'export async function loadValue(): Promise<unknown> {',
        "  const direct = import('../domain/value')",
        "  const withOptions = import('../domain/value', { with: { type: 'json' } })",
        '  return Promise.all([direct, withOptions])',
        '}',
        'export type { LazyValue }'
      ].join('\n')
    )

    const dependencies = collectSourceDependencies(sourceRoot)

    expect(dependencies).toHaveLength(3)
    expect(dependencies.every((dependency) => dependency.targetFile === 'domain/value.ts')).toBe(
      true
    )
  })

  it('resolve aliases internos exatos, curingas e ausentes como internos', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'shared/types/index.ts', 'export type Contract = string')
    writeSource(sourceRoot, 'renderer/src/index.ts', 'export const rootValue = 1')
    writeSource(sourceRoot, 'renderer/src/hooks/use-value.ts', 'export const value = 1')
    writeSource(
      sourceRoot,
      'main/index.ts',
      [
        "import type { Contract } from '@/shared/types'",
        "import '@/missing'",
        "import { rootValue } from '@renderer'",
        "import { value } from '@renderer/hooks/use-value'",
        "import '@renderer/missing'",
        'export type { Contract }',
        'export { rootValue, value }'
      ].join('\n')
    )

    expect(collectSourceDependencies(sourceRoot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleSpecifier: '@/shared/types',
          kind: 'internal',
          targetFile: 'shared/types/index.ts',
          targetLayer: 'shared'
        }),
        expect.objectContaining({
          moduleSpecifier: '@/missing',
          kind: 'internal',
          targetFile: null,
          targetLayer: null
        }),
        expect.objectContaining({
          moduleSpecifier: '@renderer',
          kind: 'internal',
          targetFile: 'renderer/src/index.ts',
          targetLayer: 'renderer'
        }),
        expect.objectContaining({
          moduleSpecifier: '@renderer/hooks/use-value',
          kind: 'internal',
          targetFile: 'renderer/src/hooks/use-value.ts',
          targetLayer: 'renderer'
        }),
        expect.objectContaining({
          moduleSpecifier: '@renderer/missing',
          kind: 'internal',
          targetFile: null,
          targetLayer: null
        })
      ])
    )
  })

  it('resolve arquivos e index de declaração TypeScript sem extensão', () => {
    const fileSourceRoot = createSourceRoot()

    writeSource(fileSourceRoot, 'domain/contracts.d.ts', 'export interface Contract {}')
    writeSource(
      fileSourceRoot,
      'application/use-contract.ts',
      "import type { Contract } from '../domain/contracts'"
    )

    const indexSourceRoot = createSourceRoot()

    writeSource(indexSourceRoot, 'domain/contracts/index.d.ts', 'export interface Contract {}')
    writeSource(
      indexSourceRoot,
      'application/use-contract.ts',
      "import type { Contract } from '../domain/contracts'"
    )

    expect(collectSourceDependencies(fileSourceRoot)[0]?.targetFile).toBe('domain/contracts.d.ts')
    expect(collectSourceDependencies(indexSourceRoot)[0]?.targetFile).toBe(
      'domain/contracts/index.d.ts'
    )
  })

  it('distingue pacote externo de import interno não resolvido', () => {
    const sourceRoot = createSourceRoot()

    writeSource(
      sourceRoot,
      'shared/index.ts',
      [
        "import { z } from 'zod'",
        "import './missing'",
        "import './legacy.js'",
        "import './styles.css'",
        'export { z }'
      ].join('\n')
    )
    writeSource(sourceRoot, 'shared/legacy.ts', 'export const legacy = true')

    expect(collectSourceDependencies(sourceRoot)).toEqual([
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: './legacy.js',
        kind: 'internal',
        targetFile: 'shared/legacy.ts',
        targetLayer: 'shared'
      },
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: './missing',
        kind: 'internal',
        targetFile: null,
        targetLayer: null
      },
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: './styles.css',
        kind: 'internal',
        targetFile: null,
        targetLayer: null
      },
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: 'zod',
        kind: 'external',
        targetFile: null,
        targetLayer: null
      }
    ])
  })

  it('resolve assets existentes, queries e camadas sem escanear o conteúdo do asset', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'renderer/src/assets/theme.css', "@import '../../../main/index.ts';")
    writeSource(
      sourceRoot,
      'shared/config.json',
      JSON.stringify({
        import: '../main/index.ts'
      })
    )
    writeSource(
      sourceRoot,
      'renderer/src/main.ts',
      ["import './assets/theme.css?raw'", "import config from '../../shared/config.json'"].join(
        '\n'
      )
    )

    expect(collectSourceDependencies(sourceRoot)).toEqual([
      {
        sourceFile: 'renderer/src/main.ts',
        sourceLayer: 'renderer',
        moduleSpecifier: '../../shared/config.json',
        kind: 'internal',
        targetFile: 'shared/config.json',
        targetLayer: 'shared'
      },
      {
        sourceFile: 'renderer/src/main.ts',
        sourceLayer: 'renderer',
        moduleSpecifier: './assets/theme.css?raw',
        kind: 'internal',
        targetFile: 'renderer/src/assets/theme.css',
        targetLayer: 'renderer'
      }
    ])
  })
})
