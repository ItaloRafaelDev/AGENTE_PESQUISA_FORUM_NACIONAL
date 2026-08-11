import { describe, expect, it, vi } from 'vitest'
import { ResearchHistoryService } from '@/application/history/research-history-service'
import type {
  CompleteResearchHistoryInput,
  CreateResearchHistoryInput,
  FailResearchHistoryInput,
  ResearchHistoryEvent,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '@/application/history/research-history-model'
import type { ResearchHistoryRepositoryPort } from '@/application/ports/research-history-repository-port'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'

class InMemoryResearchHistoryRepository implements ResearchHistoryRepositoryPort {
  private readonly records = new Map<string, ResearchHistoryRecord>()

  public completeError: Error | null = null

  public failError: Error | null = null

  create(input: CreateResearchHistoryInput): ResearchHistoryRecord {
    const record: ResearchHistoryRecord = {
      ...input,
      classification: null,
      cpiResult: null,
      finishedAt: null,
      durationMs: null,
      pdfPath: null,
      errorStage: null,
      errorMessage: null
    }

    this.records.set(record.id, record)

    return { ...record }
  }

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord {
    return this.update(id, {
      maskedCpf
    })
  }

  complete(input: CompleteResearchHistoryInput): ResearchHistoryRecord {
    if (this.completeError) {
      throw this.completeError
    }

    return this.update(input.id, {
      maskedCpf: input.maskedCpf,
      classification: input.classification,
      cpiResult: input.cpiResult,
      status: 'CONCLUIDO',
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      pdfPath: input.pdfPath,
      errorStage: null,
      errorMessage: null
    })
  }

  fail(input: FailResearchHistoryInput): ResearchHistoryRecord {
    if (this.failError) {
      throw this.failError
    }

    return this.update(input.id, {
      maskedCpf: input.maskedCpf,
      status: 'ERRO_E1',
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      errorStage: input.errorStage,
      errorMessage: input.errorMessage
    })
  }

  list(input: ResearchHistoryListInput): ResearchHistoryPage {
    const items = [...this.records.values()].map((record) => ({ ...record }))

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total: items.length,
      totalPages: items.length === 0 ? 0 : 1
    }
  }

  clear(): void {
    this.records.clear()
  }

  private update(id: string, changes: Partial<ResearchHistoryRecord>): ResearchHistoryRecord {
    const current = this.records.get(id)

    if (!current) {
      throw new Error(`Registro não encontrado: ${id}`)
    }

    const updated = {
      ...current,
      ...changes
    }

    this.records.set(id, updated)

    return { ...updated }
  }
}

function createCycleResult(overrides: Partial<ResearchCycleResult> = {}): ResearchCycleResult {
  return {
    maskedCpf: overrides.maskedCpf ?? '***.***.***-44',
    selectedDatasetCount: overrides.selectedDatasetCount ?? 6,
    classification: overrides.classification ?? 'CONSTA_RESTRICAO',
    pdfPath: overrides.pdfPath ?? 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
    pdfSizeBytes: overrides.pdfSizeBytes ?? 2048,
    saved: true,
    confirmationAccepted: true
  }
}

function createService(
  repository: ResearchHistoryRepositoryPort,
  clock: { now(): Date }
): ResearchHistoryService {
  return new ResearchHistoryService({
    repository,
    clock,
    idGenerator: {
      next: () => 'history-1'
    },
    sanitizer: {
      sanitize: (message) => String(message).replaceAll('segredo', '[REMOVIDO]')
    }
  })
}

