# Stage 4 Configuration and Persistence Design

**Date:** 2026-07-28
**Status:** approved in conversation; pending written-spec review
**Parent specification:** `2026-07-27-clean-architecture-refactoring-design.md`
**Depends on:** Stage 3 manually approved on Windows on 2026-07-28

## 1. Goal

Create one validated source for the application's active configuration and introduce safe,
versioned SQLite migrations without changing the current functional or visual behavior.

Stage 4 preserves:

- `app.getPath('userData')/agente-cpi.sqlite`;
- every existing research-history row and persisted PDF path;
- `%APPDATA%/AgenteCPI/browser-profile`, its cookies and authenticated sessions;
- current platform URLs, intervals, retry limits and timeouts;
- current SQLite tables, columns, indexes, queries, WAL mode and foreign-key mode;
- renderer, preload, IPC, automation states, public messages and interactions.

## 2. Approved decisions

The user approved:

1. the existing `userData/agente-cpi.sqlite` path as the canonical production database;
2. no database move, copy, rename or automatic downgrade;
3. complete removal of Drizzle because it has no runtime consumer and its configured schema file
   does not exist;
4. a TypeScript configuration module validated by Zod, with no JSON file, user-facing settings
   screen or environment-based overrides;
5. incremental synchronous migrations controlled by `PRAGMA user_version`;
6. refusal of database versions newer than the application supports, without changing the file;
7. no new backup file in Stage 4 because version `0 → 1` does not rebuild or transform an
   existing schema;
8. one path/configuration contract shared by the application and production-aligned operational
   scripts;
9. continued isolation of `browser-smoke-test` under `data/runtime`;
10. a dedicated migration runner rather than migration logic inside the history repository.

## 3. Verified current state

The current repository has three conflicting database-path declarations:

- the production runtime opens `app.getPath('userData')/agente-cpi.sqlite`;
- `RuntimePaths.databaseFile` points to `%APPDATA%/AgenteCPI/database/agent.db` but production does
  not use it;
- `drizzle.config.ts` points to `data/development.db`.

The production database uses `better-sqlite3` and SQL embedded in
`ResearchHistoryRepository`. Drizzle ORM is not imported by production or tests. Its CLI scripts
are not part of the runtime, and `drizzle.config.ts` references the absent
`src/infrastructure/database/schema.ts`.

Configuration is also split between:

- `src/infrastructure/config/app-config.ts`;
- `src/automation/browser/platform-urls.ts`;
- controller-local timeout and polling defaults;
- duplicate DeskData URLs and PDF directories;
- direct `%APPDATA%` reads in operational scripts.

Some fields in the current `AppConfig` have no production consumer. Stage 4 must not activate
those dormant behaviors merely because values exist in a schema.

## 4. Architecture

Stage 4 introduces three bounded responsibilities.

### 4.1 Validated configuration

`infrastructure/config` owns one immutable configuration contract for active runtime values:

- platform URLs;
- operational path names and file names;
- timeouts;
- polling intervals;
- attempt and retry limits that are actually consumed;
- fixed runtime invariants that are actually consumed.

The module:

- has no Electron dependency;
- does not read `process.env`;
- does not read or write a configuration file;
- validates the complete default object with Zod;
- exposes a small typed result;
- supports explicit test input without creating a production override mechanism.

The Electron composition root supplies Electron paths. Script entry points supply their
environment-derived base path. All consumers receive the validated result.

Selectors, expected page text, classifications and business rules remain with their owning
adapters or domain modules. They are not converted into generic configuration.

### 4.2 Path resolution

The path resolver receives explicit base paths:

```ts
interface ApplicationPathBases {
  appDataDir: string
  userDataDir: string
}
```

It produces:

- `%APPDATA%/AgenteCPI` as the operational root;
- `%APPDATA%/AgenteCPI/browser-profile`;
- operational downloads, screenshots, logs and configuration directories;
- `app.getPath('userData')/agente-cpi.sqlite` as the only database file;
- `E:\PDF-AGENTE-CPI` as the preferred directory for new PDFs;
- the operational downloads directory as the PDF fallback.

`databaseDir` and `databaseFile` values that imply
`%APPDATA%/AgenteCPI/database/agent.db` are removed. The database parent is not moved or
re-created under the operational root.

