import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  runPackagedAppSmoke,
  type PackagedAppSmokeDependencies
} from '../../../scripts/lib/packaged-app-smoke'
import {
  runPackagedAppSmokeCli,
  type PackagedAppSmokeCliDependencies
} from '../../../scripts/smoke-packaged-app'

const temporaryParent = resolve('temporary')
const smokeRoot = join(temporaryParent, 'agente-cpi-smoke-fixed')
const relativeExecutablePath = join('release', 'win-unpacked', 'AgenteCPI.exe')
const executablePath = resolve('release/win-unpacked/AgenteCPI.exe')

interface FakeOptions {
  readonly closeError?: Error
  readonly evaluationError?: Error
  readonly removalError?: Error
  readonly windowCount?: number
}

const requiredSmokeArtifactPaths = [
  join(smokeRoot, 'user-data', 'agente-cpi.sqlite'),
  join(smokeRoot, 'app-data', 'AgenteCPI', 'browser-profile'),
  join(smokeRoot, 'app-data', 'AgenteCPI', 'downloads'),
  join(smokeRoot, 'app-data', 'AgenteCPI', 'screenshots'),
  join(smokeRoot, 'app-data', 'AgenteCPI', 'logs'),
  join(smokeRoot, 'app-data', 'AgenteCPI', 'config'),
  join(smokeRoot, 'pdf-output')
] as const

function createDependencies(options: FakeOptions = {}): {
  readonly dependencies: PackagedAppSmokeDependencies
  readonly events: string[]
  readonly mkdtemp: ReturnType<typeof vi.fn>
  readonly launch: ReturnType<typeof vi.fn>
  readonly windowChecks: ReturnType<typeof vi.fn>
  readonly inspectPath: ReturnType<typeof vi.fn>
  readonly removeTemporaryRoot: ReturnType<typeof vi.fn>
  readonly forbiddenCalls: ReturnType<typeof vi.fn>[]
} {
  const events: string[] = []
  const forbidden = (name: string): ReturnType<typeof vi.fn> =>
    vi.fn(() => {
      throw new Error(`API operacional proibida: ${name}`)
    })
  const forbiddenCalls = [
    forbidden('browser.start'),
    forbidden('browser.stop'),
    forbidden('control.start'),
    forbidden('control.stop'),
    forbidden('control.pause'),
    forbidden('control.resume'),
    forbidden('control.loginCompleted'),
    forbidden('history.clear'),
    forbidden('pdf.open'),
    forbidden('pdf.reveal')
  ]
  const [
    browserStart,
    browserStop,
    controlStart,
    controlStop,
    controlPause,
    controlResume,
    loginCompleted,
    historyClear,
    pdfOpen,
    pdfReveal
  ] = forbiddenCalls
  const page = {
    waitForLoadState: vi.fn(async (state: string) => {
      events.push(`ready:${state}`)
    }),
    evaluate: vi.fn(async (evaluator: () => Promise<unknown>) => {
      events.push('evaluate')

      if (options.evaluationError) {
        throw options.evaluationError
      }

      const previousWindow = Reflect.get(globalThis, 'window')
      Reflect.set(globalThis, 'window', {
        agent: {
          browser: {
            start: browserStart,
            stop: browserStop,
            getStatus: vi.fn(async () => {
              events.push('api:browser.getStatus')

              return { state: 'STOPPED', profilePath: 'not-serialized', startedAt: null }
            })
          },
          control: {
            getState: vi.fn(async () => {
              events.push('api:control.getState')

              return { status: 'PARADO', lastError: { message: 'not-serialized' } }
            }),
            start: controlStart,
            stop: controlStop,
            pause: controlPause,
            resume: controlResume,
            loginCompleted,
            onStateChanged: forbidden('control.onStateChanged')
          },
          history: {
            list: vi.fn(async (input: { page: number; pageSize: number }) => {
              events.push(`api:history.list:${input.page}:${input.pageSize}`)

              return { items: [], page: 1, pageSize: 50, total: 0, totalPages: 0 }
            }),
            clear: historyClear,
            onRecordCreated: forbidden('history.onRecordCreated'),
            onRecordUpdated: forbidden('history.onRecordUpdated'),
            onCleared: forbidden('history.onCleared')
          },
          pdf: { open: pdfOpen, reveal: pdfReveal },
          sessions: {
            getStatus: vi.fn(async () => {
              events.push('api:sessions.getStatus')

              return {
                cpi: { state: 'INDETERMINATE', url: null },
                deskData: { state: 'INDETERMINATE', url: null },
                allAuthenticated: false,
                checkedAt: null
              }
            })
          }
        }
      })

      try {
        return await evaluator()
      } finally {
        if (previousWindow === undefined) {
          Reflect.deleteProperty(globalThis, 'window')
        } else {
          Reflect.set(globalThis, 'window', previousWindow)
        }
      }
    }),
    url: forbidden('page.url')
  }
  const applicationWindows = Array.from({ length: options.windowCount ?? 1 }, () => page)
  const windowChecks = vi.fn(() => {
    events.push('windows')

    return applicationWindows
  })
  const electronApp = {
    firstWindow: vi.fn(async () => {
      events.push('firstWindow')

      return page
    }),
    windows: windowChecks,
    close: vi.fn(async () => {
      events.push('close')

      if (options.closeError) {
        throw options.closeError
      }
    })
  }
  const launch = vi.fn(async () => {
    events.push('launch')

    return electronApp
  })
  const inspectPath = vi.fn(async (path: string) => {
    events.push(`inspect:${path}`)

    return path.endsWith('agente-cpi.sqlite') ? 'file' : 'directory'
  })
  const removeTemporaryRoot = vi.fn(async (path: string) => {
    events.push(`remove:${path}`)

    if (options.removalError) {
      throw options.removalError
    }
  })
  const createTemporaryRoot = vi.fn(async (prefix: string) => {
    events.push(`mkdtemp:${prefix}`)

    return smokeRoot
  })

  return {
    dependencies: {
      mkdtemp: createTemporaryRoot,
      launch,
      inspectPath,
      removeTemporaryRoot
    },
    events,
    mkdtemp: createTemporaryRoot,
    launch,
    windowChecks,
    inspectPath,
    removeTemporaryRoot,
    forbiddenCalls
  }
}

