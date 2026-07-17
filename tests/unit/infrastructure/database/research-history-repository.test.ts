import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ResearchHistoryRepository,
  type CompleteResearchHistoryInput,
  type CreateResearchHistoryInput
} from '@/infrastructure/database/research-history-repository'

const repositories: ResearchHistoryRepository[] = []
const temporaryDirectories: string[] = []

function openMemoryRepository(): ResearchHistoryRepository {
  const repository = ResearchHistoryRepository.inMemory()

  repositories.push(repository)

  return repository
}

function createInput(
  overrides: Partial<CreateResearchHistoryInput> = {}
): CreateResearchHistoryInput {
  return {
    id: overrides.id ?? 'record-1',
    maskedCpf: overrides.maskedCpf ?? '***.***.***-01',
    status: overrides.status ?? 'EM_ANDAMENTO',
    startedAt: overrides.startedAt ?? '2026-07-14T10:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-07-14T10:00:00.000Z'
  }
}

function completeInput(
  overrides: Partial<CompleteResearchHistoryInput> = {}
): CompleteResearchHistoryInput {
  return {
    id: overrides.id ?? 'record-1',
    maskedCpf: overrides.maskedCpf ?? '***.***.***-01',
    classification: overrides.classification ?? 'CONSTA_RESTRICAO',
    cpiResult: overrides.cpiResult ?? 'Sim, Consta Restrições',
    finishedAt: overrides.finishedAt ?? '2026-07-14T10:01:30.000Z',
    durationMs: overrides.durationMs ?? 90_000,
    pdfPath: overrides.pdfPath ?? 'E:\\PDF-AGENTE-CPI\\arquivo.pdf'
  }
}

afterEach(() => {
  while (repositories.length > 0) {
    repositories.pop()?.close()
  }

  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()

    if (directory) {
      rmSync(directory, {
        recursive: true,
        force: true
      })
    }
  }
})

