import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'

export interface PackagedAppSmokeInput {
  readonly executablePath: string
  readonly temporaryParent?: string
}

export interface PackagedAppSmokeResult {
  readonly agentStatus: 'PARADO'
  readonly browserStatus: 'STOPPED'
  readonly historyRecords: number
}

type InspectedPathKind = 'file' | 'directory' | 'missing'

interface PackagedAppPageBoundary {
  waitForLoadState(state: 'domcontentloaded'): Promise<void>
  evaluate<T>(evaluator: () => Promise<T>): Promise<T>
}

interface PackagedElectronApplicationBoundary {
  firstWindow(): Promise<PackagedAppPageBoundary>
  windows(): readonly PackagedAppPageBoundary[]
  close(): Promise<void>
}

export interface PackagedAppSmokeDependencies {
  readonly mkdtemp: (prefix: string) => Promise<string>
  readonly launch: (options: {
    readonly executablePath: string
    readonly args: string[]
  }) => Promise<PackagedElectronApplicationBoundary>
  readonly inspectPath: (path: string) => Promise<InspectedPathKind>
  readonly removeTemporaryRoot: (path: string) => Promise<void>
}

interface SafeRendererSnapshot {
  readonly apiKeys: readonly string[]
  readonly agentStatus: string
  readonly browserStatus: string
  readonly historyRecords: number
  readonly sessionsChecked: boolean
}

async function evaluateSafeRendererSnapshot(): Promise<SafeRendererSnapshot> {
  interface SmokeAgentApi {
    readonly browser: { getStatus(): Promise<{ readonly state: string }> }
    readonly control: { getState(): Promise<{ readonly status: string }> }
    readonly history: {
      list(input: {
        readonly page: number
        readonly pageSize: number
      }): Promise<{ readonly total: number }>
    }
    readonly pdf: object
    readonly sessions: { getStatus(): Promise<unknown> }
  }

  const scope = globalThis as unknown as { readonly window: { readonly agent: SmokeAgentApi } }
  const agent = scope.window.agent
  const [control, browser, sessions, history] = await Promise.all([
    agent.control.getState(),
    agent.browser.getStatus(),
    agent.sessions.getStatus(),
    agent.history.list({ page: 1, pageSize: 50 })
  ])

  return {
    apiKeys: Object.keys(agent).sort(),
    agentStatus: control.status,
    browserStatus: browser.state,
    historyRecords: history.total,
    sessionsChecked: sessions !== undefined
  }
}

const defaultDependencies: PackagedAppSmokeDependencies = {
  mkdtemp,
  launch: (options) => _electron.launch(options),
  inspectPath: async (path) => {
    try {
      const metadata = await stat(path)

      if (metadata.isFile()) {
        return 'file'
      }

      return metadata.isDirectory() ? 'directory' : 'missing'
    } catch {
      return 'missing'
    }
  },
  removeTemporaryRoot: (path) => rm(path, { recursive: true, force: true })
}

function requireSingleWindow(electronApp: PackagedElectronApplicationBoundary): void {
  if (electronApp.windows().length !== 1) {
    throw new Error('O smoke empacotado requer exatamente uma janela.')
  }
}

function parseSafeSnapshot(snapshot: SafeRendererSnapshot): PackagedAppSmokeResult {
  const requiredApiKeys = ['browser', 'control', 'history', 'pdf', 'sessions']

  if (
    snapshot.apiKeys.length !== requiredApiKeys.length ||
    snapshot.apiKeys.some((key, index) => key !== requiredApiKeys[index]) ||
    snapshot.agentStatus !== 'PARADO' ||
    snapshot.browserStatus !== 'STOPPED' ||
    !Number.isSafeInteger(snapshot.historyRecords) ||
    snapshot.historyRecords < 0 ||
    !snapshot.sessionsChecked
  ) {
    throw new Error('O aplicativo empacotado retornou um estado de smoke inválido.')
  }

  return {
    agentStatus: snapshot.agentStatus,
    browserStatus: snapshot.browserStatus,
    historyRecords: snapshot.historyRecords
  }
}

async function requireSmokeArtifacts(
  smokeRoot: string,
  dependencies: PackagedAppSmokeDependencies
): Promise<void> {
  const requiredArtifacts: ReadonlyArray<readonly [string, InspectedPathKind]> = [
    [join(smokeRoot, 'user-data', 'agente-cpi.sqlite'), 'file'],
    [join(smokeRoot, 'app-data', 'AgenteCPI', 'browser-profile'), 'directory'],
    [join(smokeRoot, 'app-data', 'AgenteCPI', 'downloads'), 'directory'],
    [join(smokeRoot, 'app-data', 'AgenteCPI', 'screenshots'), 'directory'],
    [join(smokeRoot, 'app-data', 'AgenteCPI', 'logs'), 'directory'],
    [join(smokeRoot, 'app-data', 'AgenteCPI', 'config'), 'directory'],
    [join(smokeRoot, 'pdf-output'), 'directory']
  ]

  for (const [path, expectedKind] of requiredArtifacts) {
    if ((await dependencies.inspectPath(path)) !== expectedKind) {
      throw new Error('O smoke empacotado não produziu todos os artefatos obrigatórios.')
    }
  }
}

export async function runPackagedAppSmoke(
  input: PackagedAppSmokeInput,
  dependencies: PackagedAppSmokeDependencies = defaultDependencies
): Promise<PackagedAppSmokeResult> {
  const temporaryPrefix = join(resolve(input.temporaryParent ?? tmpdir()), 'agente-cpi-smoke-')
  const smokeRoot = await dependencies.mkdtemp(temporaryPrefix)
  let smokeError: unknown
  let result: PackagedAppSmokeResult | undefined

  try {
    const electronApp = await dependencies.launch({
      executablePath: resolve(input.executablePath),
      args: ['--smoke-test', `--smoke-root=${smokeRoot}`]
    })

    try {
      const page = await electronApp.firstWindow()

      await page.waitForLoadState('domcontentloaded')
      requireSingleWindow(electronApp)

      const snapshot = await page.evaluate(evaluateSafeRendererSnapshot)

      requireSingleWindow(electronApp)
      result = parseSafeSnapshot(snapshot)
    } catch (error) {
      smokeError = error
    }

    try {
      await electronApp.close()
    } catch (error) {
      smokeError ??= error
    }

    if (smokeError === undefined) {
      await requireSmokeArtifacts(smokeRoot, dependencies)
    }
  } catch (error) {
    smokeError ??= error
  }

  try {
    await dependencies.removeTemporaryRoot(smokeRoot)
  } catch {
    if (smokeError === undefined) {
      throw new Error('Falha ao limpar o diretório temporário do smoke.')
    }
  }

  if (smokeError !== undefined) {
    throw smokeError
  }

  if (result === undefined) {
    throw new Error('O aplicativo empacotado retornou um estado de smoke inválido.')
  }

  return result
}
