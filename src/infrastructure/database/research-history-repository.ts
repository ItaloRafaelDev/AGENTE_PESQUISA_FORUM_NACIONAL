import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { ResearchClassification } from '../../domain/research/research-classification'
import type {
  CompleteResearchHistoryInput,
  CreateResearchHistoryInput,
  FailResearchHistoryInput,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord,
  ResearchHistoryStatus
} from '../../application/history/research-history-model'
import type { ResearchHistoryRepositoryPort } from '../../application/ports/research-history-repository-port'
import { runResearchHistoryMigrations } from './research-history-migrations'

type SqliteDatabase = InstanceType<typeof Database>

interface ResearchHistoryRow {
  id: string
  masked_cpf: string
  classification: ResearchClassification | null
  cpi_result: string | null
  status: ResearchHistoryStatus
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  pdf_path: string | null
  error_stage: string | null
  error_message: string | null
  created_at: string
}

interface CountRow {
  total: number
}

interface ColumnInfoRow {
  name: string
}

const MASKED_CPF_PATTERN = /^\*{3}\.\*{3}\.\*{3}-\d{2}$/

function mapRow(row: ResearchHistoryRow): ResearchHistoryRecord {
  return {
    id: row.id,
    maskedCpf: row.masked_cpf,
    classification: row.classification,
    cpiResult: row.cpi_result,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    pdfPath: row.pdf_path,
    errorStage: row.error_stage,
    errorMessage: row.error_message,
    createdAt: row.created_at
  }
}

export class ResearchHistoryRepository implements ResearchHistoryRepositoryPort {
  private closed = false

  private constructor(private readonly database: SqliteDatabase) {
    this.database.pragma('foreign_keys = ON')
    runResearchHistoryMigrations(this.database)
    this.database.pragma('journal_mode = WAL')
  }

  static open(filePath: string): ResearchHistoryRepository {
    if (!filePath.trim()) {
      throw new Error('Caminho do banco não informado')
    }

    mkdirSync(dirname(filePath), {
      recursive: true
    })

    return ResearchHistoryRepository.initialize(new Database(filePath))
  }

  static inMemory(): ResearchHistoryRepository {
    return ResearchHistoryRepository.initialize(new Database(':memory:'))
  }

  create(input: CreateResearchHistoryInput): ResearchHistoryRecord {
    this.assertOpen()
    this.assertMaskedCpf(input.maskedCpf)

    this.database
      .prepare(
        `
          INSERT INTO research_history (
            id,
            masked_cpf,
            classification,
            cpi_result,
            status,
            started_at,
            finished_at,
            duration_ms,
            pdf_path,
            error_stage,
            error_message,
            created_at
          )
          VALUES (?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)
        `
      )
      .run(input.id, input.maskedCpf, input.status, input.startedAt, input.createdAt)

    return this.getRequired(input.id)
  }

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord {
    this.assertOpen()
    this.assertMaskedCpf(maskedCpf)

    const result = this.database
      .prepare(
        `
          UPDATE research_history
          SET masked_cpf = ?
          WHERE id = ?
        `
      )
      .run(maskedCpf, id)

    this.assertUpdated(result.changes, id)

    return this.getRequired(id)
  }

  complete(input: CompleteResearchHistoryInput): ResearchHistoryRecord {
    this.assertOpen()
    this.assertMaskedCpf(input.maskedCpf)
    this.assertDuration(input.durationMs)

    const result = this.database
      .prepare(
        `
          UPDATE research_history
          SET
            masked_cpf = ?,
            classification = ?,
            cpi_result = ?,
            status = 'CONCLUIDO',
            finished_at = ?,
            duration_ms = ?,
            pdf_path = ?,
            error_stage = NULL,
            error_message = NULL
          WHERE id = ?
        `
      )
      .run(
        input.maskedCpf,
        input.classification,
        input.cpiResult,
        input.finishedAt,
        input.durationMs,
        input.pdfPath,
        input.id
      )

    this.assertUpdated(result.changes, input.id)

    return this.getRequired(input.id)
  }

