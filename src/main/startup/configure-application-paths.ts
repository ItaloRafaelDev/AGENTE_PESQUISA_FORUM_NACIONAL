import { lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { APPLICATION_IDENTITY } from '../../shared/config/application-identity'
import {
  assertSafeSmokeRoot,
  type ApplicationStartupOptions,
  type SmokeRootFilesystemBoundary
} from './application-startup-options'

export interface ElectronPathBoundary {
  getPath(name: 'appData'): string
  setPath(name: 'appData' | 'userData', path: string): void
}

export interface SynchronousFilesystemBoundary extends SmokeRootFilesystemBoundary {
  mkdirSync(path: string, options: { readonly recursive: true }): void
}

export interface SmokePathSafetyContext {
  readonly temporaryDirectory: string
  readonly workspaceDirectory: string
}

export interface ConfiguredApplicationStartup {
  readonly appDataDirectory: string
  readonly userDataDirectory: string
  readonly preferredPdfDirectory?: string
  readonly smokeRoot?: string
}

const nodeFilesystem: SynchronousFilesystemBoundary = {
  mkdirSync,
  realpathSync: (path) => realpathSync.native(path),
  lstatSync,
  readdirSync: (path) => readdirSync(path)
}

function createDirectory(filesystem: SynchronousFilesystemBoundary, directoryPath: string): void {
  filesystem.mkdirSync(directoryPath, { recursive: true })
}

export function configureApplicationPaths(
  electron: ElectronPathBoundary,
  options: ApplicationStartupOptions,
  filesystem: SynchronousFilesystemBoundary = nodeFilesystem,
  smokePathSafety: SmokePathSafetyContext = {
    temporaryDirectory: tmpdir(),
    workspaceDirectory: process.cwd()
  }
): ConfiguredApplicationStartup {
  if (options.mode === 'production') {
    const appDataDirectory = electron.getPath('appData')
    const userDataDirectory = win32.join(
      appDataDirectory,
      APPLICATION_IDENTITY.legacyUserDataDirectoryName
    )

    createDirectory(filesystem, userDataDirectory)
    electron.setPath('userData', userDataDirectory)

    return { appDataDirectory, userDataDirectory }
  }

  const productionAppDataDirectory = electron.getPath('appData')
  const smokeRoot = assertSafeSmokeRoot(
    options.smokeRoot,
    smokePathSafety.temporaryDirectory,
    smokePathSafety.workspaceDirectory,
    filesystem,
    [productionAppDataDirectory]
  )
  const appDataDirectory = win32.join(smokeRoot, 'app-data')
  const userDataDirectory = win32.join(smokeRoot, 'user-data')
  const preferredPdfDirectory = win32.join(smokeRoot, 'pdf-output')

  createDirectory(filesystem, appDataDirectory)
  electron.setPath('appData', appDataDirectory)

  createDirectory(filesystem, userDataDirectory)
  electron.setPath('userData', userDataDirectory)

  createDirectory(filesystem, preferredPdfDirectory)

  return {
    appDataDirectory,
    userDataDirectory,
    preferredPdfDirectory,
    smokeRoot
  }
}
