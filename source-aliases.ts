import { resolve } from 'node:path'

const SOURCE_ALIAS_RELATIVE_TARGETS = {
  '@': 'src',
  '@renderer': 'src/renderer/src'
} as const

export type SourceAlias = keyof typeof SOURCE_ALIAS_RELATIVE_TARGETS

export function createSourceAliases(projectRoot: string): Record<SourceAlias, string> {
  return {
    '@': resolve(projectRoot, SOURCE_ALIAS_RELATIVE_TARGETS['@']),
    '@renderer': resolve(projectRoot, SOURCE_ALIAS_RELATIVE_TARGETS['@renderer'])
  }
}

export function createTypeScriptSourcePaths(projectRoot: string): Record<string, string[]> {
  const aliases = createSourceAliases(projectRoot)

  return {
    '@': [aliases['@']],
    '@/*': [`${aliases['@']}/*`],
    '@renderer': [aliases['@renderer']],
    '@renderer/*': [`${aliases['@renderer']}/*`]
  }
}

export function resolveSourceAlias(projectRoot: string, moduleSpecifier: string): string | null {
  const aliases = createSourceAliases(projectRoot)

  for (const [alias, target] of Object.entries(aliases)) {
    if (moduleSpecifier === alias) {
      return target
    }

    if (moduleSpecifier.startsWith(`${alias}/`)) {
      return resolve(target, moduleSpecifier.slice(alias.length + 1))
    }
  }

  return null
}
