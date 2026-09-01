import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'

export type ApplicationStartupOptions =
  { readonly mode: 'production' } | { readonly mode: 'smoke'; readonly smokeRoot: string }

const SMOKE_MODE_ARGUMENT = '--smoke-test'
const SMOKE_ROOT_ARGUMENT_PREFIX = '--smoke-root='
const SMOKE_ROOT_BASENAME_PREFIX = 'agente-cpi-smoke-'

export interface SmokeRootFilesystemBoundary {
  realpathSync(path: string): string
  lstatSync(path: string): {
    isDirectory(): boolean
    isSymbolicLink(): boolean
  }
  readdirSync(path: string): string[]
}

const nodeFilesystem: SmokeRootFilesystemBoundary = {
  realpathSync: (path) => realpathSync.native(path),
  lstatSync,
  readdirSync: (path) => readdirSync(path)
}

function isContainedPath(parentPath: string, candidatePath: string): boolean {
  const relativePath = win32.relative(parentPath, candidatePath)

  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith('..\\') &&
    !win32.isAbsolute(relativePath)
  )
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  return (
    win32.normalize(leftPath) === win32.normalize(rightPath) ||
    isContainedPath(leftPath, rightPath) ||
    isContainedPath(rightPath, leftPath)
  )
}

export function assertSafeSmokeRoot(
  requestedSmokeRoot: string,
  temporaryDirectory: string,
  workspaceDirectory: string,
  filesystem: SmokeRootFilesystemBoundary = nodeFilesystem,
  protectedDirectories: readonly string[] = []
): string {
  try {
    const temporaryMetadata = filesystem.lstatSync(temporaryDirectory)
    const smokeRootMetadata = filesystem.lstatSync(requestedSmokeRoot)

    if (temporaryMetadata.isSymbolicLink()) {
      throw new Error('O diretório temporário não pode ser um reparse point')
    }

    if (!temporaryMetadata.isDirectory()) {
      throw new Error('O diretório temporário deve ser um diretório')
    }

    if (smokeRootMetadata.isSymbolicLink()) {
      throw new Error('A raiz do smoke test não pode ser um reparse point')
    }

    if (!smokeRootMetadata.isDirectory()) {
      throw new Error('A raiz do smoke test deve ser um diretório')
    }

    const canonicalTemporaryDirectory = win32.resolve(filesystem.realpathSync(temporaryDirectory))
    const canonicalSmokeRoot = win32.resolve(filesystem.realpathSync(requestedSmokeRoot))
    const canonicalWorkspace = win32.resolve(filesystem.realpathSync(workspaceDirectory))

    if (!isContainedPath(canonicalTemporaryDirectory, canonicalSmokeRoot)) {
      throw new Error('A raiz canônica do smoke test deve estar abaixo do diretório temporário')
    }

    if (pathsOverlap(canonicalSmokeRoot, canonicalWorkspace)) {
      throw new Error('A raiz do smoke test não pode alcançar o workspace')
    }

    for (const protectedDirectory of protectedDirectories) {
      const canonicalProtectedDirectory = win32.resolve(filesystem.realpathSync(protectedDirectory))

      if (pathsOverlap(canonicalSmokeRoot, canonicalProtectedDirectory)) {
        throw new Error('A raiz do smoke test não pode alcançar dados de produção')
      }
    }

    if (filesystem.readdirSync(canonicalSmokeRoot).length !== 0) {
      throw new Error('A raiz do smoke test deve estar vazia')
    }

    return canonicalSmokeRoot
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A raiz')) {
      throw error
    }

    if (error instanceof Error && error.message.startsWith('O diretório temporário')) {
      throw error
    }

    throw new Error('Não foi possível validar a raiz do smoke test')
  }
}

export function parseApplicationStartupOptions(
  args: readonly string[],
  temporaryDirectory = tmpdir(),
  filesystem: SmokeRootFilesystemBoundary = nodeFilesystem,
  workspaceDirectory = process.cwd(),
  protectedDirectories: readonly string[] = process.env.APPDATA ? [process.env.APPDATA] : []
): ApplicationStartupOptions {
  const smokeModeArguments = args.filter((argument) => argument === SMOKE_MODE_ARGUMENT)
  const smokeRootArguments = args.filter(
    (argument) => argument === '--smoke-root' || argument.startsWith(SMOKE_ROOT_ARGUMENT_PREFIX)
  )

  if (smokeModeArguments.length === 0 && smokeRootArguments.length === 0) {
    return { mode: 'production' }
  }

  if (smokeModeArguments.length !== 1 || smokeRootArguments.length !== 1) {
    throw new Error('Argumentos de smoke test inválidos')
  }

  const smokeRootArgument = smokeRootArguments[0]
  const requestedSmokeRoot = smokeRootArgument.slice(SMOKE_ROOT_ARGUMENT_PREFIX.length)

  if (!requestedSmokeRoot || !win32.isAbsolute(requestedSmokeRoot)) {
    throw new Error('A raiz do smoke test deve ser absoluta')
  }

  const resolvedTemporaryDirectory = win32.resolve(temporaryDirectory)
  const resolvedSmokeRoot = win32.resolve(requestedSmokeRoot)

  if (win32.parse(resolvedSmokeRoot).root === resolvedSmokeRoot) {
    throw new Error('A raiz do sistema de arquivos não pode ser usada no smoke test')
  }

  if (!isContainedPath(resolvedTemporaryDirectory, resolvedSmokeRoot)) {
    throw new Error('A raiz do smoke test deve estar abaixo do diretório temporário')
  }

  if (!win32.basename(resolvedSmokeRoot).startsWith(SMOKE_ROOT_BASENAME_PREFIX)) {
    throw new Error('A raiz do smoke test não usa o prefixo esperado')
  }

  return {
    mode: 'smoke',
    smokeRoot: assertSafeSmokeRoot(
      resolvedSmokeRoot,
      resolvedTemporaryDirectory,
      workspaceDirectory,
      filesystem,
      protectedDirectories
    )
  }
}
