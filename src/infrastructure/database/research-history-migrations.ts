import Database from 'better-sqlite3'
import {
  RESEARCH_HISTORY_SCHEMA_SQL,
  RESEARCH_HISTORY_SCHEMA_VERSION,
  REQUIRED_RESEARCH_HISTORY_COLUMNS,
  REQUIRED_RESEARCH_HISTORY_COLUMN_METADATA,
  REQUIRED_RESEARCH_HISTORY_INDEXES,
  REQUIRED_RESEARCH_HISTORY_INDEX_METADATA
} from './research-history-schema'
import { runSqliteMigrations } from './sqlite-migration-runner'

type SqliteDatabase = InstanceType<typeof Database>

const SQL_TEXT_LITERAL_PATTERN = /^'(?:[^']|'')*'$/
const SQL_BLOB_LITERAL_PATTERN = /^X'[0-9A-F]*'$/i
const SQL_SIGNED_NUMBER_LITERAL_PATTERN =
  /^[+-]?(?:0x[0-9a-f]+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i
const SQL_CURRENT_VALUE_KEYWORD_PATTERN = /^CURRENT_(?:TIME|DATE|TIMESTAMP)$/i

interface TableInfoRow {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
  pk: number
  hidden: number
}

interface IndexListRow {
  name: string
  unique: number
  origin: string
  partial: number
}

interface IndexInfoRow {
  name: string | null
  desc: number
  coll: string
  key: number
}

interface TableExistsRow {
  exists: number
}

export { RESEARCH_HISTORY_SCHEMA_VERSION }

export function runResearchHistoryMigrations(database: SqliteDatabase): void {
  runSqliteMigrations(database, {
    supportedVersion: RESEARCH_HISTORY_SCHEMA_VERSION,
    migrations: [
      {
        fromVersion: 0,
        toVersion: 1,
        migrate: migrateVersionZeroToOne
      }
    ]
  })
}

function migrateVersionZeroToOne(database: SqliteDatabase): void {
  if (!researchHistoryTableExists(database)) {
    database.exec(RESEARCH_HISTORY_SCHEMA_SQL)
  }

  assertCompatibleResearchHistoryTable(database)
}

function researchHistoryTableExists(database: SqliteDatabase): boolean {
  const row = database
    .prepare(
      `
        SELECT 1 AS "exists"
        FROM sqlite_schema
        WHERE type = 'table' AND name = 'research_history'
      `
    )
    .get() as TableExistsRow | undefined

  return row?.exists === 1
}

function assertCompatibleResearchHistoryTable(database: SqliteDatabase): void {
  const columns = database.pragma('table_xinfo(research_history)') as TableInfoRow[]
  const columnsByName = new Map(columns.map((column) => [column.name, column]))

  for (const requiredColumn of REQUIRED_RESEARCH_HISTORY_COLUMNS) {
    const column = columnsByName.get(requiredColumn)

    if (!column) {
      throw new Error(`Coluna obrigatória incompatível ou ausente: ${requiredColumn}`)
    }

    const expected = REQUIRED_RESEARCH_HISTORY_COLUMN_METADATA[requiredColumn]

    if (
      column.type.trim().toUpperCase() !== expected.type ||
      column.notnull !== Number(expected.notNull) ||
      column.pk !== expected.primaryKeyPosition ||
      column.hidden !== 0
    ) {
      throw new Error(`Metadados incompatíveis na coluna obrigatória: ${requiredColumn}`)
    }
  }

  const requiredColumnNames = new Set<string>(REQUIRED_RESEARCH_HISTORY_COLUMNS)

  for (const column of columns) {
    if (
      !requiredColumnNames.has(column.name) &&
      (column.hidden !== 0 || (column.notnull === 1 && !hasStableNonNullDefault(column.dflt_value)))
    ) {
      throw new Error(
        `Coluna extra incompatível com os inserts atuais do histórico: ${column.name}`
      )
    }
  }

  assertCompatibleResearchHistoryIndexes(database)
}

function hasStableNonNullDefault(defaultValue: string | null): boolean {
  if (defaultValue === null) {
    return false
  }

  const normalizedDefault = defaultValue.trim()

  return (
    SQL_TEXT_LITERAL_PATTERN.test(normalizedDefault) ||
    SQL_BLOB_LITERAL_PATTERN.test(normalizedDefault) ||
    SQL_SIGNED_NUMBER_LITERAL_PATTERN.test(normalizedDefault) ||
    SQL_CURRENT_VALUE_KEYWORD_PATTERN.test(normalizedDefault)
  )
}

function assertCompatibleResearchHistoryIndexes(database: SqliteDatabase): void {
  const indexes = database.pragma('index_list(research_history)') as IndexListRow[]
  const indexesByName = new Map(indexes.map((index) => [index.name, index]))

  for (const requiredIndex of REQUIRED_RESEARCH_HISTORY_INDEXES) {
    const index = indexesByName.get(requiredIndex)

    if (!index) {
      throw new Error(`Índice obrigatório incompatível ou ausente: ${requiredIndex}`)
    }

    if (index.unique !== 0 || index.partial !== 0 || index.origin !== 'c') {
      throw new Error(`Metadados incompatíveis no índice obrigatório: ${requiredIndex}`)
    }

    const keyColumns = (
      database.pragma(`index_xinfo('${requiredIndex}')`) as IndexInfoRow[]
    ).filter((column) => column.key === 1)
    const expected = REQUIRED_RESEARCH_HISTORY_INDEX_METADATA[requiredIndex]
    const keyColumn = keyColumns[0]

    if (
      keyColumns.length !== 1 ||
      !keyColumn ||
      keyColumn.name !== expected.column ||
      keyColumn.desc !== Number(expected.descending) ||
      keyColumn.coll.toUpperCase() !== 'BINARY'
    ) {
      throw new Error(`Definição incompatível no índice obrigatório: ${requiredIndex}`)
    }
  }
}