describe('smoke offline do aplicativo empacotado', () => {
  it('inicia uma única janela isolada e consulta somente o estado seguro', async () => {
    const fake = createDependencies()

    await expect(
      runPackagedAppSmoke(
        { executablePath: relativeExecutablePath, temporaryParent },
        fake.dependencies
      )
    ).resolves.toEqual({ agentStatus: 'PARADO', browserStatus: 'STOPPED', historyRecords: 0 })

    expect(fake.mkdtemp).toHaveBeenCalledExactlyOnceWith(
      join(resolve(temporaryParent), 'agente-cpi-smoke-')
    )
    expect(fake.launch).toHaveBeenCalledExactlyOnceWith({
      executablePath,
      args: ['--smoke-test', `--smoke-root=${smokeRoot}`]
    })
    expect(fake.events.indexOf('firstWindow')).toBeLessThan(
      fake.events.indexOf('ready:domcontentloaded')
    )
    expect(fake.events.indexOf('ready:domcontentloaded')).toBeLessThan(
      fake.events.indexOf('evaluate')
    )
    expect(fake.events.filter((event) => event.startsWith('api:'))).toEqual([
      'api:control.getState',
      'api:browser.getStatus',
      'api:sessions.getStatus',
      'api:history.list:1:50'
    ])
    expect(fake.windowChecks).toHaveBeenCalledTimes(2)
    expect(fake.forbiddenCalls).toSatisfy((calls: ReturnType<typeof vi.fn>[]) =>
      calls.every((call) => call.mock.calls.length === 0)
    )
  })

  it('fecha o Electron, verifica todos os artefatos e remove o diretório temporário em ordem', async () => {
    const fake = createDependencies()

    await runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)

    expect(fake.inspectPath.mock.calls).toEqual(requiredSmokeArtifactPaths.map((path) => [path]))
    expect(fake.events).toEqual([
      `mkdtemp:${join(resolve(temporaryParent), 'agente-cpi-smoke-')}`,
      'launch',
      'firstWindow',
      'ready:domcontentloaded',
      'windows',
      'evaluate',
      'api:control.getState',
      'api:browser.getStatus',
      'api:sessions.getStatus',
      'api:history.list:1:50',
      'windows',
      'close',
      ...requiredSmokeArtifactPaths.map((path) => `inspect:${path}`),
      `remove:${smokeRoot}`
    ])
    expect(fake.removeTemporaryRoot).toHaveBeenCalledExactlyOnceWith(smokeRoot)
  })

  it('rejeita uma segunda janela sem executar ações operacionais', async () => {
    const fake = createDependencies({ windowCount: 2 })

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toThrow('O smoke empacotado requer exatamente uma janela.')
    expect(fake.forbiddenCalls).toSatisfy((calls: ReturnType<typeof vi.fn>[]) =>
      calls.every((call) => call.mock.calls.length === 0)
    )
    expect(fake.events).toEqual([
      `mkdtemp:${join(resolve(temporaryParent), 'agente-cpi-smoke-')}`,
      'launch',
      'firstWindow',
      'ready:domcontentloaded',
      'windows',
      'close',
      `remove:${smokeRoot}`
    ])
    expect(fake.removeTemporaryRoot).toHaveBeenCalledExactlyOnceWith(smokeRoot)
  })

  it('remove o diretório temporário e preserva a falha isolada de close', async () => {
    const closeError = new Error('falha de fechamento controlada')
    const fake = createDependencies({ closeError })

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toBe(closeError)
    expect(fake.inspectPath).not.toHaveBeenCalled()
    expect(fake.events.indexOf('close')).toBeLessThan(fake.events.indexOf(`remove:${smokeRoot}`))
    expect(fake.removeTemporaryRoot).toHaveBeenCalledExactlyOnceWith(smokeRoot)
  })

  it('preserva o primeiro erro quando avaliação e close falham e ainda remove o diretório', async () => {
    const evaluationError = new Error('falha primária controlada')
    const fake = createDependencies({
      evaluationError,
      closeError: new Error('falha secundária de fechamento')
    })

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toBe(evaluationError)
    expect(fake.events.indexOf('evaluate')).toBeLessThan(fake.events.indexOf('close'))
    expect(fake.events.indexOf('close')).toBeLessThan(fake.events.indexOf(`remove:${smokeRoot}`))
    expect(fake.removeTemporaryRoot).toHaveBeenCalledExactlyOnceWith(smokeRoot)
  })

  it('preserva o erro primário quando o smoke e a remoção temporária falham', async () => {
    const smokeError = new Error('falha primária controlada')
    const fake = createDependencies({
      evaluationError: smokeError,
      removalError: new Error('caminho sensível que não deve prevalecer')
    })

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toBe(smokeError)
  })

  it('usa mensagem pública fixa quando apenas a remoção temporária falha', async () => {
    const fake = createDependencies({ removalError: new Error('caminho sensível') })

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toThrow('Falha ao limpar o diretório temporário do smoke.')
  })

  it('rejeita artefato obrigatório ausente antes de remover o diretório temporário', async () => {
    const fake = createDependencies()
    fake.inspectPath.mockResolvedValueOnce('missing')

    await expect(
      runPackagedAppSmoke({ executablePath, temporaryParent }, fake.dependencies)
    ).rejects.toThrow('O smoke empacotado não produziu todos os artefatos obrigatórios.')
    expect(fake.removeTemporaryRoot).toHaveBeenCalledExactlyOnceWith(smokeRoot)
  })
})

