import type { BrowserContext } from 'playwright'
import { describe, expect, it } from 'vitest'
import { BrowserManager } from '@/infrastructure/automation/browser/browser-manager'
import type { BrowserLauncher } from '@/infrastructure/automation/browser/browser-types'

function createFakeContext(onClose?: () => void): BrowserContext {
  return {
    close: async () => {
      onClose?.()
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
})
