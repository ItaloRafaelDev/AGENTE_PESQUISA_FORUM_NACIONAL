import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseAppConfig } from '@/infrastructure/config/app-config'
import {
  ensureOperationalDirectories,
  resolveApplicationPaths,
  resolveIsolatedOperationalPaths,
  resolveOperationalPaths
} from '@/infrastructure/filesystem/runtime-paths'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  )
})

describe('resolveApplicationPaths', () => {
  it('separa o armazenamento operacional do banco canônico do usuário', () => {
    const config = parseAppConfig()
    const appDataDir = resolve('E:\\Users\\Operador\\AppData\\Roaming')
    const userDataDir = resolve('E:\\Users\\Operador\\AppData\\Roaming\\agente-cpi')

    const paths = resolveApplicationPaths({ appDataDir, userDataDir }, config.paths)

    expect(paths).toMatchObject({
      rootDir: join(appDataDir, 'AgenteCPI'),
      browserProfileDir: join(appDataDir, 'AgenteCPI', 'browser-profile'),
      downloadsDir: join(appDataDir, 'AgenteCPI', 'downloads'),
      databaseFile: join(userDataDir, 'agente-cpi.sqlite'),
      preferredPdfDirectory: 'E:\\PDF-AGENTE-CPI'
    })
    expect(JSON.stringify(paths)).not.toContain('database/agent.db')
    expect(JSON.stringify(paths)).not.toContain('database\\agent.db')
  })

  it('rejeita bases operacionais em branco antes de resolver caminhos', () => {
    const config = parseAppConfig()

    expect(() => resolveOperationalPaths('', config.paths)).toThrow(
      'Diretório de dados operacionais não informado'
    )
  })

  it('rejeita a base do banco canônico em branco antes de resolver caminhos', () => {
    const config = parseAppConfig()

    expect(() =>
      resolveApplicationPaths(
        {
          appDataDir: 'C:\\AppData',
          userDataDir: ' '
        },
        config.paths
      )
    ).toThrow('Diretório de dados do usuário não informado')
  })
})

describe('resolveIsolatedOperationalPaths', () => {
  it('mantém o perfil do smoke test abaixo da raiz isolada informada', () => {
    const config = parseAppConfig()
    const rootDir = join(process.cwd(), 'data', 'runtime')

    const paths = resolveIsolatedOperationalPaths(rootDir, config.paths)

    expect(paths.rootDir).toBe(resolve(rootDir))
    expect(paths.browserProfileDir).toBe(join(resolve(rootDir), 'browser-profile'))
  })
})

describe('ensureOperationalDirectories', () => {
  it('cria somente os seis diretórios operacionais necessários', async () => {
    const config = parseAppConfig()
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'agente-cpi-runtime-'))

    temporaryDirectories.push(temporaryRoot)

    const paths = resolveIsolatedOperationalPaths(join(temporaryRoot, 'runtime'), config.paths)

    await ensureOperationalDirectories(paths)

    await expect(access(paths.rootDir)).resolves.toBeUndefined()
    await expect(access(paths.browserProfileDir)).resolves.toBeUndefined()
    await expect(access(paths.downloadsDir)).resolves.toBeUndefined()
    await expect(access(paths.screenshotsDir)).resolves.toBeUndefined()
    await expect(access(paths.logsDir)).resolves.toBeUndefined()
    await expect(access(paths.configDir)).resolves.toBeUndefined()
    await expect(access(join(paths.rootDir, 'database'))).rejects.toThrow()
  })
})
