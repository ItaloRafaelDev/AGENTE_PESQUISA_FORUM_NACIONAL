import { describe, expect, it } from 'vitest'
import type { SourceLayer } from '../../support/architecture/source-import-graph'
import { isExternalDependencyAllowed } from '../../support/architecture/layer-dependency-policy'

interface ExternalPolicyFixture {
  layer: SourceLayer
  allowed: readonly string[]
  forbidden: readonly string[]
}

const fixtures: readonly ExternalPolicyFixture[] = [
  {
    layer: 'application',
    allowed: [],
    forbidden: ['node:path', 'zod']
  },
  {
    layer: 'automation',
    allowed: ['node:fs/promises', 'node:sqlite', 'playwright', 'pdf-parse'],
    forbidden: ['better-sqlite3', 'electron', 'react', 'sqlite', 'zod', 'zod-validation']
  },
  {
    layer: 'domain',
    allowed: [],
    forbidden: ['node:crypto', 'react']
  },
  {
    layer: 'infrastructure',
    allowed: [
      'node:path',
      'node:test',
      'fs/promises',
      'zod',
      'playwright',
      'better-sqlite3',
      'pdf-parse'
    ],
    forbidden: ['electron', 'react', 'test']
  },
  {
    layer: 'main',
    allowed: ['node:path', 'node:sea', 'electron', '@electron-toolkit/utils', 'zod'],
    forbidden: ['better-sqlite3', 'playwright', 'react', 'sea']
  },
  {
    layer: 'preload',
    allowed: ['electron', '@electron-toolkit/preload'],
    forbidden: ['node:fs', 'playwright', 'react']
  },
  {
    layer: 'renderer',
    allowed: ['react', 'react/jsx-runtime', 'react-dom/client'],
    forbidden: ['node:path', 'better-sqlite3', 'electron', 'playwright']
  },
  {
    layer: 'shared',
    allowed: [],
    forbidden: ['node:util', 'react', 'zod']
  },
  {
    layer: 'unknown',
    allowed: [],
    forbidden: ['node:path', 'electron', 'react']
  }
]

describe('external dependency policy', () => {
  it.each(fixtures)('permite apenas dependências externas aprovadas em $layer', (fixture) => {
    for (const moduleSpecifier of fixture.allowed) {
      expect(
        isExternalDependencyAllowed(fixture.layer, moduleSpecifier),
        `${fixture.layer} deveria permitir ${moduleSpecifier}`
      ).toBe(true)
    }

    for (const moduleSpecifier of fixture.forbidden) {
      expect(
        isExternalDependencyAllowed(fixture.layer, moduleSpecifier),
        `${fixture.layer} deveria bloquear ${moduleSpecifier}`
      ).toBe(false)
    }
  })

  it('não amplia permissão para outros pacotes do mesmo escopo', () => {
    expect(isExternalDependencyAllowed('main', '@electron-toolkit/preload')).toBe(false)
    expect(isExternalDependencyAllowed('preload', '@electron-toolkit/utils')).toBe(false)
  })

  it('mantém Zod somente na infraestrutura de configuração', () => {
    expect(isExternalDependencyAllowed('automation', 'zod')).toBe(false)
    expect(isExternalDependencyAllowed('infrastructure', 'zod')).toBe(true)
  })
})
