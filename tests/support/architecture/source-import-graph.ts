import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import ts from 'typescript'
import { createTypeScriptSourcePaths, resolveSourceAlias } from '../../../source-aliases'

export const SOURCE_LAYERS = [
  'application',
  'automation',
  'domain',
  'infrastructure',
  'main',
  'preload',
  'renderer',
  'shared'
] as const

export type SourceLayer = (typeof SOURCE_LAYERS)[number] | 'unknown'

export interface SourceDependency {
  sourceFile: string
  sourceLayer: SourceLayer
  moduleSpecifier: string
  kind: 'internal' | 'external'
  targetFile: string | null
  targetLayer: SourceLayer | null
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, {
    withFileTypes: true
  })
    .flatMap((entry) => {
      const entryPath = resolve(directory, entry.name)

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath)
      }

      return /\.tsx?$/.test(entry.name) ? [entryPath] : []
    })
    .sort()
}

function classifyLayer(relativeFilePath: string): SourceLayer {
  const [topLevelDirectory] = normalizePath(relativeFilePath).split('/')

  return SOURCE_LAYERS.find((layer) => layer === topLevelDirectory) ?? 'unknown'
}

function collectModuleSpecifiers(filePath: string): string[] {
  const sourceText = readFileSync(filePath, 'utf8')
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )
  const moduleSpecifiers: string[] = []

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      moduleSpecifiers.push(node.moduleSpecifier.text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      moduleSpecifiers.push(node.arguments[0].text)
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      moduleSpecifiers.push(node.argument.literal.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return moduleSpecifiers
}

function stripModuleQuery(moduleSpecifier: string): string {
  return moduleSpecifier.split(/[?#]/, 1)[0]
}

function resolveInternalBase(
  sourceRoot: string,
  sourceFile: string,
  moduleSpecifier: string
): string | null {
  const cleanSpecifier = stripModuleQuery(moduleSpecifier)

  if (cleanSpecifier.startsWith('./') || cleanSpecifier.startsWith('../')) {
    return resolve(dirname(sourceFile), cleanSpecifier)
  }

  return resolveSourceAlias(dirname(sourceRoot), cleanSpecifier)
}

function isInsideSourceRoot(sourceRoot: string, targetPath: string): boolean {
  const relativeTarget = relative(sourceRoot, targetPath)

  return (
    relativeTarget.length === 0 || (!relativeTarget.startsWith('..') && !isAbsolute(relativeTarget))
  )
}

const SOURCE_CODE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx'
])

function isSourceCodeModuleSpecifier(moduleSpecifier: string): boolean {
  const extension = extname(stripModuleQuery(moduleSpecifier))

  return extension.length === 0 || SOURCE_CODE_EXTENSIONS.has(extension)
}

function resolveInternalFile(
  sourceRoot: string,
  sourceFile: string,
  moduleSpecifier: string,
  compilerOptions: ts.CompilerOptions
): string | null {
  const internalBase = resolveInternalBase(sourceRoot, sourceFile, moduleSpecifier)

  if (!internalBase) {
    return null
  }

  if (!isSourceCodeModuleSpecifier(moduleSpecifier)) {
    try {
      return statSync(internalBase).isFile() && isInsideSourceRoot(sourceRoot, internalBase)
        ? internalBase
        : null
    } catch {
      return null
    }
  }

  const resolvedModule = ts.resolveModuleName(
    stripModuleQuery(moduleSpecifier),
    sourceFile,
    compilerOptions,
    ts.sys
  ).resolvedModule

  if (!resolvedModule) {
    return null
  }

  const resolvedFile = resolve(resolvedModule.resolvedFileName)

  return isInsideSourceRoot(sourceRoot, resolvedFile) ? resolvedFile : null
}

export function collectSourceDependencies(sourceRoot: string): SourceDependency[] {
  const absoluteSourceRoot = resolve(sourceRoot)
  const projectRoot = dirname(absoluteSourceRoot)
  const sourceFiles = listSourceFiles(absoluteSourceRoot)
  const compilerOptions: ts.CompilerOptions = {
    allowImportingTsExtensions: true,
    baseUrl: projectRoot,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    paths: createTypeScriptSourcePaths(projectRoot),
    resolveJsonModule: true
  }

  return sourceFiles
    .flatMap((sourceFile) => {
      const relativeSourceFile = normalizePath(relative(absoluteSourceRoot, sourceFile))
      const sourceLayer = classifyLayer(relativeSourceFile)

      return collectModuleSpecifiers(sourceFile).flatMap((moduleSpecifier): SourceDependency[] => {
        const internalBase = resolveInternalBase(absoluteSourceRoot, sourceFile, moduleSpecifier)

        if (!internalBase) {
          return [
            {
              sourceFile: relativeSourceFile,
              sourceLayer,
              moduleSpecifier,
              kind: 'external',
              targetFile: null,
              targetLayer: null
            }
          ]
        }

        const resolvedTarget = resolveInternalFile(
          absoluteSourceRoot,
          sourceFile,
          moduleSpecifier,
          compilerOptions
        )
        const targetFile = resolvedTarget
          ? normalizePath(relative(absoluteSourceRoot, resolvedTarget))
          : null

        return [
          {
            sourceFile: relativeSourceFile,
            sourceLayer,
            moduleSpecifier,
            kind: 'internal',
            targetFile,
            targetLayer: targetFile ? classifyLayer(targetFile) : null
          }
        ]
      })
    })
    .sort(
      (left, right) =>
        left.sourceFile.localeCompare(right.sourceFile) ||
        left.moduleSpecifier.localeCompare(right.moduleSpecifier)
    )
}