Application code continues to obtain `appData` and `userData` only in the Electron composition
root. Operational scripts use a shared script adapter to validate `%APPDATA%` and call the same
path resolver. The browser smoke test passes its isolated root explicitly and cannot touch the
real profile or database.

### 4.3 Persistence

The existing `infrastructure/database` area gains:

- a single research-history schema definition;
- an ordered migration list;
- a synchronous SQLite migration runner.

`ResearchHistoryRepository` retains:

- row mapping;
- input validation;
- create, update, list and clear queries;
- interruption recovery;
- connection lifecycle.

It delegates schema versioning and migration execution. The repository no longer embeds or owns
schema migration SQL.

## 5. Configuration contract

The implementation begins with an inventory of values consumed in production. Each active value
gets a semantic field even when two fields currently share the same numeric default. For example,
download-start timeout and navigation timeout are different responsibilities even if both happen
to be 30 seconds.

The contract consolidates at least:

- CPI queue and DeskData people URLs;
- the 60-second queue-check interval;
- page navigation, element action, element read and download-start timeouts;
- active 250-millisecond polling intervals;
- active form/search attempt limits;
- preferred and fallback PDF directories;
- operational directory and database file names.

Duplicate literals are replaced by references to the typed contract. Existing constructors may
retain explicit injection seams for deterministic tests, but production defaults come from the
single configuration source.

Fields proven to have no runtime consumer are removed instead of being wired into production.
This specifically prevents dormant retry, delay or safe-mode values from changing the current
agent lifecycle. A future stage may introduce those behaviors through its own approved design.

Configuration errors fail before the browser or database is opened. Error messages identify the
invalid field without containing CPF, session data or external-page content.

## 6. PDF directory resolution

New PDF downloads preserve the approved Windows preference:

1. ensure `E:\PDF-AGENTE-CPI` exists and is writable;
2. use it when available;
3. otherwise ensure and use `%APPDATA%/AgenteCPI/downloads`;
4. propagate the filesystem error if neither directory is usable.

The resolver is injected with filesystem operations in tests. Tests do not access a real drive
letter.

This fallback changes only the failure case in which the preferred Windows drive or directory
cannot be used. Existing successful behavior remains identical. Historical `pdf_path` values are
never normalized, migrated or rewritten.

## 7. SQLite versioning

The current schema becomes application schema version `1`.

The migration runner:

1. reads `PRAGMA user_version`;
2. rejects negative or non-integer results as invalid state;
3. rejects a version greater than the supported version;
4. selects a contiguous migration chain;
5. runs each migration synchronously in a `better-sqlite3` transaction;
6. updates `user_version` inside the same transaction as its migration;
7. closes the connection and rethrows if initialization fails.

`journal_mode = WAL` is applied only after version compatibility and pending migrations succeed.
This ordering prevents a future-version database from being modified merely by opening it.
`foreign_keys = ON` remains a connection-local setting and is enabled before migration.

Migration definitions use explicit adjacent versions:

```ts
interface SqliteMigration {
  fromVersion: number
  toVersion: number
  migrate(database: SqliteDatabase): void
}
```

The runner validates that:

- `toVersion === fromVersion + 1`;
- versions are unique and ordered;
- there is no gap from the database version to the supported version.

No asynchronous operation runs inside a SQLite transaction.

## 8. Version `0 → 1`

The first migration has two supported starting states.

### 8.1 New database

When `research_history` does not exist, migration `0 → 1` creates exactly the current table and
the three current indexes, then records version `1`.

### 8.2 Existing current database

When `research_history` exists, migration `0 → 1` validates:

- every required column;
- compatible SQLite column types;
- the current primary-key and required not-null properties;
- the three current indexes.

Required schema elements must match. Additional unrelated tables, columns or indexes are
tolerated and preserved. An additional column is compatible only when it is nullable or has a
default, so the repository's unchanged `INSERT` statements cannot be made invalid. The migration
does not rebuild the table, copy rows, rewrite values or recreate indexes. It only records
version `1`.

An incompatible version `0` database fails without modification. Stage 4 does not guess the
meaning of an unknown legacy layout.

## 9. Transaction and compatibility rules

Connection setup preserves:

- `journal_mode = WAL`;
- `foreign_keys = ON`.

A future-version check runs before the WAL pragma. For a supported database, foreign keys are
enabled, migrations run, and WAL is then applied before the repository serves any query.

