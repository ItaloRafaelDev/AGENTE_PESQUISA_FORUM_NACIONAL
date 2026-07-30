import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { createLegacyResearchHistoryDatabase } from '../../../fixtures/database/create-legacy-research-history-database'
import {
  RESEARCH_HISTORY_SCHEMA_VERSION,
  runResearchHistoryMigrations
} from '@/infrastructure/database/research-history-migrations'
import { UnsupportedDatabaseVersionError } from '@/infrastructure/database/sqlite-migration-runner'

type SqliteDatabase = InstanceType<typeof Database>

interface TableInfoRow {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
}

interface IndexListRow {
  seq: number
  name: string
  unique: number
  origin: string
  partial: number
}

interface IndexColumnRow {
  name: string | null
  desc: number
  key: number
}

interface TotalChangesRow {
  total: number
}

interface SchemaOptions {
  omittedColumns?: readonly string[]
  columnOverrides?: Readonly<Record<string, string>>
  extraColumns?: readonly string[]
  omittedIndexes?: readonly string[]
  indexOverrides?: Readonly<Record<string, string>>
}

const databases: SqliteDatabase[] = []
const temporaryDirectories: string[] = []

const CURRENT_COLUMN_DEFINITIONS = [
  'id TEXT PRIMARY KEY',
  'masked_cpf TEXT NOT NULL',
  'classification TEXT',
  'cpi_result TEXT',
  'status TEXT NOT NULL',
  'started_at TEXT NOT NULL',
  'finished_at TEXT',
  'duration_ms INTEGER',
  'pdf_path TEXT',
  'error_stage TEXT',
  'error_message TEXT',
  'created_at TEXT NOT NULL'
] as const

const CURRENT_INDEX_DEFINITIONS = {
  idx_research_history_started_at:
    'CREATE INDEX idx_research_history_started_at ON research_history(started_at DESC)',
  idx_research_history_status:
    'CREATE INDEX idx_research_history_status ON research_history(status)',
  idx_research_history_classification:
    'CREATE INDEX idx_research_history_classification ON research_history(classification)'
} as const

function openDatabase(filePath = ':memory:'): SqliteDatabase {
  const database = new Database(filePath)

  databases.push(database)

  return database
}

function createVersionZeroSchema(database: SqliteDatabase, options: SchemaOptions = {}): void {
  const omittedColumns = new Set(options.omittedColumns ?? [])
  const columns = CURRENT_COLUMN_DEFINITIONS.flatMap((definition) => {
    const [name] = definition.split(' ')

    if (!name || omittedColumns.has(name)) {
      return []
    }

    return [options.columnOverrides?.[name] ?? definition]
  })

  columns.push(...(options.extraColumns ?? []))

  database.exec(`CREATE TABLE research_history (${columns.join(', ')})`)

  const omittedIndexes = new Set(options.omittedIndexes ?? [])

  for (const [name, definition] of Object.entries(CURRENT_INDEX_DEFINITIONS)) {
    if (!omittedIndexes.has(name)) {
      database.exec(options.indexOverrides?.[name] ?? definition)
    }
  }
}

function readUserVersion(database: SqliteDatabase): number {
  return database.pragma('user_version', {
    simple: true
  }) as number
}

function readSchema(database: SqliteDatabase): unknown[] {
  return database
    .prepare(
      `
        SELECT type, name, tbl_name, sql
        FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
      `
    )
    .all()
}

function readTotalChanges(database: SqliteDatabase): number {
  return (database.prepare('SELECT total_changes() AS total').get() as TotalChangesRow).total
}

