import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

const INSTALLATION_ERROR_MESSAGE = 'Não foi possível preparar o Chromium necessário.'
const moduleRequire = createRequire(import.meta.url)

export interface BrowserInstallationProcess {
  run(executable: string, args: readonly string[], environment: NodeJS.ProcessEnv): Promise<number>
}

const spawnedProcess: BrowserInstallationProcess = {
  run(executable, args, environment) {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(executable, args, {
        env: environment,
        stdio: 'inherit',
        windowsHide: true
      })

      childProcess.once('error', reject)
      childProcess.once('close', (exitCode) => {
        if (exitCode === null) {
          reject(new Error(INSTALLATION_ERROR_MESSAGE))
          return
        }

        resolve(exitCode)
      })
    })
  }
}

function resolvePlaywrightCli(): string {
  const manifestPath = moduleRequire.resolve('playwright/package.json')
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))

  if (typeof manifest !== 'object' || manifest === null || !('bin' in manifest)) {
    throw new Error(INSTALLATION_ERROR_MESSAGE)
  }

  const { bin } = manifest

  if (typeof bin !== 'object' || bin === null || !('playwright' in bin)) {
    throw new Error(INSTALLATION_ERROR_MESSAGE)
  }

  const cliRelativePath = bin.playwright

  if (typeof cliRelativePath !== 'string' || cliRelativePath.trim() === '') {
    throw new Error(INSTALLATION_ERROR_MESSAGE)
  }

  const packageDirectory = dirname(manifestPath)
  const cliPath = resolve(packageDirectory, cliRelativePath)
  const relativeCliPath = relative(packageDirectory, cliPath)

  if (
    isAbsolute(cliRelativePath) ||
    relativeCliPath === '' ||
    relativeCliPath === '..' ||
    relativeCliPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(relativeCliPath)
  ) {
    throw new Error(INSTALLATION_ERROR_MESSAGE)
  }

  return cliPath
}

export async function installPlaywrightChromium(
  processBoundary: BrowserInstallationProcess = spawnedProcess
): Promise<void> {
  try {
    const playwrightCli = resolvePlaywrightCli()
    const exitCode = await processBoundary.run(
      process.execPath,
      [playwrightCli, 'install', 'chromium'],
      { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    )

    if (exitCode !== 0) {
      throw new Error(INSTALLATION_ERROR_MESSAGE)
    }
  } catch {
    throw new Error(INSTALLATION_ERROR_MESSAGE)
  }
}
