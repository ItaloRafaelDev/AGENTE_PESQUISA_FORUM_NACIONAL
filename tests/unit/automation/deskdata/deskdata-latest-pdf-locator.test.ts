import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeskDataLatestPdfLocator } from '@/automation/deskdata/deskdata-latest-pdf-locator'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agente-cpi-latest-pdf-'))

  temporaryDirectories.push(directory)

  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, {
        recursive: true,
        force: true
      })
    })
  )
})

describe('DeskDataLatestPdfLocator', () => {
  it('deve localizar o PDF válido mais recente', async () => {
    const directory = await createTemporaryDirectory()
    const olderPath = join(directory, 'deskdata-antigo.pdf')
    const newerPath = join(directory, 'deskdata-recente.pdf')

    await writeFile(olderPath, '%PDF-1.7\narquivo antigo')
    await writeFile(newerPath, '%PDF-1.7\narquivo recente')

    await utimes(olderPath, new Date('2026-07-14T10:00:00Z'), new Date('2026-07-14T10:00:00Z'))

    await utimes(newerPath, new Date('2026-07-14T11:00:00Z'), new Date('2026-07-14T11:00:00Z'))

    const result = await new DeskDataLatestPdfLocator(directory).findLatestValid()

    expect(result.filePath).toBe(newerPath)
    expect(result.fileName).toBe('deskdata-recente.pdf')
    expect(result.sizeBytes).toBeGreaterThan(5)
  })

  it('deve ignorar um arquivo recente que não seja PDF válido', async () => {
    const directory = await createTemporaryDirectory()
    const validPath = join(directory, 'deskdata-valido.pdf')
    const invalidPath = join(directory, 'deskdata-invalido.pdf')

    await writeFile(validPath, '%PDF-1.7\narquivo válido')
    await writeFile(invalidPath, 'arquivo inválido')

    await utimes(validPath, new Date('2026-07-14T10:00:00Z'), new Date('2026-07-14T10:00:00Z'))

    await utimes(invalidPath, new Date('2026-07-14T12:00:00Z'), new Date('2026-07-14T12:00:00Z'))

    const result = await new DeskDataLatestPdfLocator(directory).findLatestValid()

    expect(result.filePath).toBe(validPath)
  })

  it('deve rejeitar quando não houver PDF válido', async () => {
    const directory = await createTemporaryDirectory()

    await writeFile(join(directory, 'arquivo-invalido.pdf'), 'conteúdo inválido')

    await expect(new DeskDataLatestPdfLocator(directory).findLatestValid()).rejects.toThrow(
      'Nenhum PDF válido da DeskData foi encontrado'
    )
  })
})
