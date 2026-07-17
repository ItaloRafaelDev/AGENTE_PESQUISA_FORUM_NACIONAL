import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchHistoryService } from '@/automation/history/research-history-service'
import { ResearchHistoryRepository } from '@/infrastructure/database/research-history-repository'
import type { SingleResearchCycleResult } from '@/automation/flow/single-research-cycle'

const repositories: ResearchHistoryRepository[] = []

function createRepository(): ResearchHistoryRepository {
  const repository = ResearchHistoryRepository.inMemory()

  repositories.push(repository)

  return repository
}

function createCycleResult(
  overrides: Partial<SingleResearchCycleResult> = {}
): SingleResearchCycleResult {
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

afterEach(() => {
  while (repositories.length > 0) {
    repositories.pop()?.close()
  }
})

describe('ResearchHistoryService', () => {
  it('cria um único registro e atualiza o mesmo ao concluir', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    const completed = service.completeCycle(
      created.id,
      createCycleResult(),
      new Date('2026-07-14T10:01:30.000Z')
    )

    const page = service.list({
      page: 1,
      pageSize: 50
    })

    expect(created.id).toBe('history-1')
    expect(completed.id).toBe(created.id)
    expect(page.total).toBe(1)
    expect(page.items[0]).toEqual(completed)
    expect(completed.status).toBe('CONCLUIDO')
    expect(completed.durationMs).toBe(90_000)
  })

  it('usa CPF provisório mascarado até receber a identidade', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    expect(created.maskedCpf).toBe('***.***.***-00')

    const updated = service.setMaskedCpf(created.id, '***.***.***-77')

    expect(updated.maskedCpf).toBe('***.***.***-77')
  })

  it('mapeia a classificação para o resultado aplicado na CPI', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    const completed = service.completeCycle(
      created.id,
      createCycleResult({
        classification: 'HA_INFORMACOES'
      }),
      new Date('2026-07-14T10:00:30.000Z')
    )

    expect(completed.classification).toBe('HA_INFORMACOES')
    expect(completed.cpiResult).toBe('Há Informações')
  })

  it('registra erro E1 sanitizado e remove CPF completo da mensagem', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    service.setMaskedCpf(created.id, '***.***.***-44')

    const failed = service.failCycle(
      created.id,
      'SAVING_CPI',
      new Error('Falha ao salvar o documento 111.222.333-44'),
      new Date('2026-07-14T10:00:15.000Z')
    )

    expect(failed.status).toBe('ERRO_E1')
    expect(failed.errorStage).toBe('SAVING_CPI')
    expect(failed.errorMessage).toBe('Falha ao salvar o documento ***.***.***-44')
    expect(failed.errorMessage).not.toContain('111.222.333-44')
  })

  it('emite eventos CREATED, UPDATED e CLEARED', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })
    const listener = vi.fn()

    service.subscribe(listener)

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    service.setMaskedCpf(created.id, '***.***.***-44')

    service.completeCycle(created.id, createCycleResult(), new Date('2026-07-14T10:01:00.000Z'))

    service.clear()

    expect(listener.mock.calls.map(([event]) => event.type)).toEqual([
      'CREATED',
      'UPDATED',
      'UPDATED',
      'CLEARED'
    ])
  })

  it('remove a inscrição corretamente', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })
    const listener = vi.fn()

    const unsubscribe = service.subscribe(listener)

    const created = service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    unsubscribe()

    service.completeCycle(created.id, createCycleResult(), new Date('2026-07-14T10:01:00.000Z'))

    service.clear()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejeita conclusão de ciclo desconhecido', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository)

    expect(() =>
      service.completeCycle('missing', createCycleResult(), new Date('2026-07-14T10:01:00.000Z'))
    ).toThrow('Ciclo de histórico ativo não encontrado: missing')
  })

  it('rejeita limpeza enquanto existe ciclo em andamento', () => {
    const repository = createRepository()
    const service = new ResearchHistoryService(repository, {
      idFactory: () => 'history-1'
    })

    service.beginCycle(new Date('2026-07-14T10:00:00.000Z'))

    expect(() => service.clear()).toThrow(
      'Não é possível limpar o histórico durante uma pesquisa em andamento'
    )
  })
})
