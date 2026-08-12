import type { BrowserContext } from 'playwright'
import { describe, expect, it } from 'vitest'
import { BrowserManager } from '@/infrastructure/automation/browser/browser-manager'
import type { BrowserLauncher } from '@/infrastructure/automation/browser/browser-types'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function createFakeContext(onClose?: () => void | Promise<void>): BrowserContext {
  return {
    close: async () => {
      await onClose?.()
    }
  } as unknown as BrowserContext
}

class FakeBrowserLauncher implements BrowserLauncher {
  public launchCount = 0
  public readonly receivedProfilePaths: string[] = []

  constructor(
    private readonly context: BrowserContext,
    private readonly launchError?: Error
  ) {}

  async launchPersistentContext(profilePath: string): Promise<BrowserContext> {
    this.launchCount += 1
    this.receivedProfilePaths.push(profilePath)

    if (this.launchError) {
      throw this.launchError
    }

    return this.context
  }
}

describe('BrowserManager', () => {
  it('deve iniciar parado', () => {
    const launcher = new FakeBrowserLauncher(createFakeContext())
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    expect(manager.getSnapshot()).toEqual({
      state: 'STOPPED',
      profilePath: 'E:\\AgenteCPI\\browser-profile',
      startedAt: null
    })
  })

  it('deve iniciar um contexto persistente usando o perfil informado', async () => {
    const context = createFakeContext()
    const launcher = new FakeBrowserLauncher(context)
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    const snapshot = await manager.start()

    expect(launcher.launchCount).toBe(1)
    expect(launcher.receivedProfilePaths).toEqual(['E:\\AgenteCPI\\browser-profile'])
    expect(snapshot.state).toBe('RUNNING')
    expect(snapshot.startedAt).toEqual(expect.any(String))
    expect(manager.getContext()).toBe(context)
  })

  it('deve bloquear uma segunda inicialização enquanto estiver executando', async () => {
    const launcher = new FakeBrowserLauncher(createFakeContext())
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    await manager.start()

    await expect(manager.start()).rejects.toThrow('Navegador não pode iniciar no estado RUNNING')

    expect(launcher.launchCount).toBe(1)
  })

  it('deve fechar o contexto e retornar ao estado parado', async () => {
    let contextClosed = false

    const launcher = new FakeBrowserLauncher(
      createFakeContext(() => {
        contextClosed = true
      })
    )

    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    await manager.start()
    const snapshot = await manager.stop()

    expect(contextClosed).toBe(true)
    expect(snapshot).toEqual({
      state: 'STOPPED',
      profilePath: 'E:\\AgenteCPI\\browser-profile',
      startedAt: null
    })
  })

  it('deve permitir uma nova inicialização depois de parar', async () => {
    const launcher = new FakeBrowserLauncher(createFakeContext())
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    await manager.start()
    await manager.stop()
    await manager.start()

    expect(launcher.launchCount).toBe(2)
    expect(manager.getSnapshot().state).toBe('RUNNING')
  })

  it('deve voltar ao estado parado quando a inicialização falhar', async () => {
    const launcher = new FakeBrowserLauncher(
      createFakeContext(),
      new Error('Falha simulada ao abrir o Chromium')
    )

    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    await expect(manager.start()).rejects.toThrow('Falha simulada ao abrir o Chromium')

    expect(manager.getSnapshot()).toEqual({
      state: 'STOPPED',
      profilePath: 'E:\\AgenteCPI\\browser-profile',
      startedAt: null
    })
  })

  it('deve impedir acesso ao contexto quando o navegador estiver parado', () => {
    const launcher = new FakeBrowserLauncher(createFakeContext())
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    expect(() => manager.getContext()).toThrow('Contexto do navegador indisponível')
  })

  it('aguarda um launcher pendente durante shutdown e fecha o contexto resultante', async () => {
    const launch = createDeferred<BrowserContext>()
    let closeCalls = 0
    const context = createFakeContext(() => {
      closeCalls += 1
    })
    const launcher: BrowserLauncher = {
      launchPersistentContext: () => launch.promise
    }
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    const startOperation = manager.start()
    const shutdownOperation = manager.shutdown()
    let shutdownSettled = false
    void shutdownOperation.then(() => {
      shutdownSettled = true
    })

    await Promise.resolve()

    expect(manager.getSnapshot().state).toBe('STARTING')
    expect(shutdownSettled).toBe(false)

    launch.resolve(context)

    await expect(startOperation).resolves.toMatchObject({ state: 'RUNNING' })
    await expect(shutdownOperation).resolves.toBeUndefined()
    expect(closeCalls).toBe(1)
    expect(manager.getSnapshot().state).toBe('STOPPED')
  })

  it('bloqueia novos starts com erro fixo após o shutdown começar', async () => {
    const manager = new BrowserManager(
      new FakeBrowserLauncher(createFakeContext()),
      'E:\\AgenteCPI\\browser-profile'
    )

    const shutdownOperation = manager.shutdown()

    await expect(manager.start()).rejects.toThrow(
      'Navegador indisponível durante o encerramento seguro.'
    )
    await expect(shutdownOperation).resolves.toBeUndefined()
  })

  it('fecha o contexto exatamente uma vez em shutdowns concorrentes', async () => {
    let closeCalls = 0
    const manager = new BrowserManager(
      new FakeBrowserLauncher(
        createFakeContext(() => {
          closeCalls += 1
        })
      ),
      'E:\\AgenteCPI\\browser-profile'
    )
    await manager.start()

    const firstShutdown = manager.shutdown()
    const secondShutdown = manager.shutdown()

    expect(secondShutdown).toBe(firstShutdown)
    await Promise.all([firstShutdown, secondShutdown])
    expect(closeCalls).toBe(1)
    expect(manager.getSnapshot().state).toBe('STOPPED')
  })

  it('aguarda um stop pendente antes de concluir shutdown', async () => {
    const close = createDeferred<void>()
    let closeCalls = 0
    const manager = new BrowserManager(
      new FakeBrowserLauncher(
        createFakeContext(async () => {
          closeCalls += 1
          await close.promise
        })
      ),
      'E:\\AgenteCPI\\browser-profile'
    )
    await manager.start()

    const stopOperation = manager.stop()
    const shutdownOperation = manager.shutdown()
    let shutdownSettled = false
    void shutdownOperation.then(() => {
      shutdownSettled = true
    })

    await Promise.resolve()

    expect(manager.getSnapshot().state).toBe('STOPPING')
    expect(shutdownSettled).toBe(false)

    close.resolve()

    await expect(stopOperation).resolves.toMatchObject({ state: 'STOPPED' })
    await expect(shutdownOperation).resolves.toBeUndefined()
    expect(closeCalls).toBe(1)
  })

  it('faz settle do shutdown mesmo quando o launcher pendente rejeita', async () => {
    const launch = createDeferred<BrowserContext>()
    const launcher: BrowserLauncher = {
      launchPersistentContext: () => launch.promise
    }
    const manager = new BrowserManager(launcher, 'E:\\AgenteCPI\\browser-profile')

    const startOperation = manager.start()
    const shutdownOperation = manager.shutdown()

    launch.reject(new Error('Falha simulada ao abrir o Chromium'))

    await expect(startOperation).rejects.toThrow('Falha simulada ao abrir o Chromium')
    await expect(shutdownOperation).resolves.toBeUndefined()
    expect(manager.getSnapshot().state).toBe('STOPPED')
  })
})
