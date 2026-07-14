import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ensureRuntimeDirectories,
  resolveRuntimePaths
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

describe('resolveRuntimePaths', () => {
  it('deve gerar todos os caminhos operacionais a partir do diretório raiz', () => {
    const rootDir = resolve('E:\\AgenteCPI')
    const paths = resolveRuntimePaths(rootDir)

    expect(paths).toEqual({
      rootDir,
      browserProfileDir: join(rootDir, 'browser-profile'),
      downloadsDir: join(rootDir, 'downloads'),
      screenshotsDir: join(rootDir, 'screenshots'),
      logsDir: join(rootDir, 'logs'),
      databaseDir: join(rootDir, 'database'),
      databaseFile: join(rootDir, 'database', 'agent.db'),
      configDir: join(rootDir, 'config')
    })
  })

  it('deve rejeitar um diretório raiz vazio', () => {
    expect(() => resolveRuntimePaths('')).toThrow('Diretório operacional raiz não informado')
  })
})

describe('ensureRuntimeDirectories', () => {
  it('deve criar todos os diretórios operacionais necessários', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'agente-cpi-runtime-'))

    temporaryDirectories.push(temporaryRoot)

    const paths = resolveRuntimePaths(join(temporaryRoot, 'runtime'))

    await ensureRuntimeDirectories(paths)

    await expect(access(paths.rootDir)).resolves.toBeUndefined()
    await expect(access(paths.browserProfileDir)).resolves.toBeUndefined()
    await expect(access(paths.downloadsDir)).resolves.toBeUndefined()
    await expect(access(paths.screenshotsDir)).resolves.toBeUndefined()
    await expect(access(paths.logsDir)).resolves.toBeUndefined()
    await expect(access(paths.databaseDir)).resolves.toBeUndefined()
    await expect(access(paths.configDir)).resolves.toBeUndefined()
  })
})
