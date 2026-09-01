import { isBuiltin } from 'node:module'
import type { SourceDependency, SourceLayer } from './source-import-graph'

const LAYERS_WITH_NODE_ACCESS = new Set<SourceLayer>(['infrastructure', 'main'])

const ALLOWED_EXTERNAL_PACKAGES: Record<SourceLayer, ReadonlySet<string>> = {
  application: new Set(),
  domain: new Set(),
  infrastructure: new Set(['better-sqlite3', 'pdf-parse', 'playwright', 'zod']),
  main: new Set(['@electron-toolkit/utils', 'electron', 'zod']),
  preload: new Set(['@electron-toolkit/preload', 'electron']),
  renderer: new Set(['react', 'react-dom']),
  shared: new Set(),
  unknown: new Set()
}

function packageName(moduleSpecifier: string): string {
  const parts = moduleSpecifier.split('/')

  return moduleSpecifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function isNodeBuiltin(moduleSpecifier: string): boolean {
  return isBuiltin(moduleSpecifier)
}

export function isApprovedStaticDataResourceDependency(dependency: SourceDependency): boolean {
  return (
    dependency.sourceFile === 'shared/config/application-identity.ts' &&
    dependency.sourceLayer === 'shared' &&
    dependency.moduleSpecifier === '../../../build/application-identity.json' &&
    dependency.kind === 'internal' &&
    dependency.targetFile === null &&
    dependency.targetLayer === null
  )
}

export function isExternalDependencyAllowed(
  sourceLayer: SourceLayer,
  moduleSpecifier: string
): boolean {
  if (isNodeBuiltin(moduleSpecifier)) {
    return LAYERS_WITH_NODE_ACCESS.has(sourceLayer)
  }

  return ALLOWED_EXTERNAL_PACKAGES[sourceLayer].has(packageName(moduleSpecifier))
}
