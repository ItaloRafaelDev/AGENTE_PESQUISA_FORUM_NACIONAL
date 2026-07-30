import { describe, expect, it } from 'vitest'
import type {
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '@/application/history/research-history-model'
import {
  mapResearchHistoryPageToDto,
  mapResearchHistoryRecordToDto
} from '@/main/mappers/research-history-ipc-mapper'

const record: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-44',
  classification: 'HA_INFORMACOES',
  cpiResult: 'Há Informações',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:00.000Z',
  durationMs: 60_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

describe('research history IPC mapper', () => {
  it('copia explicitamente todos os campos públicos', () => {
    const dto = mapResearchHistoryRecordToDto(record)

    expect(dto).toEqual(record)
    expect(dto).not.toBe(record)
  })

  it('copia a página e cada item sem compartilhar referências', () => {
    const page: ResearchHistoryPage = {
      items: [record],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1
    }

    const dto = mapResearchHistoryPageToDto(page)

    expect(dto).toEqual(page)
    expect(dto).not.toBe(page)
    expect(dto.items).not.toBe(page.items)
    expect(dto.items[0]).not.toBe(record)
  })

  it('preserva campos nulos de registro interrompido', () => {
    expect(
      mapResearchHistoryRecordToDto({
        ...record,
        classification: null,
        cpiResult: null,
        status: 'INTERROMPIDO',
        durationMs: null,
        pdfPath: null
      })
    ).toMatchObject({
      classification: null,
      cpiResult: null,
      status: 'INTERROMPIDO',
      durationMs: null,
      pdfPath: null
    })
  })
})