describe('ResearchHistoryRepository', () => {
  it('cria a tabela sem nome ou CPF completo', () => {
    const repository = openMemoryRepository()

    const columns = repository.listColumnNames()

    expect(columns).toContain('masked_cpf')
    expect(columns).not.toContain('name')
    expect(columns).not.toContain('full_name')
    expect(columns).not.toContain('cpf')
    expect(columns).not.toContain('full_cpf')
  })

  it('insere e atualiza o mesmo registro ao concluir', () => {
    const repository = openMemoryRepository()

    const created = repository.create(createInput())

    expect(created).toEqual({
      id: 'record-1',
      maskedCpf: '***.***.***-01',
      classification: null,
      cpiResult: null,
      status: 'EM_ANDAMENTO',
      startedAt: '2026-07-14T10:00:00.000Z',
      finishedAt: null,
      durationMs: null,
      pdfPath: null,
      errorStage: null,
      errorMessage: null,
      createdAt: '2026-07-14T10:00:00.000Z'
    })

    const completed = repository.complete(completeInput())

    expect(completed).toEqual({
      ...created,
      classification: 'CONSTA_RESTRICAO',
      cpiResult: 'Sim, Consta Restrições',
      status: 'CONCLUIDO',
      finishedAt: '2026-07-14T10:01:30.000Z',
      durationMs: 90_000,
      pdfPath: 'E:\\PDF-AGENTE-CPI\\arquivo.pdf'
    })

    expect(repository.list({ page: 1, pageSize: 50 }).total).toBe(1)
  })

  it('atualiza somente o CPF mascarado do registro em andamento', () => {
    const repository = openMemoryRepository()

    repository.create(
      createInput({
        maskedCpf: '***.***.***-00'
      })
    )

    const updated = repository.setMaskedCpf('record-1', '***.***.***-39')

    expect(updated.maskedCpf).toBe('***.***.***-39')
    expect(updated.status).toBe('EM_ANDAMENTO')
  })

  it('registra erro E1 sanitizado no mesmo registro', () => {
    const repository = openMemoryRepository()

    repository.create(createInput())

    const failed = repository.fail({
      id: 'record-1',
      maskedCpf: '***.***.***-01',
      finishedAt: '2026-07-14T10:00:15.000Z',
      durationMs: 15_000,
      errorStage: 'SAVING_CPI',
      errorMessage: 'Falha segura'
    })

    expect(failed.status).toBe('ERRO_E1')
    expect(failed.errorStage).toBe('SAVING_CPI')
    expect(failed.errorMessage).toBe('Falha segura')
    expect(failed.finishedAt).toBe('2026-07-14T10:00:15.000Z')
  })

  it('lista do mais recente para o mais antigo com paginação', () => {
    const repository = openMemoryRepository()

    for (let index = 1; index <= 55; index += 1) {
      const sequence = index.toString().padStart(2, '0')

      repository.create(
        createInput({
          id: `record-${sequence}`,
          maskedCpf: `***.***.***-${sequence}`,
          startedAt: `2026-07-14T10:${sequence}:00.000Z`,
          createdAt: `2026-07-14T10:${sequence}:00.000Z`
        })
      )
    }

    const firstPage = repository.list({
      page: 1,
      pageSize: 50
    })

    const secondPage = repository.list({
      page: 2,
      pageSize: 50
    })

    expect(firstPage.total).toBe(55)
    expect(firstPage.totalPages).toBe(2)
    expect(firstPage.items).toHaveLength(50)
    expect(firstPage.items[0]?.id).toBe('record-55')
    expect(firstPage.items[49]?.id).toBe('record-06')

    expect(secondPage.items).toHaveLength(5)
    expect(secondPage.items[0]?.id).toBe('record-05')
    expect(secondPage.items[4]?.id).toBe('record-01')
  })

  it('limita a página a no máximo 100 registros', () => {
    const repository = openMemoryRepository()

    expect(() =>
      repository.list({
        page: 1,
        pageSize: 101
      })
    ).toThrow('Tamanho da página deve estar entre 1 e 100')
  })

  it('limpa somente os registros do banco', () => {
    const repository = openMemoryRepository()

    repository.create(createInput())

    repository.clear()

    expect(
      repository.list({
        page: 1,
        pageSize: 50
      })
    ).toEqual({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0
    })
  })

  it('marca registros inacabados como interrompidos na inicialização', () => {
    const repository = openMemoryRepository()

    repository.create(createInput())

    const affected = repository.markUnfinishedAsInterrupted('2026-07-14T10:02:00.000Z')

    const record = repository.list({
      page: 1,
      pageSize: 50
    }).items[0]

    expect(affected).toBe(1)
    expect(record?.status).toBe('INTERROMPIDO')
    expect(record?.finishedAt).toBe('2026-07-14T10:02:00.000Z')
    expect(record?.durationMs).toBe(120_000)
  })

  it('persiste o histórico ao fechar e reabrir o arquivo SQLite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-history-'))

    temporaryDirectories.push(directory)

    const databasePath = join(directory, 'agente-cpi.sqlite')

    const firstRepository = ResearchHistoryRepository.open(databasePath)

    firstRepository.create(createInput())
    firstRepository.close()

    const secondRepository = ResearchHistoryRepository.open(databasePath)

    repositories.push(secondRepository)

    const page = secondRepository.list({
      page: 1,
      pageSize: 50
    })

    expect(page.total).toBe(1)
    expect(page.items[0]?.id).toBe('record-1')
    expect(readFileSync(databasePath).length).toBeGreaterThan(0)
  })

  it('rejeita CPF que não esteja mascarado', () => {
    const repository = openMemoryRepository()

    expect(() =>
      repository.create(
        createInput({
          maskedCpf: 'CPF_INVALIDO'
        })
      )
    ).toThrow('CPF histórico precisa estar mascarado')
  })
})