function readNamedIndexes(database: SqliteDatabase): IndexListRow[] {
  return (database.pragma('index_list(research_history)') as IndexListRow[])
    .filter((row) => row.name.startsWith('idx_research_history_'))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function readIndexColumns(database: SqliteDatabase, indexName: string): IndexColumnRow[] {
  return (database.pragma(`index_xinfo('${indexName}')`) as IndexColumnRow[]).filter(
    (row) => row.key === 1
  )
}

afterEach(() => {
  while (databases.length > 0) {
    const database = databases.pop()

    if (database?.open) {
      database.close()
    }
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

describe('runResearchHistoryMigrations', () => {
  it('regressão: banco vazio não recebia o schema completo da versão 1', () => {
    const database = openDatabase()

    runResearchHistoryMigrations(database)

    expect(readUserVersion(database)).toBe(RESEARCH_HISTORY_SCHEMA_VERSION)
    expect(database.pragma('table_info(research_history)')).toEqual([
      { cid: 0, name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: 'masked_cpf', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { cid: 2, name: 'classification', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 3, name: 'cpi_result', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 4, name: 'status', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { cid: 5, name: 'started_at', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 },
      { cid: 6, name: 'finished_at', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 7, name: 'duration_ms', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 8, name: 'pdf_path', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 9, name: 'error_stage', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 10, name: 'error_message', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      { cid: 11, name: 'created_at', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0 }
    ] satisfies TableInfoRow[])
    expect(readNamedIndexes(database)).toEqual([
      {
        name: 'idx_research_history_classification',
        unique: 0,
        origin: 'c',
        partial: 0,
        seq: expect.any(Number)
      },
      {
        name: 'idx_research_history_started_at',
        unique: 0,
        origin: 'c',
        partial: 0,
        seq: expect.any(Number)
      },
      {
        name: 'idx_research_history_status',
        unique: 0,
        origin: 'c',
        partial: 0,
        seq: expect.any(Number)
      }
    ])
    expect(readIndexColumns(database, 'idx_research_history_started_at')).toMatchObject([
      { name: 'started_at', desc: 1 }
    ])
    expect(readIndexColumns(database, 'idx_research_history_status')).toMatchObject([
      { name: 'status', desc: 0 }
    ])
    expect(readIndexColumns(database, 'idx_research_history_classification')).toMatchObject([
      { name: 'classification', desc: 0 }
    ])
  })

  it('regressão: adoção do schema legado regravava dados ou objetos SQLite existentes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-history-migration-'))
    const databasePath = join(directory, 'legacy.sqlite')
    const tracedStatements: string[] = []

    temporaryDirectories.push(directory)
    createLegacyResearchHistoryDatabase(databasePath)

    const database = new Database(databasePath, {
      verbose: (statement) => tracedStatements.push(statement)
    })

    databases.push(database)

    const schemaBefore = readSchema(database)

    expect(readUserVersion(database)).toBe(0)
    expect(readTotalChanges(database)).toBe(0)

    tracedStatements.length = 0

    runResearchHistoryMigrations(database)

    const migrationStatements = tracedStatements.map((statement) =>
      statement.trim().replace(/\s+/g, ' ')
    )
    const forbiddenStatements = migrationStatements.filter((statement) =>
      /^(CREATE|DROP|ALTER|REINDEX|INSERT|UPDATE|DELETE)\b/i.test(statement)
    )
    const unexpectedStatements = migrationStatements.filter(
      (statement) =>
        !/^(SELECT\b|PRAGMA (user_version|table_xinfo|index_list|index_xinfo)\b|BEGIN\b|COMMIT\b|ROLLBACK\b|SAVEPOINT\b|RELEASE\b)/i.test(
          statement
        )
    )

    expect(forbiddenStatements).toEqual([])
    expect(unexpectedStatements).toEqual([])
    expect(migrationStatements).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^SELECT\b/i),
        expect.stringMatching(/^PRAGMA table_xinfo\b/i),
        expect.stringMatching(/^PRAGMA user_version = 1\b/i)
      ])
    )
    expect(readUserVersion(database)).toBe(1)
    expect(readTotalChanges(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(database.prepare('SELECT * FROM research_history').get()).toEqual({
      id: 'legacy-record-1',
      masked_cpf: '***.***.***-44',
      classification: 'CONSTA_RESTRICAO',
      cpi_result: 'Sim, Consta Restrições',
      status: 'CONCLUIDO',
      started_at: '2026-07-14T10:00:00.000Z',
      finished_at: '2026-07-14T10:01:30.000Z',
      duration_ms: 90_000,
      pdf_path: 'E:\\PDF-AGENTE-CPI\\legado.pdf',
      error_stage: null,
      error_message: null,
      created_at: '2026-07-14T10:00:00.000Z'
    })
  })

  it('regressão: reabrir versão 1 reaplicava DDL ou alterava o schema', () => {
    const database = openDatabase()

    runResearchHistoryMigrations(database)

    const schemaBefore = readSchema(database)
    const schemaVersionBefore = database.pragma('schema_version', {
      simple: true
    })

    runResearchHistoryMigrations(database)

    expect(readUserVersion(database)).toBe(1)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(
      database.pragma('schema_version', {
        simple: true
      })
    ).toBe(schemaVersionBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it('regressão: versão futura era alterada antes da recusa', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-future-history-'))
    const databasePath = join(directory, 'future.sqlite')

    temporaryDirectories.push(directory)

    const setupDatabase = openDatabase(databasePath)

    setupDatabase.exec('CREATE TABLE future_marker (value TEXT NOT NULL)')
    setupDatabase.pragma('user_version = 2')
    setupDatabase.close()

    const bytesBefore = readFileSync(databasePath)
    const database = openDatabase(databasePath)

    expect(() => runResearchHistoryMigrations(database)).toThrow(UnsupportedDatabaseVersionError)
    expect(readUserVersion(database)).toBe(2)
    expect(readSchema(database)).toEqual([
      {
        type: 'table',
        name: 'future_marker',
        tbl_name: 'future_marker',
        sql: 'CREATE TABLE future_marker (value TEXT NOT NULL)'
      }
    ])

    database.close()

    expect(readFileSync(databasePath)).toEqual(bytesBefore)
    expect(existsSync(`${databasePath}-wal`)).toBe(false)
    expect(existsSync(`${databasePath}-shm`)).toBe(false)
  })

  it('regressão: schema sem coluna obrigatória era adotado como versão 1', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      omittedColumns: ['error_message']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/error_message/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it.each([
    {
      label: 'chave primária',
      columnOverrides: {
        id: 'id TEXT'
      },
      expectedColumn: 'id'
    },
    {
      label: 'NOT NULL',
      columnOverrides: {
        masked_cpf: 'masked_cpf TEXT'
      },
      expectedColumn: 'masked_cpf'
    },
    {
      label: 'nullable atual',
      columnOverrides: {
        pdf_path: 'pdf_path TEXT NOT NULL'
      },
      expectedColumn: 'pdf_path'
    }
  ])(
    'regressão: flag incompatível de $label em coluna atual era adotada',
    ({ columnOverrides, expectedColumn }) => {
      const database = openDatabase()

      createVersionZeroSchema(database, {
        columnOverrides
      })

      const schemaBefore = readSchema(database)

      expect(() => runResearchHistoryMigrations(database)).toThrow(new RegExp(expectedColumn))
      expect(readUserVersion(database)).toBe(0)
      expect(readSchema(database)).toEqual(schemaBefore)
    }
  )

  it('regressão: schema sem índice obrigatório era adotado como versão 1', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      omittedIndexes: ['idx_research_history_status']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/idx_research_history_status/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
  })

  it('regressão: índice obrigatório apontando para coluna errada era considerado compatível', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      indexOverrides: {
        idx_research_history_status:
          'CREATE INDEX idx_research_history_status ON research_history(classification)'
      }
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/idx_research_history_status/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
  })

  it('regressão: tabela, coluna nullable e índice extras eram removidos durante a adoção', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ['legacy_note TEXT']
    })
    database.exec(`
      CREATE TABLE legacy_metadata (key TEXT PRIMARY KEY);
      CREATE INDEX idx_research_history_legacy_note
      ON research_history(legacy_note);
    `)

    const schemaBefore = readSchema(database)

    runResearchHistoryMigrations(database)

    expect(readUserVersion(database)).toBe(1)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)

    database
      .prepare(
        `
          INSERT INTO research_history (
            id,
            masked_cpf,
            status,
            started_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        'nullable-extra',
        '***.***.***-01',
        'EM_ANDAMENTO',
        '2026-07-29T10:00:00.000Z',
        '2026-07-29T10:00:00.000Z'
      )

    expect(
      database
        .prepare('SELECT legacy_note FROM research_history WHERE id = ?')
        .get('nullable-extra')
    ).toEqual({
      legacy_note: null
    })
  })

  it('regressão: coluna extra NOT NULL com default bloqueava adoção compatível', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ["legacy_source TEXT NOT NULL DEFAULT 'imported'"]
    })

    const schemaBefore = readSchema(database)

    runResearchHistoryMigrations(database)

    expect(readUserVersion(database)).toBe(1)
    expect(readSchema(database)).toEqual(schemaBefore)

    database
      .prepare(
        `
          INSERT INTO research_history (
            id,
            masked_cpf,
            status,
            started_at,
            created_at
          )
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(
        'defaulted-extra',
        '***.***.***-02',
        'EM_ANDAMENTO',
        '2026-07-29T10:00:00.000Z',
        '2026-07-29T10:00:00.000Z'
      )

    expect(
      database
        .prepare('SELECT legacy_source FROM research_history WHERE id = ?')
        .get('defaulted-extra')
    ).toEqual({
      legacy_source: 'imported'
    })
  })

  it.each([
    {
      label: 'texto com escape',
      columnDefinition: "stable_text TEXT NOT NULL DEFAULT 'it''s stable'",
      columnName: 'stable_text',
      expectedValue: "it's stable"
    },
    {
      label: 'número assinado exponencial',
      columnDefinition: 'stable_number REAL NOT NULL DEFAULT -3.5e2',
      columnName: 'stable_number',
      expectedValue: -350
    },
    {
      label: 'blob hexadecimal',
      columnDefinition: "stable_blob BLOB NOT NULL DEFAULT X'CAFE'",
      columnName: 'stable_blob',
      expectedValue: Buffer.from('cafe', 'hex')
    }
  ])(
    'aceita default literal estável não-NULL: $label',
    ({ columnDefinition, columnName, expectedValue }) => {
      const database = openDatabase()

      createVersionZeroSchema(database, {
        extraColumns: [columnDefinition]
      })

      runResearchHistoryMigrations(database)

      expect(readUserVersion(database)).toBe(1)

      database
        .prepare(
          `
            INSERT INTO research_history (
              id,
              masked_cpf,
              status,
              started_at,
              created_at
            )
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(
          `stable-default-${columnName}`,
          '***.***.***-03',
          'EM_ANDAMENTO',
          '2026-07-29T10:00:00.000Z',
          '2026-07-29T10:00:00.000Z'
        )

      expect(database.prepare(`SELECT ${columnName} AS value FROM research_history`).get()).toEqual(
        {
          value: expectedValue
        }
      )
    }
  )

  it.each(['CURRENT_TIME', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'])(
    'aceita keyword SQLite garantidamente não-NULL: %s',
    (defaultKeyword) => {
      const database = openDatabase()

      createVersionZeroSchema(database, {
        extraColumns: [`stable_current_value TEXT NOT NULL DEFAULT ${defaultKeyword}`]
      })

      runResearchHistoryMigrations(database)

      expect(readUserVersion(database)).toBe(1)

      database
        .prepare(
          `
            INSERT INTO research_history (
              id,
              masked_cpf,
              status,
              started_at,
              created_at
            )
            VALUES (?, ?, ?, ?, ?)
          `
        )
        .run(
          `stable-default-${defaultKeyword}`,
          '***.***.***-04',
          'EM_ANDAMENTO',
          '2026-07-29T10:00:00.000Z',
          '2026-07-29T10:00:00.000Z'
        )

      expect(
        database.prepare('SELECT stable_current_value AS value FROM research_history').get()
      ).toEqual({
        value: expect.any(String)
      })
    }
  )

  it('regressão: expressão DEFAULT que avalia NULL era adotada e quebrava inserts omitidos', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ['blocking_default TEXT NOT NULL DEFAULT (1 / 0)']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/blocking_default/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it('regressão: DEFAULT não determinístico era aceito por uma única amostra não-NULL', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ['blocking_random TEXT NOT NULL DEFAULT (random())']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/blocking_random/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it('regressão: coluna generated NOT NULL omitida por table_info era adotada', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ['blocking_extra TEXT GENERATED ALWAYS AS (NULL) STORED NOT NULL']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/blocking_extra/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it('regressão: coluna generated nullable com expressão falível era adotada', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: [
        "generated_nullable TEXT GENERATED ALWAYS AS (json_extract('invalid-json', '$')) STORED"
      ]
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/generated_nullable/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
    expect(readTotalChanges(database)).toBe(0)
  })

  it('regressão: coluna extra NOT NULL sem default era adotada e quebrava inserts atuais', () => {
    const database = openDatabase()

    createVersionZeroSchema(database, {
      extraColumns: ['required_legacy_value TEXT NOT NULL']
    })

    const schemaBefore = readSchema(database)

    expect(() => runResearchHistoryMigrations(database)).toThrow(/required_legacy_value/)
    expect(readUserVersion(database)).toBe(0)
    expect(readSchema(database)).toEqual(schemaBefore)
  })
})