  fail(input: FailResearchHistoryInput): ResearchHistoryRecord {
    this.assertOpen()
    this.assertMaskedCpf(input.maskedCpf)
    this.assertDuration(input.durationMs)

    const result = this.database
      .prepare(
        `
          UPDATE research_history
          SET
            masked_cpf = ?,
            status = 'ERRO_E1',
            finished_at = ?,
            duration_ms = ?,
            error_stage = ?,
            error_message = ?
          WHERE id = ?
        `
      )
      .run(
        input.maskedCpf,
        input.finishedAt,
        input.durationMs,
        input.errorStage,
        input.errorMessage,
        input.id
      )

    this.assertUpdated(result.changes, input.id)

    return this.getRequired(input.id)
  }

  list(input: ResearchHistoryListInput): ResearchHistoryPage {
    this.assertOpen()
    this.assertPagination(input)

    const offset = (input.page - 1) * input.pageSize

    const rows = this.database
      .prepare(
        `
          SELECT *
          FROM research_history
          ORDER BY started_at DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(input.pageSize, offset) as ResearchHistoryRow[]

    const countRow = this.database
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM research_history
        `
      )
      .get() as CountRow

    const total = countRow.total

    return {
      items: rows.map(mapRow),
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize)
    }
  }

  clear(): void {
    this.assertOpen()

    this.database
      .prepare(
        `
          DELETE FROM research_history
        `
      )
      .run()
  }

  markUnfinishedAsInterrupted(finishedAt: string): number {
    this.assertOpen()

    const result = this.database
      .prepare(
        `
          UPDATE research_history
          SET
            status = 'INTERROMPIDO',
            finished_at = ?,
            duration_ms = MAX(
              0,
              CAST(
                ROUND(
                  (
                    julianday(?) -
                    julianday(started_at)
                  ) * 86400000
                ) AS INTEGER
              )
            )
          WHERE status = 'EM_ANDAMENTO'
        `
      )
      .run(finishedAt, finishedAt)

    return result.changes
  }

  listColumnNames(): string[] {
    this.assertOpen()

    const rows = this.database
      .prepare(
        `
          PRAGMA table_info(research_history)
        `
      )
      .all() as ColumnInfoRow[]

    return rows.map((row) => row.name)
  }

  close(): void {
    if (this.closed) {
      return
    }

    this.database.close()
    this.closed = true
  }

  private getRequired(id: string): ResearchHistoryRecord {
    const row = this.database
      .prepare(
        `
          SELECT *
          FROM research_history
          WHERE id = ?
        `
      )
      .get(id) as ResearchHistoryRow | undefined

    if (!row) {
      throw new Error(`Registro de histórico não encontrado: ${id}`)
    }

    return mapRow(row)
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Repositório de histórico fechado')
    }
  }

  private assertMaskedCpf(maskedCpf: string): void {
    if (!MASKED_CPF_PATTERN.test(maskedCpf)) {
      throw new Error('CPF histórico precisa estar mascarado')
    }
  }

  private assertDuration(durationMs: number): void {
    if (!Number.isInteger(durationMs) || durationMs < 0) {
      throw new Error('Duração do histórico precisa ser um inteiro não negativo')
    }
  }

  private assertPagination(input: ResearchHistoryListInput): void {
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new Error('Página deve ser um inteiro maior ou igual a 1')
    }

    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new Error('Tamanho da página deve estar entre 1 e 100')
    }
  }

  private assertUpdated(changes: number, id: string): void {
    if (changes !== 1) {
      throw new Error(`Registro de histórico não encontrado: ${id}`)
    }
  }

  private static initialize(database: SqliteDatabase): ResearchHistoryRepository {
    try {
      return new ResearchHistoryRepository(database)
    } catch (error) {
      if (database.open) {
        database.close()
      }

      throw error
    }
  }
}
