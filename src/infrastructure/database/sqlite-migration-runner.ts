import Database from 'better-sqlite3'

type SqliteDatabase = InstanceType<typeof Database>

export interface SqliteMigration {
  fromVersion: number
  toVersion: number
  migrate(database: SqliteDatabase): void
}

export interface SqliteMigrationPlan {
  supportedVersion: number
  migrations: readonly SqliteMigration[]
}

export class UnsupportedDatabaseVersionError extends Error {
  constructor(
    public readonly foundVersion: number,
    public readonly supportedVersion: number
  ) {
    super(
      `A versão ${foundVersion} do banco SQLite é mais nova que a versão suportada ${supportedVersion}`
    )
    this.name = 'UnsupportedDatabaseVersionError'
  }
}

export function runSqliteMigrations(database: SqliteDatabase, plan: SqliteMigrationPlan): void {
  validateMigrationPlan(plan)

  const currentVersion = database.pragma('user_version', {
    simple: true
  }) as number

  assertNonNegativeInteger(currentVersion, 'A versão atual do banco SQLite')

  if (currentVersion > plan.supportedVersion) {
    throw new UnsupportedDatabaseVersionError(currentVersion, plan.supportedVersion)
  }

  for (let version = currentVersion; version < plan.supportedVersion; version += 1) {
    const migration = plan.migrations[version]

    if (!migration) {
      throw new Error(`Migração SQLite ausente da versão ${version} para ${version + 1}`)
    }

    database.transaction(() => {
      migration.migrate(database)
      database.pragma(`user_version = ${migration.toVersion}`)
    })()
  }
}

function validateMigrationPlan(plan: SqliteMigrationPlan): void {
  assertNonNegativeInteger(plan.supportedVersion, 'A versão suportada')

  if (plan.migrations.length !== plan.supportedVersion) {
    throw new Error('O plano de migração SQLite não cobre todas as versões suportadas')
  }

  for (let version = 0; version < plan.migrations.length; version += 1) {
    const migration = plan.migrations[version]

    if (!migration) {
      throw new Error(`Migração SQLite ausente na posição ${version}`)
    }

    assertNonNegativeInteger(migration.fromVersion, 'A versão de origem da migração')
    assertNonNegativeInteger(migration.toVersion, 'A versão de destino da migração')

    if (migration.fromVersion !== version || migration.toVersion !== version + 1) {
      throw new Error(
        `A migração SQLite na posição ${version} deve avançar da versão ${version} para ${version + 1}`
      )
    }
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser um inteiro não negativo`)
  }
}