describe('CLI do smoke empacotado', () => {
  function createCliDependencies(): {
    readonly dependencies: PackagedAppSmokeCliDependencies
    readonly runSmoke: ReturnType<typeof vi.fn>
    readonly writeOutput: ReturnType<typeof vi.fn>
    readonly writeError: ReturnType<typeof vi.fn>
    readonly setExitCode: ReturnType<typeof vi.fn>
  } {
    const runSmoke = vi.fn(async () => ({
      agentStatus: 'PARADO' as const,
      browserStatus: 'STOPPED' as const,
      historyRecords: 0
    }))
    const writeOutput = vi.fn()
    const writeError = vi.fn()
    const setExitCode = vi.fn()

    return {
      dependencies: { runSmoke, writeOutput, writeError, setExitCode },
      runSmoke,
      writeOutput,
      writeError,
      setExitCode
    }
  }

  it('aceita exatamente um executável absoluto e imprime somente o resumo seguro', async () => {
    const fake = createCliDependencies()

    await runPackagedAppSmokeCli([`--executable=${executablePath}`], fake.dependencies)

    expect(fake.runSmoke).toHaveBeenCalledExactlyOnceWith({ executablePath })
    expect(fake.writeOutput).toHaveBeenCalledExactlyOnceWith(
      'Smoke concluído: agente=PARADO; navegador=STOPPED; histórico=0.'
    )
    expect(fake.writeError).not.toHaveBeenCalled()
    expect(fake.setExitCode).not.toHaveBeenCalled()
  })

  it.each([
    [],
    ['--executable=relative/AgenteCPI.exe'],
    [`--executable=${executablePath}`, '--extra']
  ])('rejeita argumentos inválidos sem iniciar o aplicativo: %j', async (args) => {
    const fake = createCliDependencies()

    await runPackagedAppSmokeCli(args, fake.dependencies)

    expect(fake.runSmoke).not.toHaveBeenCalled()
    expect(fake.writeOutput).not.toHaveBeenCalled()
    expect(fake.writeError).toHaveBeenCalledExactlyOnceWith(
      'Falha no smoke do aplicativo empacotado.'
    )
    expect(fake.setExitCode).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('mascara a rejeição do smoke com erro e código públicos fixos', async () => {
    const fake = createCliDependencies()
    fake.runSmoke.mockRejectedValueOnce(new Error('credencial ou caminho sensível'))

    await runPackagedAppSmokeCli([`--executable=${executablePath}`], fake.dependencies)

    expect(fake.writeOutput).not.toHaveBeenCalled()
    expect(fake.writeError).toHaveBeenCalledExactlyOnceWith(
      'Falha no smoke do aplicativo empacotado.'
    )
    expect(fake.setExitCode).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('registra somente o comando canônico do smoke empacotado', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>
    }

    expect(packageJson.scripts?.['smoke:packaged']).toBe('tsx scripts/smoke-packaged-app.ts')
  })
})
