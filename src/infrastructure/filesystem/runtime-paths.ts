import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface RuntimePaths {
  rootDir: string
  browserProfileDir: string
  downloadsDir: string
  screenshotsDir: string
  logsDir: string
  databaseDir: string
  databaseFile: string
  configDir: string
}

export function resolveRuntimePaths(rootPath: string): RuntimePaths {
  if (!rootPath.trim()) {
    throw new Error('Diretório operacional raiz não informado')
  }

  const rootDir = resolve(rootPath)
  const databaseDir = join(rootDir, 'database')

  return {
    rootDir,
    browserProfileDir: join(rootDir, 'browser-profile'),
    downloadsDir: join(rootDir, 'downloads'),
    screenshotsDir: join(rootDir, 'screenshots'),
    logsDir: join(rootDir, 'logs'),
    databaseDir,
    databaseFile: join(databaseDir, 'agent.db'),
    configDir: join(rootDir, 'config')
  }
}

export async function ensureRuntimeDirectories(paths: RuntimePaths): Promise<void> {
  const directories = [
    paths.rootDir,
    paths.browserProfileDir,
    paths.downloadsDir,
    paths.screenshotsDir,
    paths.logsDir,
    paths.databaseDir,
    paths.configDir
  ]

  await Promise.all(
    directories.map((directory) =>
      mkdir(directory, {
        recursive: true
      })
    )
  )
}
