import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  runPackagedAppSmoke,
  type PackagedAppSmokeInput,
  type PackagedAppSmokeResult
} from './lib/packaged-app-smoke'

export interface PackagedAppSmokeCliDependencies {
  readonly runSmoke: (input: PackagedAppSmokeInput) => Promise<PackagedAppSmokeResult>
  readonly writeOutput: (message: string) => void
  readonly writeError: (message: string) => void
  readonly setExitCode: (code: number) => void
}

const defaultDependencies: PackagedAppSmokeCliDependencies = {
  runSmoke: runPackagedAppSmoke,
  writeOutput: (message) => console.log(message),
  writeError: (message) => console.error(message),
  setExitCode: (code) => {
    process.exitCode = code
  }
}

function parseExecutableArgument(args: readonly string[]): string {
  if (args.length !== 1 || !args[0].startsWith('--executable=')) {
    throw new Error('Argumento inválido.')
  }

  const executablePath = args[0].slice('--executable='.length)

  if (!executablePath || !isAbsolute(executablePath)) {
    throw new Error('Argumento inválido.')
  }

  return executablePath
}

export async function runPackagedAppSmokeCli(
  args: readonly string[],
  dependencies: PackagedAppSmokeCliDependencies = defaultDependencies
): Promise<void> {
  try {
    const executablePath = parseExecutableArgument(args)
    const result = await dependencies.runSmoke({ executablePath })

    dependencies.writeOutput(
      `Smoke concluído: agente=${result.agentStatus}; navegador=${result.browserStatus}; histórico=${result.historyRecords}.`
    )
  } catch {
    dependencies.writeError('Falha no smoke do aplicativo empacotado.')
    dependencies.setExitCode(1)
  }
}

const entrypointPath = process.argv[1]

if (entrypointPath && import.meta.url === pathToFileURL(resolve(entrypointPath)).href) {
  void runPackagedAppSmokeCli(process.argv.slice(2))
}