A thrown migration error causes rollback of its schema changes, data changes and `user_version`.
The error is propagated after the connection is closed.

A database with `user_version > 1` produces a dedicated compatibility error containing only the
found and supported versions. No downgrade, backup, schema write or query is attempted.

Stage 4 adds no constraint or index. Any future structural migration must have a separately
approved design, validate a backup before mutation and include representative migration tests.

## 10. Drizzle removal

Stage 4 removes:

- `drizzle.config.ts`;
- `drizzle-orm`;
- `drizzle-kit`;
- `db:generate`;
- `db:studio`;
- all Drizzle-only lockfile entries.

Removal requires repository-wide evidence that no supported entry point imports or executes
Drizzle. `better-sqlite3` remains the sole database runtime.

## 11. Data flow

```text
Electron app.getPath(appData, userData)
                    │
                    ▼
       validated application config
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
  operational paths     active timing/URLs
          │                   │
          ▼                   ▼
 database file          runtime services
          │
          ▼
 SQLite migration runner
          │
          ▼
 ResearchHistoryRepository
```

Operational scripts enter the same flow through a small Windows environment adapter. The smoke
test supplies an isolated root and bypasses real application data.

## 12. Error handling and privacy

- Configuration validation fails before external resources are started.
- Filesystem fallback reports the final actionable failure without exposing sensitive data.
- Migration errors preserve the original cause for internal diagnostics.
- Public IPC channels, payloads and messages remain unchanged.
- No full CPF is written to configuration, database fixtures, errors, logs, screenshots or
  documentation.
- Migration fixtures contain only masked identifiers and synthetic records.
- No real SQLite database, Chromium profile, cookie, session or PDF is copied into the
  repository.

## 13. Verification

Implementation follows RED → GREEN in independently reviewable tasks.

Required targeted tests cover:

1. exact default configuration values;
2. invalid URLs, paths, intervals, timeouts and attempt limits;
3. exact production path compatibility;
4. application and script parity;
5. smoke-test path isolation;
6. preferred PDF directory success;
7. preferred PDF failure with operational fallback;
8. failure of both PDF locations;
9. new database migration to version `1`;
10. representative current version `0` database with synthetic masked rows;
11. row-value preservation after version adoption;
12. idempotent reopen at version `1`;
13. future-version refusal without mutation;
14. incompatible version `0` refusal without mutation;
15. migration rollback including `user_version`;
16. repository behavior after migration ownership is extracted;
17. complete Drizzle removal.

The stage gate includes:

- architecture contracts;
- Node and renderer typechecks;
- structural type tests;
- zero-warning ESLint;
- repository-wide Prettier;
- full runtime suite;
- coverage at or above the Stage 3 checkpoint;
- Windows production build;
- `git diff --check`;
- privacy and forbidden-import scans;
- independent cumulative diff review;
- manual Windows validation.

External platform checks remain read-only. Stage 4 does not save, attach, confirm or mutate a
real research.

## 14. Out of scope

Stage 4 does not:

- move or rename the production SQLite file;
- rewrite existing history or PDF paths;
- reset the Chromium profile or sessions;
- introduce configuration UI, JSON configuration or environment overrides;
- add a general-purpose migration framework;
- add new tables, columns, indexes or constraints;
- redesign the application core or external adapters;
- change selectors, classifications, public states, renderer, preload or IPC;
- create a commit, push or Stage 5 implementation plan before manual approval.

## 15. Acceptance criteria

Stage 4 is accepted only when:

- all active configuration has one validated source;
- application and production-aligned scripts resolve identical operational paths;
- production still opens exactly `userData/agente-cpi.sqlite`;
- version `0` history is preserved and adopted as version `1`;
- future and incompatible databases are refused without mutation;
- migration rollback is proven;
- Drizzle is completely absent;
- historical PDF paths are unchanged;
- new PDF output falls back safely when the preferred Windows path is unavailable;
- every automated gate passes without coverage regression;
- independent review has no unresolved Critical or Important findings;
- the user manually validates the Windows application;
- no commit or push has occurred.

## 16. Official references

- Electron `app.getPath`: https://www.electronjs.org/docs/latest/api/app/
- SQLite `PRAGMA user_version`: https://www.sqlite.org/pragma.html#pragma_user_version
- SQLite database file format: https://www.sqlite.org/fileformat.html
- better-sqlite3 API (`transaction`, `pragma`):
  https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