describe('application ResearchHistoryService', () => {
  it('cria uma única linha e a conclui com duração e label CPI preservados', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:01:30.000Z'))
    }
    const service = new ResearchHistoryService({
      repository,
      clock,
      idGenerator: { next: () => 'history-1' },
      sanitizer: { sanitize: (message) => String(message).replace(/\d{11}/g, '[CPF]') }
    })

    const created = service.beginCycle()
    const completed = service.completeCycle(created.id, createCycleResult())
    const page = service.list({
      page: 1,
      pageSize: 50
    })

    expect(created).toEqual({
      id: 'history-1',
      maskedCpf: '***.***.***-00',
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
    expect(completed).toEqual({
      ...created,
      maskedCpf: '***.***.***-44',
      classification: 'CONSTA_RESTRICAO',
      cpiResult: 'Sim, Consta Restrições',
      status: 'CONCLUIDO',
      finishedAt: '2026-07-14T10:01:30.000Z',
      durationMs: 90_000,
      pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf'
    })
    expect(page.total).toBe(1)
    expect(page.items).toEqual([completed])
  })

  it('atualiza o CPF mascarado no registro e no estado do ciclo ativo', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:15.000Z'))
    }
    const service = createService(repository, clock)

    const created = service.beginCycle()
    const updated = service.setMaskedCpf(created.id, '***.***.***-77')
    const failed = service.failCycle(created.id, 'SAVING_CPI', new Error('falha segura'))

    expect(updated.maskedCpf).toBe('***.***.***-77')
    expect(failed.maskedCpf).toBe('***.***.***-77')
  })

  it('sanitiza estágio e erro antes de persistir a falha', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:15.000Z'))
    }
    const service = createService(repository, clock)

    const created = service.beginCycle()
    const failed = service.failCycle(created.id, 'etapa-segredo', new Error('falha segredo'))

    expect(failed.status).toBe('ERRO_E1')
    expect(failed.errorStage).toBe('etapa-[REMOVIDO]')
    expect(failed.errorMessage).toBe('falha [REMOVIDO]')
    expect(failed.durationMs).toBe(15_000)
  })

  it('emite CREATED, UPDATED e CLEARED e remove a inscrição', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    const created = service.beginCycle()

    service.setMaskedCpf(created.id, '***.***.***-44')
    service.completeCycle(created.id, createCycleResult())
    unsubscribe()
    service.clear()

    expect(listener.mock.calls.map(([event]) => event.type)).toEqual([
      'CREATED',
      'UPDATED',
      'UPDATED'
    ])
  })

  it('rejeita a conclusão de ciclo desconhecido', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })

    expect(() => service.completeCycle('missing', createCycleResult())).toThrow(
      'Ciclo de histórico ativo não encontrado: missing'
    )
  })

  it('rejeita limpeza enquanto existe ciclo ativo', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })

    service.beginCycle()

    expect(() => service.clear()).toThrow(
      'Não é possível limpar o histórico durante uma pesquisa em andamento'
    )
  })

  it('entrega a cada listener uma cópia defensiva do registro', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })
    let firstEvent: ResearchHistoryEvent | undefined
    let secondEvent: ResearchHistoryEvent | undefined

    service.subscribe((event) => {
      firstEvent = event

      if (event.type !== 'CLEARED') {
        event.record.maskedCpf = '***.***.***-99'
      }
    })
    service.subscribe((event) => {
      secondEvent = event
    })

    service.beginCycle()

    expect(firstEvent?.type).toBe('CREATED')
    expect(secondEvent).toEqual({
      type: 'CREATED',
      record: expect.objectContaining({
        id: 'history-1',
        maskedCpf: '***.***.***-00'
      })
    })
    expect(secondEvent).not.toBe(firstEvent)
    expect(service.list({ page: 1, pageSize: 50 }).items[0]?.maskedCpf).toBe('***.***.***-00')
  })

  it('isola o evento CLEARED entre listeners para impedir mutação compartilhada', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })
    let firstEvent: ResearchHistoryEvent | undefined
    let secondEvent: ResearchHistoryEvent | undefined

    service.subscribe((event) => {
      firstEvent = event
      ;(event as ResearchHistoryEvent & { marker?: string }).marker = 'mutated'
    })
    service.subscribe((event) => {
      secondEvent = event
    })

    service.clear()

    expect(firstEvent).toEqual({
      type: 'CLEARED',
      marker: 'mutated'
    })
    expect(secondEvent).toEqual({
      type: 'CLEARED'
    })
    expect(secondEvent).not.toBe(firstEvent)
  })

  it('remove o ciclo ativo em finally quando a conclusão não persiste', () => {
    const repository = new InMemoryResearchHistoryRepository()
    repository.completeError = new Error('persistência indisponível')
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:30.000Z'))
    }
    const service = createService(repository, clock)
    const created = service.beginCycle()

    expect(() => service.completeCycle(created.id, createCycleResult())).toThrow(
      'persistência indisponível'
    )
    expect(() => service.clear()).not.toThrow()
  })

  it('remove o ciclo ativo em finally quando a falha não persiste', () => {
    const repository = new InMemoryResearchHistoryRepository()
    repository.failError = new Error('persistência indisponível')
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:30.000Z'))
    }
    const service = createService(repository, clock)
    const created = service.beginCycle()

    expect(() => service.failCycle(created.id, 'SAVING_CPI', new Error('falha segura'))).toThrow(
      'persistência indisponível'
    )
    expect(() => service.clear()).not.toThrow()
  })

  it('isola listeners terminais da conclusão, notifica os seguintes e limpa o ciclo ativo', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:30.000Z'))
    }
    const service = createService(repository, clock)
    const received: ResearchHistoryEvent[] = []
    service.subscribe((event) => {
      if (event.type === 'UPDATED') {
        throw new Error('listener terminal indisponível')
      }
    })
    service.subscribe((event) => received.push(event))
    const created = service.beginCycle()

    expect(service.completeCycle(created.id, createCycleResult())).toMatchObject({
      id: created.id,
      status: 'CONCLUIDO'
    })
    expect(received.at(-1)).toMatchObject({
      type: 'UPDATED',
      record: { id: created.id, status: 'CONCLUIDO' }
    })
    expect(() => service.clear()).not.toThrow()
  })

  it('isola listeners terminais da falha, notifica os seguintes e limpa o ciclo ativo', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date('2026-07-14T10:00:30.000Z'))
    }
    const service = createService(repository, clock)
    const received: ResearchHistoryEvent[] = []
    service.subscribe((event) => {
      if (event.type === 'UPDATED') {
        throw new Error('listener terminal indisponível')
      }
    })
    service.subscribe((event) => received.push(event))
    const created = service.beginCycle()

    expect(service.failCycle(created.id, 'SAVING_CPI', new Error('falha segura'))).toMatchObject({
      id: created.id,
      status: 'ERRO_E1'
    })
    expect(received.at(-1)).toMatchObject({
      type: 'UPDATED',
      record: { id: created.id, status: 'ERRO_E1' }
    })
    expect(() => service.clear()).not.toThrow()
  })

  it('não retém ciclo ativo quando a criação no repositório falha', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const createError = new Error('persistência indisponível')
    repository.create = () => {
      throw createError
    }
    const service = createService(repository, {
      now: () => new Date('2026-07-14T10:00:00.000Z')
    })

    expect(() => service.beginCycle()).toThrow(createError)
    expect(() => service.clear()).not.toThrow()
    expect(service.list({ page: 1, pageSize: 50 }).total).toBe(0)
  })

  it('rejeita data inicial inválida sem criar registro', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const service = createService(repository, {
      now: () => new Date(Number.NaN)
    })

    expect(() => service.beginCycle()).toThrow('Data do histórico inválida')
    expect(service.list({ page: 1, pageSize: 50 }).total).toBe(0)
  })

  it('rejeita data terminal inválida e mantém o ciclo ativo', () => {
    const repository = new InMemoryResearchHistoryRepository()
    const clock = {
      now: vi
        .fn()
        .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
        .mockReturnValueOnce(new Date(Number.NaN))
    }
    const service = createService(repository, clock)
    const created = service.beginCycle()

    expect(() => service.completeCycle(created.id, createCycleResult())).toThrow(
      'Data do histórico inválida'
    )
    expect(() => service.clear()).toThrow(
      'Não é possível limpar o histórico durante uma pesquisa em andamento'
    )
  })
})
