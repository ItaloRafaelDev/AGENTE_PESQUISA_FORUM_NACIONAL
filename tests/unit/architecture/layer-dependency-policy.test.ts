import { describe, expect, it } from 'vitest'
import type { SourceLayer } from '../../support/architecture/source-import-graph'
import {
  isApprovedStaticDataResourceDependency,
  isExternalDependencyAllowed
} from '../../support/architecture/layer-dependency-policy'

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
    expect(isExternalDependencyAllowed('application', 'zod')).toBe(false)
    expect(isExternalDependencyAllowed('infrastructure', 'zod')).toBe(true)
  })
})

describe('static data resource dependency policy', () => {
  const canonicalIdentityResource = {
    sourceFile: 'shared/config/application-identity.ts',
    sourceLayer: 'shared',
    moduleSpecifier: '../../../build/application-identity.json',
    kind: 'internal',
    targetFile: null,
    targetLayer: null
  } as const

  it('permite apenas o catálogo canônico de identidade consumido pelo adaptador compartilhado', () => {
    expect(isApprovedStaticDataResourceDependency(canonicalIdentityResource)).toBe(true)
  })

  it('rejeita outra origem compartilhada para o mesmo recurso em build', () => {
    expect(
      isApprovedStaticDataResourceDependency({
        ...canonicalIdentityResource,
        sourceFile: 'shared/config/duplicated-application-identity.ts'
      })
    ).toBe(false)
  })

  it('rejeita qualquer outro alvo em build para o adaptador compartilhado', () => {
    expect(
      isApprovedStaticDataResourceDependency({
        ...canonicalIdentityResource,
        moduleSpecifier: '../../../build/other-config.json'
      })
    ).toBe(false)
  })
})
