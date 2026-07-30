import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  runSqliteMigrations,
  UnsupportedDatabaseVersionError,
  type SqliteMigrationPlan
} from '@/infrastructure/database/sqlite-migration-runner'

const databases: InstanceType<typeof Database>[] = []
const temporaryDirectories: string[] = []

function openDatabase(filePath = ':memory:'): InstanceType<typeof Database> {
  const database = new Database(filePath)

  databases.push(database)

  return database
}

function tableExists(database: InstanceType<typeof Database>, tableName: string): boolean {
  return (
    database
      .prepare(
        `
          SELECT 1
          FROM sqlite_master
          WHERE type = 'table' AND name = ?
        `
      )
      .get(tableName) !== undefined
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

describe('runSqliteMigrations', () => {
  it('regressão: etapas válidas não atualizavam o schema e user_version até a versão suportada', () => {
    const database = openDatabase()

    expect(database.pragma('user_version', { simple: true })).toBe(0)

    runSqliteMigrations(database, {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) => migrationDatabase.exec('CREATE TABLE one (id TEXT)')
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (migrationDatabase) => migrationDatabase.exec('CREATE TABLE two (id TEXT)')
        }
      ]
    })

    expect(database.pragma('user_version', { simple: true })).toBe(2)
    expect(tableExists(database, 'one')).toBe(true)
    expect(tableExists(database, 'two')).toBe(true)
  })

  it('regressão: plano com versão de origem duplicada executava uma etapa antes de falhar', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
        },
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE also_should_not_exist (id TEXT)')
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow(Error)
    expect(database.pragma('user_version', { simple: true })).toBe(0)
    expect(tableExists(database, 'should_not_exist')).toBe(false)
  })

  it('regressão: plano não contíguo executava etapas parciais antes de detectar a lacuna', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 3,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
        },
        {
          fromVersion: 2,
          toVersion: 3,
          migrate: (migrationDatabase) => migrationDatabase.exec('CREATE TABLE gap (id TEXT)')
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE out_of_order (id TEXT)')
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow(Error)
    expect(database.pragma('user_version', { simple: true })).toBe(0)
    expect(tableExists(database, 'should_not_exist')).toBe(false)
  })

  it('regressão: etapa que pulava de 0 para 2 ignorava a transição esperada de 0 para 1', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 2,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE also_should_not_exist (id TEXT)')
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow(
      'A migração SQLite na posição 0 deve avançar da versão 0 para 1'
    )
    expect(database.pragma('user_version', { simple: true })).toBe(0)
    expect(tableExists(database, 'should_not_exist')).toBe(false)
  })

  it('regressão: plano sem cobertura até supportedVersion parecia válido', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow(Error)
    expect(database.pragma('user_version', { simple: true })).toBe(0)
    expect(tableExists(database, 'should_not_exist')).toBe(false)
  })

  it.each([
    {
      supportedVersion: -1,
      fromVersion: 0,
      toVersion: 1
    },
    {
      supportedVersion: 1.5,
      fromVersion: 0,
      toVersion: 1
    },
    {
      supportedVersion: 1,
      fromVersion: -1,
      toVersion: 0
    },
    {
      supportedVersion: 1,
      fromVersion: 0,
      toVersion: 1.5
    }
  ])(
    'regressão: versão inválida $supportedVersion/$fromVersion/$toVersion alterava o banco',
    ({ supportedVersion, fromVersion, toVersion }) => {
      const database = openDatabase()

      const plan: SqliteMigrationPlan = {
        supportedVersion,
        migrations: [
          {
            fromVersion,
            toVersion,
            migrate: (migrationDatabase) =>
              migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
          }
        ]
      }

      expect(() => runSqliteMigrations(database, plan)).toThrow(Error)
      expect(database.pragma('user_version', { simple: true })).toBe(0)
      expect(tableExists(database, 'should_not_exist')).toBe(false)
    }
  )

  it('regressão: banco criado por versão futura era alterado antes de recusar compatibilidade', () => {
    const database = openDatabase()
    let executedMigrations = 0

    database.pragma('user_version = 3')

    const plan: SqliteMigrationPlan = {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) => {
            executedMigrations += 1
            migrationDatabase.exec('CREATE TABLE should_not_exist (id TEXT)')
          }
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: () => {
            executedMigrations += 1
          }
        }
      ]
    }

    let thrownError: unknown

    try {
      runSqliteMigrations(database, plan)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(UnsupportedDatabaseVersionError)
    expect(thrownError).toMatchObject({
      foundVersion: 3,
      supportedVersion: 2
    })
    expect(database.pragma('user_version', { simple: true })).toBe(3)
    expect(executedMigrations).toBe(0)
    expect(tableExists(database, 'should_not_exist')).toBe(false)
  })

  it('regressão: falha na migração deixava DDL e user_version persistidos', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 1,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) => {
            migrationDatabase.exec('CREATE TABLE rolled_back_table (id TEXT)')
            throw new Error('migration failure')
          }
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow('migration failure')
    expect(database.pragma('user_version', { simple: true })).toBe(0)
    expect(tableExists(database, 'rolled_back_table')).toBe(false)
  })

  it('regressão: falha no segundo step revertia o primeiro step já concluído', () => {
    const database = openDatabase()

    const plan: SqliteMigrationPlan = {
      supportedVersion: 2,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) =>
            migrationDatabase.exec('CREATE TABLE first_step (id TEXT)')
        },
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (migrationDatabase) => {
            migrationDatabase.exec('CREATE TABLE second_step (id TEXT)')
            throw new Error('second migration failure')
          }
        }
      ]
    }

    expect(() => runSqliteMigrations(database, plan)).toThrow('second migration failure')
    expect(database.pragma('user_version', { simple: true })).toBe(1)
    expect(tableExists(database, 'first_step')).toBe(true)
    expect(tableExists(database, 'second_step')).toBe(false)
  })

  it('regressão: reabrir banco já suportado reaplicava migrações', () => {
    const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-sqlite-migration-'))
    const databasePath = join(directory, 'migration.sqlite')
    const firstDatabase = openDatabase(databasePath)
    let executedMigrations = 0

    temporaryDirectories.push(directory)

    const plan: SqliteMigrationPlan = {
      supportedVersion: 1,
      migrations: [
        {
          fromVersion: 0,
          toVersion: 1,
          migrate: (migrationDatabase) => {
            executedMigrations += 1
            migrationDatabase.exec('CREATE TABLE persisted_table (id TEXT)')
          }
        }
      ]
    }

    runSqliteMigrations(firstDatabase, plan)
    firstDatabase.close()

    const reopenedDatabase = openDatabase(databasePath)

    executedMigrations = 0

    runSqliteMigrations(reopenedDatabase, plan)

    expect(executedMigrations).toBe(0)
    expect(reopenedDatabase.pragma('user_version', { simple: true })).toBe(1)
    expect(tableExists(reopenedDatabase, 'persisted_table')).toBe(true)
  })
})
