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
  automation: ['automation', 'application', 'domain', 'shared'],
  domain: ['domain'],
  infrastructure: ['infrastructure', 'application', 'domain'],
  main: ['main', 'application', 'infrastructure', 'shared'],
  preload: ['preload', 'shared'],
  renderer: ['renderer', 'shared'],
  shared: ['shared'],
  unknown: []
}

const EXPECTED_MAIN_AUTOMATION_EDGES = [
  'main/main-application-runtime.ts->automation/browser/browser-manager.ts',
  'main/main-application-runtime.ts->automation/browser/browser-workspace-service.ts',
  'main/main-application-runtime.ts->automation/browser/platform-page-manager.ts',
  'main/main-application-runtime.ts->automation/browser/playwright-browser-launcher.ts',
  'main/main-application-runtime.ts->automation/cpi/cpi-queue-filter-controller.ts',
  'main/main-application-runtime.ts->automation/flow/continuous-research-runner.ts',
  'main/main-application-runtime.ts->automation/history/research-history-service.ts',
  'main/main-application-runtime.ts->automation/session/platform-session-service.ts',
  'main/main-application-runtime.ts->automation/workflow/agent-public-state-store.ts',
  'main/main-application-runtime.ts->automation/workflow/continuous-agent-runtime-service.ts'
] as const

const ALLOWED_MAIN_AUTOMATION_EDGES = new Set<string>(EXPECTED_MAIN_AUTOMATION_EDGES)

function edgeKey(dependency: SourceDependency): string {
  return `${dependency.sourceFile}->${dependency.targetFile ?? dependency.moduleSpecifier}`
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

        return !(
          dependency.sourceLayer === 'main' &&
          dependency.targetLayer === 'automation' &&
          ALLOWED_MAIN_AUTOMATION_EDGES.has(edgeKey(dependency))
        )
      })
      .map((dependency) => formatViolation(dependency, 'forbidden dependency direction'))
      .sort()

    expect(violations).toEqual([])
  })

  it('congela exatamente as dez arestas temporárias de composição', () => {
    const actualEdges = dependencies
      .filter(
        (dependency) => dependency.sourceLayer === 'main' && dependency.targetLayer === 'automation'
      )
      .map(edgeKey)
      .sort()

    expect(actualEdges).toEqual([...EXPECTED_MAIN_AUTOMATION_EDGES].sort())
  })
})
