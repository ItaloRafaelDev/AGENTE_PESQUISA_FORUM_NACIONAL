import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectSourceDependencies,
  type SourceDependency,
  type SourceLayer
} from '../support/architecture/source-import-graph'
import { isExternalDependencyAllowed } from '../support/architecture/layer-dependency-policy'

const sourceRoot = resolve('src')
const dependencies = collectSourceDependencies(sourceRoot)

const ALLOWED_INTERNAL_TARGETS: Record<SourceLayer, readonly SourceLayer[]> = {
  application: ['application', 'domain'],
  domain: ['domain'],
  infrastructure: ['infrastructure', 'application', 'domain'],
  main: ['main', 'application', 'infrastructure', 'shared'],
  preload: ['preload', 'shared'],
  renderer: ['renderer', 'shared'],
  shared: ['shared'],
  unknown: []
}

function formatViolation(dependency: SourceDependency, rule: string): string {
  const target = dependency.targetFile ?? dependency.moduleSpecifier
  const targetLayer = dependency.targetLayer ?? 'external/unresolved'

  return `${dependency.sourceFile} -> ${target} -> ${targetLayer} -> ${rule}`
}

describe('progressive architecture boundaries', () => {
  it('resolve imports internos e reconhece todas as camadas de produção', () => {
    const violations = dependencies
      .filter(
        (dependency) =>
          dependency.sourceLayer === 'unknown' ||
          (dependency.kind === 'internal' && dependency.targetFile === null)
      )
      .map((dependency) =>
        formatViolation(dependency, 'source layer and internal imports must resolve')
      )
      .sort()

    expect(violations).toEqual([])
  })

  it('respeita a direção aprovada e mantém o núcleo sem pacotes externos', () => {
    const violations = dependencies
      .filter((dependency) => {
        if (dependency.kind === 'external') {
          return !isExternalDependencyAllowed(dependency.sourceLayer, dependency.moduleSpecifier)
        }

        if (!dependency.targetLayer) {
          return true
        }

        if (ALLOWED_INTERNAL_TARGETS[dependency.sourceLayer].includes(dependency.targetLayer)) {
          return false
        }

        return true
      })
      .map((dependency) => formatViolation(dependency, 'forbidden dependency direction'))
      .sort()

    expect(violations).toEqual([])
  })

  it('mantém todos os contratos da aplicação livres de tipos técnicos', () => {
    const forbidden = dependencies
      .filter((dependency) => dependency.sourceLayer === 'application')
      .filter(
        (dependency) =>
          dependency.moduleSpecifier === 'electron' ||
          dependency.moduleSpecifier === 'playwright' ||
          dependency.moduleSpecifier === 'better-sqlite3' ||
          dependency.moduleSpecifier.startsWith('node:')
      )

    expect(forbidden).toEqual([])
  })

  it('não permite dependências do processo principal para automation', () => {
    expect(
      dependencies.filter(
        (dependency) => dependency.sourceLayer === 'main' && dependency.targetLayer === 'automation'
      )
    ).toEqual([])
  })
})
