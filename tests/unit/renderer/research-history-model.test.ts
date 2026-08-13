import { describe, expect, it } from 'vitest'
import {
  formatHistoryDate,
  formatHistoryDuration,
  formatResearchClassification,
  formatResearchStatus,
  upsertResearchHistoryRecord
} from '@/renderer/src/features/history/research-history-model'
import type { ResearchHistoryRecord } from '@/shared/types/history-api'

const oldestRecord: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-11',
  classification: null,
  cpiResult: null,
  status: 'EM_ANDAMENTO',
  startedAt: '2026-07-14T09:00:00.000Z',
  finishedAt: null,
  durationMs: null,
  pdfPath: null,
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T09:00:00.000Z'
}

const newestRecord: ResearchHistoryRecord = {
  ...oldestRecord,
  id: 'history-2',
  maskedCpf: '***.***.***-22',
  startedAt: '2026-07-14T11:00:00.000Z',
  createdAt: '2026-07-14T11:00:00.000Z'
}

describe('research history model', () => {
  it('formats public history values with the accepted fallbacks', () => {
    expect(formatHistoryDate(null)).toBe('—')
    expect(formatHistoryDuration(null)).toBe('—')
    expect(formatHistoryDuration(0)).toBe('0s')
    expect(formatHistoryDuration(59_600)).toBe('1min 0s')
    expect(formatResearchClassification('CONSTA_RESTRICAO')).toBe('Consta restrição')
    expect(formatResearchClassification('HA_INFORMACOES')).toBe('Há informações')
    expect(formatResearchClassification('NADA_CONSTA')).toBe('—')
    expect(formatResearchClassification(null)).toBe('—')
  })

  it('formats every persisted research status label', () => {
    expect(formatResearchStatus('EM_ANDAMENTO')).toBe('Em andamento')
    expect(formatResearchStatus('CONCLUIDO')).toBe('Concluído')
    expect(formatResearchStatus('ERRO_E1')).toBe('Erro E1')
    expect(formatResearchStatus('INTERROMPIDO')).toBe('Interrompido')
  })

  it('adds a created record in descending start order without mutating frozen input', () => {
    const existingRecords = Object.freeze([
      Object.freeze(oldestRecord),
      Object.freeze(newestRecord)
    ])
    const createdRecord = Object.freeze({
      ...oldestRecord,
      id: 'history-3',
      maskedCpf: '***.***.***-33',
      startedAt: '2026-07-14T10:00:00.000Z',
      createdAt: '2026-07-14T10:00:00.000Z'
    })

    const result = upsertResearchHistoryRecord(existingRecords, createdRecord)

    expect(result.map((record) => record.id)).toEqual(['history-2', 'history-3', 'history-1'])
    expect(existingRecords.map((record) => record.id)).toEqual(['history-1', 'history-2'])
    expect(result).not.toBe(existingRecords)
  })

  it('replaces an updated record once and keeps descending start order without mutating frozen input', () => {
    const existingRecords = Object.freeze([
      Object.freeze(oldestRecord),
      Object.freeze(newestRecord)
    ])
    const updatedRecord = Object.freeze({
      ...oldestRecord,
      id: 'history-1',
      maskedCpf: '***.***.***-99',
      startedAt: '2026-07-14T12:00:00.000Z',
      createdAt: '2026-07-14T12:00:00.000Z'
    })

    const result = upsertResearchHistoryRecord(existingRecords, updatedRecord)

    expect(result.map((record) => record.id)).toEqual(['history-1', 'history-2'])
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(updatedRecord)
    expect(existingRecords.map((record) => record.id)).toEqual(['history-1', 'history-2'])
    expect(result).not.toBe(existingRecords)
  })
})
