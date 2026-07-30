import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseAppConfig, type AppConfig } from '../config/app-config'

export interface ApplicationPathBases {
  appDataDir: string
  userDataDir: string
}

export interface OperationalPaths {
  rootDir: string
  browserProfileDir: string
  downloadsDir: string
  screenshotsDir: string
  logsDir: string
  configDir: string
}

export interface ApplicationPaths extends OperationalPaths {
  databaseFile: string
  preferredPdfDirectory: string
}

type PathConfig = AppConfig['paths']

function resolveOperationalPathsAtRoot(rootPath: string, pathConfig: PathConfig): OperationalPaths {
  const rootDir = resolve(rootPath)

  return {
    rootDir,
    browserProfileDir: join(rootDir, pathConfig.browserProfileDirectoryName),
    downloadsDir: join(rootDir, pathConfig.downloadsDirectoryName),
    screenshotsDir: join(rootDir, pathConfig.screenshotsDirectoryName),
    logsDir: join(rootDir, pathConfig.logsDirectoryName),
    configDir: join(rootDir, pathConfig.configDirectoryName)
  }
}

export function resolveOperationalPaths(
  appDataDir: string,
  pathConfig: PathConfig
): OperationalPaths {
  if (!appDataDir.trim()) {
    throw new Error('Diretório de dados operacionais não informado')
  }

  return resolveOperationalPathsAtRoot(
    join(resolve(appDataDir), pathConfig.operationalDirectoryName),
    pathConfig
  )
}

export function resolveApplicationPaths(
  bases: ApplicationPathBases,
  pathConfig: PathConfig
): ApplicationPaths {
  if (!bases.appDataDir.trim()) {
    throw new Error('Diretório de dados operacionais não informado')
  }

  if (!bases.userDataDir.trim()) {
    throw new Error('Diretório de dados do usuário não informado')
  }

  return {
    ...resolveOperationalPaths(bases.appDataDir, pathConfig),
    databaseFile: join(resolve(bases.userDataDir), pathConfig.databaseFileName),
    preferredPdfDirectory: pathConfig.preferredPdfDirectory
  }
}

export function resolveIsolatedOperationalPaths(
  rootDir: string,
  pathConfig: PathConfig
): OperationalPaths {
  if (!rootDir.trim()) {
    throw new Error('Diretório operacional raiz não informado')
  }

  return resolveOperationalPathsAtRoot(rootDir, pathConfig)
}

export async function ensureOperationalDirectories(paths: OperationalPaths): Promise<void> {
  const directories = [
    paths.rootDir,
    paths.browserProfileDir,
    paths.downloadsDir,
    paths.screenshotsDir,
    paths.logsDir,
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

export type RuntimePaths = OperationalPaths

export function resolveRuntimePaths(rootPath: string): RuntimePaths {
  return resolveIsolatedOperationalPaths(rootPath, parseAppConfig().paths)
}

export async function ensureRuntimeDirectories(paths: RuntimePaths): Promise<void> {
  await ensureOperationalDirectories(paths)
}
