import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installPlaywrightChromium,
  type BrowserInstallationProcess
} from '@/main/distribution/playwright-browser-installation'

const FIXED_ERROR_MESSAGE = 'Não foi possível preparar o Chromium necessário.'
const playwrightManifest = createRequire(import.meta.url).resolve('playwright/package.json')
const manifest = JSON.parse(readFileSync(playwrightManifest, 'utf8')) as {
  readonly bin: { readonly playwright: string }
}
const resolvedPlaywrightCli = resolve(dirname(playwrightManifest), manifest.bin.playwright)
const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

function createChildProcess(exitCode: number | null): EventEmitter {
  const childProcess = new EventEmitter()
  queueMicrotask(() => childProcess.emit('close', exitCode))
  return childProcess
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
  vi.doUnmock('node:fs')
  vi.doUnmock('@/main/distribution/playwright-browser-installation')
})

describe('instalação fixa do Chromium do Playwright', () => {
  it('executa somente o CLI oficial para instalar Chromium com ambiente copiado', async () => {
    const previousProbe = process.env.PLAYWRIGHT_INSTALLATION_TEST_PROBE
    process.env.PLAYWRIGHT_INSTALLATION_TEST_PROBE = 'environment-probe'
    const run = vi.fn<BrowserInstallationProcess['run']>().mockResolvedValue(0)

    try {
      await expect(installPlaywrightChromium({ run })).resolves.toBeUndefined()
      expect(run).toHaveBeenCalledOnce()
      expect(run).toHaveBeenCalledWith(
        process.execPath,
        [resolvedPlaywrightCli, 'install', 'chromium'],
        expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
          PLAYWRIGHT_INSTALLATION_TEST_PROBE: 'environment-probe'
        })
      )
      expect(run.mock.calls[0][2]).not.toBe(process.env)
    } finally {
      if (previousProbe === undefined) delete process.env.PLAYWRIGHT_INSTALLATION_TEST_PROBE
      else process.env.PLAYWRIGHT_INSTALLATION_TEST_PROBE = previousProbe
    }
  })

  it('ignora argumentos extras de caller e mantém o navegador fixo em Chromium', async () => {
    const run = vi.fn<BrowserInstallationProcess['run']>().mockResolvedValue(0)
    const invokeWithUntrustedBrowser = installPlaywrightChromium as unknown as (
      processBoundary: BrowserInstallationProcess,
      browserName: string
    ) => Promise<void>

    await invokeWithUntrustedBrowser({ run }, 'firefox')

    expect(run.mock.calls[0][1]).toEqual([resolvedPlaywrightCli, 'install', 'chromium'])
  })

  it.each([1, 7, null])('rejeita o código de saída %s com mensagem fixa', async (exitCode) => {
    const run = vi.fn().mockResolvedValue(exitCode)
    await expect(installPlaywrightChromium({ run } as BrowserInstallationProcess)).rejects.toEqual(
      new Error(FIXED_ERROR_MESSAGE)
    )
  })

  it('substitui falha bruta do processo sem vazar erro, ambiente ou caminho do CLI', async () => {
    const rawFailure = `spawn secret-environment ${resolvedPlaywrightCli}`
    const run = vi.fn<BrowserInstallationProcess['run']>().mockRejectedValue(new Error(rawFailure))
    const rejection = installPlaywrightChromium({ run }).catch((error: unknown) => error)

    await expect(rejection).resolves.toEqual(new Error(FIXED_ERROR_MESSAGE))
    await expect(rejection).resolves.not.toMatchObject({
      message: expect.stringContaining(rawFailure)
    })
    await expect(rejection).resolves.not.toMatchObject({
      message: expect.stringContaining(resolvedPlaywrightCli)
    })
  })

  it.each([
    ['campo bin ausente', {}],
    ['campo bin com tipo inválido', { bin: 'cli.js' }],
    ['executável ausente', { bin: {} }],
    ['executável vazio', { bin: { playwright: '' } }],
    ['executável absoluto', { bin: { playwright: 'C:\\unsafe\\cli.js' } }],
    ['executável fora do pacote', { bin: { playwright: '../unsafe/cli.js' } }]
  ])('rejeita manifesto oficial com %s antes de executar processo', async (_, invalidManifest) => {
    const readManifest = vi.fn().mockReturnValue(JSON.stringify(invalidManifest))
    const run = vi.fn<BrowserInstallationProcess['run']>().mockResolvedValue(0)
    vi.resetModules()
    vi.doMock('node:fs', () => ({ readFileSync: readManifest }))

    const module = await import('@/main/distribution/playwright-browser-installation')
    const rejection = module.installPlaywrightChromium({ run })

    await expect(rejection).rejects.toEqual(new Error(FIXED_ERROR_MESSAGE))
    expect(readManifest).toHaveBeenCalledWith(playwrightManifest, 'utf8')
    expect(run).not.toHaveBeenCalled()
  })

  it('usa spawn sem shell, com stdio herdado e janela oculta', async () => {
    spawnMock.mockReturnValue(createChildProcess(0))
    await expect(installPlaywrightChromium()).resolves.toBeUndefined()

    expect(spawnMock).toHaveBeenCalledOnce()
    const [executable, args, options] = spawnMock.mock.calls[0]
    expect(executable).toBe(process.execPath)
    expect(args).toEqual([resolvedPlaywrightCli, 'install', 'chromium'])
    expect(options.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(options.stdio).toBe('inherit')
    expect(options.windowsHide).toBe(true)
    expect('shell' in options).toBe(false)
  })

  it('normaliza código nulo e falha de spawn no processo padrão', async () => {
    spawnMock.mockReturnValueOnce(createChildProcess(null))
    await expect(installPlaywrightChromium()).rejects.toEqual(new Error(FIXED_ERROR_MESSAGE))

    const failedChildProcess = new EventEmitter()
    spawnMock.mockReturnValueOnce(failedChildProcess)
    const rejection = installPlaywrightChromium()
    queueMicrotask(() => failedChildProcess.emit('error', new Error('raw spawn failure')))
    await expect(rejection).rejects.toEqual(new Error(FIXED_ERROR_MESSAGE))
  })
})

describe('entry point empacotado da instalação', () => {
  it('imprime somente a falha fixa e define exit code 1 quando a instalação rejeita', async () => {
    const previousExitCode = process.exitCode
    const install = vi.fn().mockRejectedValue(new Error('raw helper failure'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    process.exitCode = undefined
    vi.resetModules()
    vi.doMock('@/main/distribution/playwright-browser-installation', () => ({
      installPlaywrightChromium: install
    }))

    try {
      await import('@/main/install-playwright-chromium')
      await vi.waitFor(() => expect(process.exitCode).toBe(1))
      expect(install).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith(FIXED_ERROR_MESSAGE)
    } finally {
      process.exitCode = previousExitCode
    }
  })
})
