# Stage 4 Configuration and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize every active runtime configuration value and add safe, versioned SQLite
migrations while preserving the exact Windows behavior and all existing application data.

**Architecture:** A Zod-validated infrastructure configuration is created once by the composition
root and passed into legacy automation through explicit options. One filesystem module resolves
production and isolated paths without moving the canonical database. A dedicated synchronous
SQLite migration runner adopts the current schema as version 1 before the unchanged history
repository begins serving queries.

**Tech Stack:** TypeScript 5.9, Electron 39, Node 24 runtime, Zod 4, better-sqlite3 12, Vitest 4,
pnpm 10, Windows.

## Global Constraints

- Preserve the exact functional and visual Windows behavior approved after Stage 3.
- Preserve `app.getPath('userData')/agente-cpi.sqlite` without moving, copying or renaming it.
- Preserve `%APPDATA%/AgenteCPI/browser-profile`, cookies, sessions, downloaded PDFs and every
  persisted PDF path.
- Keep the current SQLite table, columns, indexes, SQL query behavior, WAL mode and foreign-key
  mode.
- Version the current schema as `1` through synchronous transactional migrations and
  `PRAGMA user_version`.
- Refuse database versions above `1` without modifying the database.
- Do not create a backup in Stage 4; the version `0 → 1` adoption does not rebuild or transform
  an existing table.
- Keep `E:\PDF-AGENTE-CPI` as the preferred new-PDF directory and use the operational downloads
  directory only when the preferred directory is unavailable.
- Use no JSON configuration, settings UI or production environment override.
- Remove Drizzle ORM, Drizzle Kit, their scripts, configuration and lockfile entries.
- New tests, fixtures, documentation and error messages must not contain a complete CPF.
- External platform validation remains read-only. Do not save, attach, confirm or mutate a real
  research.
- Do not run `git add`, create a commit, merge, push or open a pull request.
- The project-wide single final commit remains forbidden until every stage and final manual
  Windows validation are approved.
- Each task ends with a task-scoped working-tree diff and an independent review, not a commit.

## Baseline

Before Task 1, run:

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
git diff --cached --name-only
git rev-parse HEAD

$stage4Workspace = '.superpowers/sdd/2026-07-27-refactoring-stage-4-data-config-implementation-plan'
New-Item -ItemType Directory -Path $stage4Workspace -Force | Out-Null
$cpfBaselinePath = Join-Path $stage4Workspace 'stage-4-baseline-complete-cpf.txt'
$cpfBaseline = @(
  rg -o "\b\d{3}\.\d{3}\.\d{3}-\d{2}\b" src tests scripts docs/architecture |
    Sort-Object -Unique
)
[System.IO.File]::WriteAllLines(
  (Join-Path (Resolve-Path $stage4Workspace).Path 'stage-4-baseline-complete-cpf.txt'),
  $cpfBaseline,
  [System.Text.UTF8Encoding]::new($false)
)
```

Expected:

- typechecks and the structural type contract pass;
- 90 runtime test files and 433 runtime tests pass;
- ESLint has zero warnings;
- Prettier passes;
- main, preload and renderer production bundles pass;
- coverage is at least 83.81% statements, 74.83% branches, 88.38% functions and 84.02% lines;
- the pre-Stage-4 complete-CPF occurrence baseline is stored in the ignored SDD workspace;
- staging is empty;
- HEAD remains `91902e7378ee94f90f714a8079b682477f4b0528`.

---

### Task 1: Define the single validated application configuration

**Files:**

- Modify: `src/infrastructure/config/app-config.ts`
- Modify: `tests/unit/infrastructure/config/app-config.test.ts`
- Review: `src/automation/browser/platform-urls.ts`
- Review: every active timeout, polling interval and attempt limit under `src/automation/**`

**Interfaces:**

- Produces:
  - `APP_CONFIG_DEFAULTS`;
  - `AppConfig`;
  - `parseAppConfig(input?: unknown): AppConfig`.
- Preserves:
  - every currently active URL and numeric value;
  - explicit constructor options used by unit tests.
- Does not activate:
  - dormant between-job delays;
  - dormant retry schedules;
  - dormant maximum-error or safe-mode behavior.

- [ ] **Step 1: Write the complete configuration contract test**

Replace the old flat-default expectation with the approved nested contract:

```ts
expect(parseAppConfig()).toEqual({
  platform: {
    cpiQueueUrl:
      'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
    deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/'
  },
  paths: {
    operationalDirectoryName: 'AgenteCPI',
    databaseFileName: 'agente-cpi.sqlite',
    browserProfileDirectoryName: 'browser-profile',
    downloadsDirectoryName: 'downloads',
    screenshotsDirectoryName: 'screenshots',
    logsDirectoryName: 'logs',
    configDirectoryName: 'config',
    preferredPdfDirectory: 'E:\\PDF-AGENTE-CPI'
  },
  timing: {
    queueCheckIntervalMs: 60_000,
    platformPageNavigationTimeoutMs: 45_000,
    navigationTimeoutMs: 30_000,
    actionTimeoutMs: 10_000,
    readTimeoutMs: 5_000,
    downloadStartTimeoutMs: 30_000,
    cpiSearchPollingIntervalMs: 250,
    deskDataFormPollingIntervalMs: 250,
    deskDataResultPollingIntervalMs: 500,
    deskDataHistoryNavigationIntervalMs: 250,
    queueFilterSettleDelayMs: 700,
    submitSettleDelayMs: 1_000,
    queueReturnDelayMs: 3_000
  },
  limits: {
    cpiFrameSearchAttempts: 40,
    cpiIdentitySearchAttempts: 40,
    cpiAttachmentSearchAttempts: 40,
    cpiResultSearchAttempts: 40,
    cpiResultStabilizationAttempts: 3,
    deskDataFormReadyAttempts: 40,
    deskDataResultSearchAttempts: 180,
    deskDataHistoryNavigationAttempts: 120
  }
})
```

Add focused tests that:

```ts
expect(() =>
  parseAppConfig({
    platform: {
      cpiQueueUrl: 'http://cpi.example.test/fila'
    }
  })
).toThrow()

expect(() =>
  parseAppConfig({
    timing: {
      queueCheckIntervalMs: 29_999
    }
  })
).toThrow()

expect(() =>
  parseAppConfig({
    paths: {
      databaseFileName: '   '
    }
  })
).toThrow()
```

- [ ] **Step 2: Run the configuration test and verify RED**

Run:

```powershell
pnpm test -- tests/unit/infrastructure/config/app-config.test.ts
```

Expected: failure because the current parser returns the old flat, partly dormant configuration.

- [ ] **Step 3: Implement the nested immutable schema**

Use named schemas and defaults in `app-config.ts`:

```ts
import { z } from 'zod'

export const APP_CONFIG_DEFAULTS = {
  platform: {
    cpiQueueUrl:
      'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
    deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/'
  },
  paths: {
    operationalDirectoryName: 'AgenteCPI',
    databaseFileName: 'agente-cpi.sqlite',
    browserProfileDirectoryName: 'browser-profile',
    downloadsDirectoryName: 'downloads',
    screenshotsDirectoryName: 'screenshots',
    logsDirectoryName: 'logs',
    configDirectoryName: 'config',
    preferredPdfDirectory: 'E:\\PDF-AGENTE-CPI'
  },
  timing: {
    queueCheckIntervalMs: 60_000,
    platformPageNavigationTimeoutMs: 45_000,
    navigationTimeoutMs: 30_000,
    actionTimeoutMs: 10_000,
    readTimeoutMs: 5_000,
    downloadStartTimeoutMs: 30_000,
    cpiSearchPollingIntervalMs: 250,
    deskDataFormPollingIntervalMs: 250,
    deskDataResultPollingIntervalMs: 500,
    deskDataHistoryNavigationIntervalMs: 250,
    queueFilterSettleDelayMs: 700,
    submitSettleDelayMs: 1_000,
    queueReturnDelayMs: 3_000
  },
  limits: {
    cpiFrameSearchAttempts: 40,
    cpiIdentitySearchAttempts: 40,
    cpiAttachmentSearchAttempts: 40,
    cpiResultSearchAttempts: 40,
    cpiResultStabilizationAttempts: 3,
    deskDataFormReadyAttempts: 40,
    deskDataResultSearchAttempts: 180,
    deskDataHistoryNavigationAttempts: 120
  }
} as const
```

Build Zod objects with:

- HTTPS-only URL refinements;
- trimmed non-empty path segments;
- integer positive timeouts;
- `queueCheckIntervalMs >= 30_000`;
- positive integer attempt limits;
- `.readonly()` on nested objects and the root.

`parseAppConfig()` must merge omitted nested fields with `APP_CONFIG_DEFAULTS`, but reject unknown
keys. Do not carry the unused fields from the old schema into the new result.

- [ ] **Step 4: Run focused GREEN and static checks**

Run:

```powershell
pnpm test -- tests/unit/infrastructure/config/app-config.test.ts
pnpm run typecheck
pnpm exec eslint src/infrastructure/config/app-config.ts tests/unit/infrastructure/config/app-config.test.ts --max-warnings 0
pnpm exec prettier --check src/infrastructure/config/app-config.ts tests/unit/infrastructure/config/app-config.test.ts
git diff --check
```

Expected: all pass; no production consumer has been rewired yet.

- [ ] **Step 5: Record the working-tree checkpoint**

Run:

```powershell
git diff -- src/infrastructure/config/app-config.ts tests/unit/infrastructure/config/app-config.test.ts
git diff --cached --name-only
```

Expected: only the validated contract and its tests changed; staging is empty. Do not commit.

---

### Task 2: Resolve canonical Windows paths and safe PDF output

**Files:**

- Modify: `src/infrastructure/filesystem/runtime-paths.ts`
- Create: `src/infrastructure/filesystem/pdf-output-directory-resolver.ts`
- Modify: `tests/unit/infrastructure/filesystem/runtime-paths.test.ts`
- Create: `tests/unit/infrastructure/filesystem/pdf-output-directory-resolver.test.ts`
- Modify: `scripts/browser-smoke-test.ts`

**Interfaces:**

- Consumes:
  - `AppConfig['paths']`.
- Produces:
  - `ApplicationPathBases`;
  - `OperationalPaths`;
  - `ApplicationPaths`;
  - `resolveOperationalPaths(appDataDir, pathConfig)`;
  - `resolveApplicationPaths(bases, pathConfig)`;
  - `resolveIsolatedOperationalPaths(rootDir, pathConfig)`;
  - `ensureOperationalDirectories(paths)`;
  - `resolvePdfOutputDirectory(input, filesystem?)`.

- [ ] **Step 1: Write the path compatibility tests**

Use explicit Windows bases:

```ts
const config = parseAppConfig()
const appDataDir = resolve('E:\\Users\\Operador\\AppData\\Roaming')
const userDataDir = resolve('E:\\Users\\Operador\\AppData\\Roaming\\agente-cpi')

expect(resolveApplicationPaths({ appDataDir, userDataDir }, config.paths)).toMatchObject({
  rootDir: join(appDataDir, 'AgenteCPI'),
  browserProfileDir: join(appDataDir, 'AgenteCPI', 'browser-profile'),
  downloadsDir: join(appDataDir, 'AgenteCPI', 'downloads'),
  databaseFile: join(userDataDir, 'agente-cpi.sqlite'),
  preferredPdfDirectory: 'E:\\PDF-AGENTE-CPI'
})
```

Assert that no returned field contains `database/agent.db`. Assert that
`resolveIsolatedOperationalPaths(join(process.cwd(), 'data', 'runtime'), config.paths)` keeps the
smoke profile below the supplied root.

- [ ] **Step 2: Run path tests and verify RED**

Run:

```powershell
pnpm test -- tests/unit/infrastructure/filesystem/runtime-paths.test.ts
```

Expected: failure because the current resolver accepts one root and returns the unused
`database/agent.db`.

- [ ] **Step 3: Implement the explicit path model**

Use these interfaces:

```ts
export interface ApplicationPathBases {
  appDataDir: string
  userDataDir: string
}

export interface OperationalPaths {
  rootDir: string
  browserProfileDir: string
  downloadsDir: string
  screenshotsDir: string
  logsDir: string
  configDir: string
}

export interface ApplicationPaths extends OperationalPaths {
  databaseFile: string
  preferredPdfDirectory: string
}
```

`resolveOperationalPaths` must append only the configured operational folder to `appDataDir`.
`resolveApplicationPaths` must append only `databaseFileName` to `userDataDir`.
`resolveIsolatedOperationalPaths` must not append `AgenteCPI` to its already isolated root.
Reject blank base paths before calling `resolve`.

`ensureOperationalDirectories` creates only the six operational directories. It must not create a
second database directory.

- [ ] **Step 4: Write PDF fallback tests and verify RED**

Create an injected filesystem double:

```ts
const filesystem = {
  ensureWritableDirectory: vi.fn()
}

filesystem.ensureWritableDirectory
  .mockRejectedValueOnce(new Error('Unidade indisponível'))
  .mockResolvedValueOnce(undefined)

await expect(
  resolvePdfOutputDirectory(
    {
      preferredDirectory: 'E:\\PDF-AGENTE-CPI',
      fallbackDirectory: 'C:\\AppData\\AgenteCPI\\downloads'
    },
    filesystem
  )
).resolves.toBe('C:\\AppData\\AgenteCPI\\downloads')
```

Also cover preferred success and both locations failing with the fallback error preserved as the
final cause.

Run:

```powershell
pnpm test -- tests/unit/infrastructure/filesystem/pdf-output-directory-resolver.test.ts
```

Expected: failure because the resolver module does not exist.

- [ ] **Step 5: Implement the PDF resolver**

Use:

```ts
export interface WritableDirectoryFilesystem {
  ensureWritableDirectory(path: string): Promise<void>
}

export interface PdfOutputDirectories {
  preferredDirectory: string
  fallbackDirectory: string
}

export async function resolvePdfOutputDirectory(
  directories: PdfOutputDirectories,
  filesystem: WritableDirectoryFilesystem = nodeWritableDirectoryFilesystem
): Promise<string>
```

The Node implementation calls `mkdir(path, { recursive: true })` and `access(path, constants.W_OK)`.
Try preferred once, then fallback once. Do not delete, rename or probe with a real PDF.

```ts
const nodeWritableDirectoryFilesystem: WritableDirectoryFilesystem = {
  async ensureWritableDirectory(path): Promise<void> {
    await mkdir(path, {
      recursive: true
    })
    await access(path, constants.W_OK)
  }
}
```

- [ ] **Step 6: Keep the browser smoke test isolated**

Replace its old `resolveRuntimePaths` call with:

```ts
const config = parseAppConfig()
const runtimePaths = resolveIsolatedOperationalPaths(
  join(process.cwd(), 'data', 'runtime'),
  config.paths
)

await ensureOperationalDirectories(runtimePaths)
```

The script must not read `%APPDATA%`, `userData` or the production database.

- [ ] **Step 7: Run Task 2 verification**

Run:

```powershell
pnpm test -- `
  tests/unit/infrastructure/filesystem/runtime-paths.test.ts `
  tests/unit/infrastructure/filesystem/pdf-output-directory-resolver.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-download-controller.test.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
git diff --cached --name-only
```

Expected: all pass; staging is empty. Do not commit.

---

### Task 3: Inject platform, queue and browser configuration

**Files:**

- Modify: `src/automation/browser/platform-page-manager.ts`
- Delete: `src/automation/browser/platform-urls.ts`
- Modify: `src/automation/cpi/cpi-first-research-opener.ts`
- Modify: `src/automation/cpi/cpi-queue-availability.ts`
- Modify: `src/automation/cpi/cpi-queue-filter-controller.ts`
- Modify: `src/automation/cpi/cpi-queue-monitor.ts`
- Modify: `src/automation/deskdata/deskdata-inspection-page-preparer.ts`
- Modify: `src/automation/flow/continuous-research-runner.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/unit/automation/browser/platform-page-manager.test.ts`
- Delete: `tests/unit/automation/browser/platform-urls.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-queue-availability.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-queue-monitor.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-app-domain-migration.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-inspection-page-preparer.test.ts`
- Modify: `tests/unit/automation/flow/continuous-research-runner.test.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`
- Modify: `tests/support/architecture/layer-dependency-policy.ts`
- Modify: `tests/unit/architecture/layer-dependency-policy.test.ts`
- Modify: `docs/architecture/dependency-boundaries.md`

**Interfaces:**

- Consumes:
  - `AppConfig['platform']`;
  - active fields from `AppConfig['timing']`.
- Produces:
  - `PlatformUrls` local structural type;
  - `createContinuousResearchRunner(config)` from the existing runner module.
- Removes:
  - automation's transitional `zod` dependency;
  - `DEFAULT_PLATFORM_URLS`;
  - `CONTINUOUS_QUEUE_INTERVAL_MS`.

- [ ] **Step 1: Strengthen behavior tests before removing defaults**

Add assertions proving that explicit values are used:

```ts
const manager = new PlatformPageManager(
  {
    cpiQueueUrl: 'https://cpi.example.test/fila',
    deskDataPeopleUrl: 'https://deskdata.example.test/pessoas/'
  },
  45_000
)
```

In queue tests, pass `60_000` explicitly and assert the delay receives `60_000`.
In runner tests, assert `nextCheckInMs` remains `60_000`.

Run:

```powershell
pnpm test -- `
  tests/unit/automation/browser/platform-page-manager.test.ts `
  tests/unit/automation/cpi/cpi-queue-monitor.test.ts `
  tests/unit/automation/flow/continuous-research-runner.test.ts
```

Expected: GREEN characterization before ownership changes.

- [ ] **Step 2: Make production configuration explicit and verify RED**

Remove default-constructor use from the new test fixture:

```ts
expect(() => new PlatformPageManager(undefined as never, 45_000)).toThrow()
```

Add a composition-source assertion:

```ts
expect(runtimeSource).toContain('parseAppConfig()')
expect(runtimeSource).toContain('config.platform')
expect(runtimeSource).toContain('config.timing.queueCheckIntervalMs')
```

Run the focused tests. Expected: RED because the main runtime does not create or inject the
central configuration.

- [ ] **Step 3: Rewire the existing modules**

`PlatformPageManager` receives:

```ts
export interface PlatformUrls {
  cpiQueueUrl: string
  deskDataPeopleUrl: string
}

constructor(
  private readonly urls: PlatformUrls,
  private readonly navigationTimeoutMs: number
) {}
```

Use `navigationTimeoutMs` instead of `45_000`.

Keep queue-monitor's existing test seam, but remove its literal default:

```ts
constructor(
  refresher: CpiQueueRefresher,
  availabilitySource: CpiQueueAvailabilitySource,
  delay: CpiQueueDelay,
  intervalMs: number
)
```

Add an exported factory in the existing runner file so no new main-to-automation edge is created:

```ts
export interface ContinuousResearchRunnerConfig {
  queueCheckIntervalMs: number
  cpiSearchPollingIntervalMs: number
  actionTimeoutMs: number
  readTimeoutMs: number
  queueFilterSettleDelayMs: number
  cpiFrameSearchAttempts: number
}

export function createContinuousResearchRunner(
  config: ContinuousResearchRunnerConfig
): ContinuousResearchRunner
```

The factory builds current default dependencies with the supplied values. The class constructor
continues accepting explicit dependency doubles for tests.

Use these exact mappings in the browser/queue dependency factory:

| Consumer                     | Config fields                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `PlatformPageManager`        | `platform`, `platformPageNavigationTimeoutMs`                                                         |
| `CpiFirstResearchOpener`     | `cpiFrameSearchAttempts`, `cpiSearchPollingIntervalMs`, `actionTimeoutMs`                             |
| `CpiQueueFilterController`   | `cpiFrameSearchAttempts`, `cpiSearchPollingIntervalMs`, `actionTimeoutMs`, `queueFilterSettleDelayMs` |
| `CpiQueueAvailabilityReader` | `readTimeoutMs`                                                                                       |
| `CpiQueueMonitor`            | `queueCheckIntervalMs`                                                                                |

In `MainApplicationRuntime.initialize`, parse configuration once and pass its platform/timing
values. Resolve canonical application paths once:

```ts
const config = parseAppConfig()
const runtimePaths = resolveApplicationPaths(
  {
    appDataDir: app.getPath('appData'),
    userDataDir: app.getPath('userData')
  },
  config.paths
)

await ensureOperationalDirectories(runtimePaths)
```

Open `runtimePaths.databaseFile`; do not construct the SQLite path separately. Do not import
`app-config` from automation.

- [ ] **Step 4: Remove legacy platform configuration**

Delete `platform-urls.ts` and its superseded test after every consumer uses the infrastructure
configuration. Update `deskdata-app-domain-migration.test.ts` to compare the configured DeskData
URL, and require `DeskDataInspectionPagePreparer` to receive a configured page manager instead of
constructing an unconfigured default. Remove exact `zod` permission from automation in the
architecture policy and update its test:

```ts
expect(isExternalDependencyAllowed('automation', 'zod')).toBe(false)
expect(isExternalDependencyAllowed('infrastructure', 'zod')).toBe(true)
```

Update `dependency-boundaries.md` to close the transitional debt approved in Stage 3.

- [ ] **Step 5: Run Task 3 verification**

Run:

```powershell
pnpm test -- `
  tests/unit/infrastructure/config/app-config.test.ts `
  tests/unit/automation/browser/platform-page-manager.test.ts `
  tests/unit/automation/cpi/cpi-queue-monitor.test.ts `
  tests/unit/automation/flow/continuous-research-runner.test.ts `
  tests/unit/main/main-continuous-composition-guard.test.ts `
  tests/unit/architecture/layer-dependency-policy.test.ts `
  tests/architecture/layer-dependency-contract.test.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
git diff --cached --name-only
```

Expected: all pass; exactly the existing ten `main → automation` edges remain; automation no
longer imports Zod. Do not commit.

---

### Task 4: Inject active research-cycle and PDF configuration

**Files:**

- Modify: `src/automation/cpi/cpi-research-confirmed-save-controller.ts`
- Modify: `src/automation/cpi/cpi-research-identity-reader.ts`
- Modify: `src/automation/cpi/cpi-research-pdf-attachment-controller.ts`
- Modify: `src/automation/cpi/cpi-research-result-controller.ts`
- Modify: `src/automation/cpi/cpi-research-result-saver.ts`
- Modify: `src/automation/deskdata/deskdata-cpf-form-controller.ts`
- Modify: `src/automation/deskdata/deskdata-latest-pdf-locator.ts`
- Modify: `src/automation/deskdata/deskdata-next-search-controller.ts`
- Modify: `src/automation/deskdata/deskdata-pdf-download-controller.ts`
- Modify: `src/automation/deskdata/deskdata-result-ready-waiter.ts`
- Modify: `src/automation/deskdata/deskdata-search-result-page-resolver.ts`
- Modify: `src/automation/deskdata/deskdata-search-submit-controller.ts`
- Modify: `src/automation/flow/full-research-preparation-workflow.ts`
- Modify: `src/automation/flow/single-research-cycle.ts`
- Modify: `src/automation/flow/continuous-research-runner.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/unit/automation/cpi/cpi-research-confirmed-save-controller.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-research-identity-reader.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-research-pdf-attachment-controller.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-research-result-controller.test.ts`
- Modify: `tests/unit/automation/cpi/cpi-research-result-saver.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-cpf-form-controller.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-latest-pdf-locator.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-next-search-controller.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-pdf-download-controller.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-result-ready-waiter.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-search-result-page-resolver.test.ts`
- Modify: `tests/unit/automation/deskdata/deskdata-search-submit-controller.test.ts`
- Modify: `tests/unit/automation/flow/full-research-preparation-workflow.test.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle.test.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle-hooks.test.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle-historical-result.test.ts`
- Modify: `tests/unit/automation/flow/continuous-research-runner.test.ts`
- Modify: `tests/unit/automation/flow/continuous-research-runner-boundary.test.ts`

**Interfaces:**

- Consumes:
  - validated timing values;
  - resolved writable PDF output directory.
- Preserves:
  - every current timeout, polling interval and attempt count;
  - exact error messages and download state behavior.

- [ ] **Step 1: Characterize every active default**

Add or retain assertions for:

```ts
expect(config.timing).toMatchObject({
  navigationTimeoutMs: 30_000,
  actionTimeoutMs: 10_000,
  readTimeoutMs: 5_000,
  downloadStartTimeoutMs: 30_000,
  cpiSearchPollingIntervalMs: 250,
  deskDataFormPollingIntervalMs: 250,
  deskDataResultPollingIntervalMs: 500,
  deskDataHistoryNavigationIntervalMs: 250,
  queueFilterSettleDelayMs: 700,
  submitSettleDelayMs: 1_000,
  queueReturnDelayMs: 3_000
})

expect(config.limits).toEqual({
  cpiFrameSearchAttempts: 40,
  cpiIdentitySearchAttempts: 40,
  cpiAttachmentSearchAttempts: 40,
  cpiResultSearchAttempts: 40,
  cpiResultStabilizationAttempts: 3,
  deskDataFormReadyAttempts: 40,
  deskDataResultSearchAttempts: 180,
  deskDataHistoryNavigationAttempts: 120
})
```

For each controller, use injected values in the test and assert the Playwright double receives the
same value. Do not test private fields.

- [ ] **Step 2: Run the characterized suite**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/cpi/cpi-first-research-opener.test.ts `
  tests/unit/automation/cpi/cpi-queue-filter-controller.test.ts `
  tests/unit/automation/deskdata/deskdata-next-search-controller.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-download-controller.test.ts `
  tests/unit/automation/deskdata/deskdata-search-result-page-resolver.test.ts `
  tests/unit/automation/flow/single-research-cycle.test.ts
```

Expected: GREEN characterization.

- [ ] **Step 3: Add one runtime-options contract and verify RED**

Use a structural configuration passed through existing factories:

```ts
export interface ResearchCycleRuntimeConfig {
  navigationTimeoutMs: number
  actionTimeoutMs: number
  readTimeoutMs: number
  downloadStartTimeoutMs: number
  cpiSearchPollingIntervalMs: number
  deskDataFormPollingIntervalMs: number
  deskDataResultPollingIntervalMs: number
  deskDataHistoryNavigationIntervalMs: number
  submitSettleDelayMs: number
  queueReturnDelayMs: number
  cpiIdentitySearchAttempts: number
  cpiAttachmentSearchAttempts: number
  cpiResultSearchAttempts: number
  cpiResultStabilizationAttempts: number
  deskDataFormReadyAttempts: number
  deskDataResultSearchAttempts: number
  deskDataHistoryNavigationAttempts: number
  pdfOutputDirectory: string
}
```

Add a main composition assertion that `pdfOutputDirectory` comes from
`resolvePdfOutputDirectory`. Expected RED before implementation.

- [ ] **Step 4: Thread configuration through existing dependency factories**

Replace local fallback literals only where they are active production defaults. Preserve optional
test seams by requiring the factory to supply production values.

The full-research factory must build:

```ts
new DeskDataPdfDownloadController({
  outputDirectory: config.pdfOutputDirectory,
  downloadTimeoutMs: config.downloadStartTimeoutMs
})
```

`DeskDataLatestPdfLocator` must require the same explicit resolved directory:

```ts
new DeskDataLatestPdfLocator(config.pdfOutputDirectory)
```

Remove its local `E:\PDF-AGENTE-CPI` default. Operational retry and attachment scripts resolve
the same preferred/fallback directory before constructing the locator.

The next-search controller receives:

```ts
new DeskDataNextSearchController({
  peopleUrl: platform.deskDataPeopleUrl,
  formReadyAttempts: config.deskDataFormReadyAttempts,
  pollingIntervalMs: config.deskDataFormPollingIntervalMs,
  navigationTimeoutMs: config.navigationTimeoutMs,
  actionTimeoutMs: config.actionTimeoutMs,
  readTimeoutMs: config.readTimeoutMs
})
```

Wire the remaining modules with these exact mappings:

| Consumer                             | Config fields                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CpiResearchIdentityReader`          | `cpiIdentitySearchAttempts`, `cpiSearchPollingIntervalMs`, `readTimeoutMs`                                                                                                              |
| `CpiResearchPdfAttachmentController` | `cpiAttachmentSearchAttempts`, `cpiSearchPollingIntervalMs`                                                                                                                             |
| `CpiResearchResultController`        | `cpiResultSearchAttempts`, `cpiSearchPollingIntervalMs`, `cpiResultStabilizationAttempts`, `readTimeoutMs`                                                                              |
| `CpiResearchConfirmedSaveController` | `actionTimeoutMs`                                                                                                                                                                       |
| `CpiResearchResultSaver`             | `actionTimeoutMs`                                                                                                                                                                       |
| `DeskDataCpfFormController`          | `actionTimeoutMs`, `readTimeoutMs`                                                                                                                                                      |
| `DeskDataResultReadyWaiter`          | `deskDataResultSearchAttempts`, `deskDataResultPollingIntervalMs`                                                                                                                       |
| `DeskDataSearchResultPageResolver`   | `deskDataResultSearchAttempts`, `deskDataResultPollingIntervalMs`, `navigationTimeoutMs`, `deskDataHistoryNavigationAttempts`, `deskDataHistoryNavigationIntervalMs`, `actionTimeoutMs` |
| `DeskDataSearchSubmitController`     | `actionTimeoutMs`, `navigationTimeoutMs`, `submitSettleDelayMs`                                                                                                                         |
| `DefaultCpiQueueReturnController`    | `queueReturnDelayMs`                                                                                                                                                                    |

Do not centralize selectors, truncation lengths or business classifications.

- [ ] **Step 5: Resolve PDF output before creating the runner**

In the main composition root:

```ts
const pdfOutputDirectory = await resolvePdfOutputDirectory({
  preferredDirectory: runtimePaths.preferredPdfDirectory,
  fallbackDirectory: runtimePaths.downloadsDir
})
```

Pass the result into `createContinuousResearchRunner`. Do not modify historical records or scan
the old PDF directory.

- [ ] **Step 6: Run Task 4 verification**

Run the complete automation flow suite:

```powershell
pnpm test -- `
  tests/unit/automation/cpi `
  tests/unit/automation/deskdata `
  tests/unit/automation/flow `
  tests/unit/main/main-continuous-composition-guard.test.ts `
  tests/unit/infrastructure/filesystem/pdf-output-directory-resolver.test.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
git diff --cached --name-only
```

Expected: all current behavior tests pass with values supplied by configuration. Do not commit.

---

### Task 5: Share production-aligned configuration with operational scripts

**Files:**

- Create: `scripts/support/windows-operational-config.ts`
- Create: `tests/unit/scripts/windows-operational-config.test.ts`
- Modify:
  - `scripts/inspect-platform-sessions.ts`
  - `scripts/test-cpi-queue-controls.ts`
  - `scripts/test-cpi-continuous-monitor.ts`
  - `scripts/test-cpi-open-first-research.ts`
  - `scripts/inspect-cpi-first-research.ts`
  - `scripts/inspect-cpi-research-form.ts`
  - `scripts/inspect-cpi-queue.ts`
  - `scripts/inspect-deskdata-search.ts`
  - `scripts/inspect-deskdata-pdf-download.ts`
  - `scripts/prepare-next-deskdata-search.ts`
  - `scripts/inspect-cpi-pdf-attachment.ts`
  - `scripts/retry-cpi-save-with-latest-pdf.ts`
  - `scripts/save-cpi-research-result.ts`
  - `scripts/simulate-cpi-research-result.ts`
  - `scripts/test-cpi-to-deskdata-cpf.ts`
  - `scripts/test-cpi-to-deskdata-submit.ts`
  - `scripts/test-deskdata-approved-datasets.ts`
  - `scripts/run-full-supervised-research.ts`
  - `scripts/run-continuous-auto-research.ts`

**Interfaces:**

- Produces:
  - `resolveWindowsOperationalConfig(appData?: string)`.
- Preserves:
  - the exact production-aligned profile directory;
  - script behavior and safety prompts;
  - smoke-test isolation.

- [ ] **Step 1: Write helper tests and verify RED**

```ts
expect(resolveWindowsOperationalConfig('C:\\Users\\Operador\\AppData\\Roaming')).toMatchObject({
  paths: {
    browserProfileDir: 'C:\\Users\\Operador\\AppData\\Roaming\\AgenteCPI\\browser-profile'
  }
})

expect(() => resolveWindowsOperationalConfig(undefined)).toThrow(
  'APPDATA não está disponível no Windows'
)
```

Run:

```powershell
pnpm test -- tests/unit/scripts/windows-operational-config.test.ts
```

Expected: failure because the helper does not exist.

- [ ] **Step 2: Implement the script adapter**

```ts
export function resolveWindowsOperationalConfig(appData = process.env.APPDATA): {
  config: AppConfig
  paths: OperationalPaths
} {
  if (!appData?.trim()) {
    throw new Error('APPDATA não está disponível no Windows')
  }

  const config = parseAppConfig()

  return {
    config,
    paths: resolveOperationalPaths(appData, config.paths)
  }
}
```

The helper does not access Electron, the production database or a real profile during tests.

- [ ] **Step 3: Replace duplicated path construction**

In each listed script replace:

```ts
const appData = process.env.APPDATA
join(appData, 'AgenteCPI', 'browser-profile')
```

with:

```ts
const { config, paths } = resolveWindowsOperationalConfig()
const profilePath = paths.browserProfileDir
```

Pass `config.platform` and active timing values to the constructors modified in Tasks 3 and 4.
Scripts that create `DeskDataPdfDownloadController` or `DeskDataLatestPdfLocator` first call
`resolvePdfOutputDirectory` with `config.paths.preferredPdfDirectory` and `paths.downloadsDir`.
Do not change prompts, selectors, external actions or error messages.

- [ ] **Step 4: Prove parity and absence of duplication**

Run:

```powershell
pnpm test -- `
  tests/unit/scripts/windows-operational-config.test.ts `
  tests/unit/infrastructure/filesystem/runtime-paths.test.ts `
  tests/unit/infrastructure/config/app-config.test.ts
rg -n \"join\\(appData, 'AgenteCPI'|join\\(appData, \\\"AgenteCPI\\\"\" scripts
rg -n \"process\\.env\\.APPDATA\" scripts
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
```

Expected:

- tests and static gates pass;
- the first scan has no matches;
- only `scripts/support/windows-operational-config.ts` reads `process.env.APPDATA`;
- `browser-smoke-test.ts` remains isolated and does not import the Windows helper.

- [ ] **Step 5: Record the checkpoint**

Run:

```powershell
git diff -- scripts tests/unit/scripts
git diff --cached --name-only
```

Expected: mechanical composition changes only; staging is empty. Do not execute real platform
scripts and do not commit.

---

### Task 6: Add the generic synchronous SQLite migration runner

**Files:**

- Create: `src/infrastructure/database/sqlite-migration-runner.ts`
- Create: `tests/unit/infrastructure/database/sqlite-migration-runner.test.ts`

**Interfaces:**

- Produces:
  - `SqliteMigration`;
  - `SqliteMigrationPlan`;
  - `UnsupportedDatabaseVersionError`;
  - `runSqliteMigrations(database, plan): void`.

- [ ] **Step 1: Write runner contract tests**

Cover:

```ts
expect(database.pragma('user_version', { simple: true })).toBe(0)

runSqliteMigrations(database, {
  supportedVersion: 2,
  migrations: [
    { fromVersion: 0, toVersion: 1, migrate: (db) => db.exec('CREATE TABLE one (id TEXT)') },
    { fromVersion: 1, toVersion: 2, migrate: (db) => db.exec('CREATE TABLE two (id TEXT)') }
  ]
})

expect(database.pragma('user_version', { simple: true })).toBe(2)
```

Add tests for:

- duplicate or non-contiguous migration versions;
- database version `3` with supported version `2`;
- migration that creates a table and then throws, leaving no table and version unchanged;
- reopen at the supported version performing no migration.

- [ ] **Step 2: Run and verify RED**

Run:

```powershell
pnpm test -- tests/unit/infrastructure/database/sqlite-migration-runner.test.ts
```

Expected: failure because the runner module does not exist.

- [ ] **Step 3: Implement the runner**

Use:

```ts
export interface SqliteMigration {
  fromVersion: number
  toVersion: number
  migrate(database: SqliteDatabase): void
}

export interface SqliteMigrationPlan {
  supportedVersion: number
  migrations: readonly SqliteMigration[]
}

type SqliteDatabase = InstanceType<typeof Database>
```

Read versions with:

```ts
const currentVersion = database.pragma('user_version', {
  simple: true
}) as number
```

For each step:

```ts
database.transaction(() => {
  migration.migrate(database)
  database.pragma(`user_version = ${migration.toVersion}`)
})()
```

Validate the complete plan before executing the first transaction. Throw
`UnsupportedDatabaseVersionError(foundVersion, supportedVersion)` before selecting a migration
when the file is newer.

- [ ] **Step 4: Run Task 6 verification**

```powershell
pnpm test -- tests/unit/infrastructure/database/sqlite-migration-runner.test.ts
pnpm run typecheck
pnpm exec eslint src/infrastructure/database/sqlite-migration-runner.ts tests/unit/infrastructure/database/sqlite-migration-runner.test.ts --max-warnings 0
pnpm exec prettier --check src/infrastructure/database/sqlite-migration-runner.ts tests/unit/infrastructure/database/sqlite-migration-runner.test.ts
git diff --check
git diff --cached --name-only
```

Expected: all pass; staging is empty. Do not commit.

---

### Task 7: Adopt the current research-history schema as version 1

**Files:**

- Create: `src/infrastructure/database/research-history-schema.ts`
- Create: `src/infrastructure/database/research-history-migrations.ts`
- Modify: `src/infrastructure/database/research-history-repository.ts`
- Modify: `tests/fixtures/database/create-legacy-research-history-database.ts`
- Create: `tests/unit/infrastructure/database/research-history-migrations.test.ts`
- Modify: `tests/unit/infrastructure/database/research-history-repository.test.ts`

**Interfaces:**

- Produces:
  - `RESEARCH_HISTORY_SCHEMA_VERSION = 1`;
  - one schema SQL source;
  - required column/index metadata;
  - `runResearchHistoryMigrations(database): void`.
- Preserves:
  - every repository method and SQL query result;
  - the existing synthetic legacy record exactly.

- [ ] **Step 1: Extend the legacy fixture assertions**

After creating the existing version-0 fixture, assert before opening:

```ts
function readUserVersion(filePath: string): number {
  const database = new Database(filePath)

  try {
    return database.pragma('user_version', {
      simple: true
    }) as number
  } finally {
    database.close()
  }
}

expect(readUserVersion(databasePath)).toBe(0)
```

After `ResearchHistoryRepository.open(databasePath)`, assert:

```ts
const expectedLegacyRecord = {
  id: 'legacy-record-1',
  maskedCpf: '***.***.***-44',
  classification: 'CONSTA_RESTRICAO',
  cpiResult: 'Sim, Consta Restrições',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:30.000Z',
  durationMs: 90_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\legado.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

expect(readUserVersion(databasePath)).toBe(1)
expect(repository.list({ page: 1, pageSize: 50 }).items[0]).toEqual(expectedLegacyRecord)
```

Keep the masked value and `E:\PDF-AGENTE-CPI\legado.pdf` unchanged.

- [ ] **Step 2: Write migration-specific RED tests**

Cover:

- empty database creates the table and three indexes at version 1;
- exact version-0 schema with a synthetic row is adopted without value changes;
- version 1 reopen is idempotent;
- version 2 is refused and remains version 2;
- missing required column is refused and remains version 0;
- missing required index is refused and remains version 0;
- extra table, column and index are preserved.

Run:

```powershell
pnpm test -- tests/unit/infrastructure/database/research-history-migrations.test.ts
```

Expected: failure because schema and migration modules do not exist.

- [ ] **Step 3: Extract the single schema source**

Move the current `CREATE TABLE IF NOT EXISTS` and three `CREATE INDEX IF NOT EXISTS` statements
verbatim to `research-history-schema.ts`.

Export required metadata:

```ts
export const RESEARCH_HISTORY_SCHEMA_VERSION = 1 as const

export const REQUIRED_RESEARCH_HISTORY_COLUMNS = [
  'id',
  'masked_cpf',
  'classification',
  'cpi_result',
  'status',
  'started_at',
  'finished_at',
  'duration_ms',
  'pdf_path',
  'error_stage',
  'error_message',
  'created_at'
] as const

export const REQUIRED_RESEARCH_HISTORY_INDEXES = [
  'idx_research_history_started_at',
  'idx_research_history_status',
  'idx_research_history_classification'
] as const
```

Column compatibility validation also checks the current primary-key and not-null flags. Additional
schema objects are not removed. An additional column is compatible only when it is nullable or
has a default value, so unchanged repository inserts remain valid.

- [ ] **Step 4: Implement migration 0 → 1**

If `research_history` is absent, execute the schema SQL. If it exists, inspect `PRAGMA
table_info(research_history)` and `PRAGMA index_list(research_history)` and throw before setting
the version when required metadata is incompatible.

```ts
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

type SqliteDatabase = InstanceType<typeof Database>
```

Do not issue `INSERT`, `UPDATE`, `DELETE`, `ALTER TABLE`, table rebuild or index recreation for an
existing compatible table.

- [ ] **Step 5: Delegate migration from the repository**

Enable foreign keys before migration because that pragma is connection-local:

```ts
this.database.pragma('foreign_keys = ON')
runResearchHistoryMigrations(this.database)
this.database.pragma('journal_mode = WAL')
```

The migration runner inspects and rejects a future version before `journal_mode = WAL` is issued,
so refusal does not mutate the file. Replace the private embedded `migrate()` schema execution
with `runResearchHistoryMigrations(this.database)`. If opening or migration throws, close the
newly opened database before rethrowing.

Do not modify row mapping or CRUD SQL.

- [ ] **Step 6: Run Task 7 verification**

```powershell
pnpm test -- `
  tests/unit/infrastructure/database/sqlite-migration-runner.test.ts `
  tests/unit/infrastructure/database/research-history-migrations.test.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/automation/history/research-history-service.test.ts `
  tests/unit/main/ipc/register-history-ipc-handlers.test.ts `
  tests/unit/renderer/research-history-panel.test.tsx
pnpm run typecheck
pnpm run lint
pnpm run format:check
git diff --check
git diff --cached --name-only
```

Expected: schema versioning and all existing history behavior pass; staging is empty. Do not
commit.

---

### Task 8: Remove Drizzle and execute the complete Stage 4 gate

**Files:**

- Delete: `drizzle.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/unit/config/repository-artifact-hygiene.test.ts`
- Modify: `docs/architecture/repository-hygiene-inventory.md`
- Create: `docs/architecture/configuration-and-persistence.md`
- Review: every Stage 4 file changed in Tasks 1–7

**Interfaces:**

- Produces:
  - permanent Drizzle-absence contract;
  - Stage 4 operational documentation;
  - final automated evidence.

- [ ] **Step 1: Write the Drizzle-absence contract and verify RED**

Add:

```ts
expect(existsSync(resolve('drizzle.config.ts'))).toBe(false)
expect(packageJson.dependencies).not.toHaveProperty('drizzle-orm')
expect(packageJson.devDependencies).not.toHaveProperty('drizzle-kit')
expect(packageJson.scripts).not.toHaveProperty('db:generate')
expect(packageJson.scripts).not.toHaveProperty('db:studio')
expect(lockfileSource).not.toContain('drizzle-orm')
expect(lockfileSource).not.toContain('drizzle-kit')
```

Run:

```powershell
pnpm test -- tests/unit/config/repository-artifact-hygiene.test.ts
```

Expected: RED because Drizzle still exists.

- [ ] **Step 2: Remove Drizzle mechanically**

Run:

```powershell
pnpm remove drizzle-orm
pnpm remove drizzle-kit
```

Delete `drizzle.config.ts`. Remove only `db:generate` and `db:studio` if pnpm did not remove
scripts automatically. Do not edit unrelated dependency versions.

- [ ] **Step 3: Update permanent documentation**

`configuration-and-persistence.md` must record:

- canonical production and operational paths;
- preferred/fallback PDF behavior;
- schema version 1;
- version-0 adoption behavior;
- future-version refusal;
- rollback guarantees;
- the requirement for a validated backup before any future structural migration;
- Drizzle removal;
- commands for automated validation;
- the no-full-CPF fixture rule.

Update the hygiene inventory row from “Stage 4 persistence migration” to “removed in Stage 4 after
verified absence of runtime use.”

- [ ] **Step 4: Run targeted Stage 4 verification**

```powershell
pnpm test -- `
  tests/unit/infrastructure/config/app-config.test.ts `
  tests/unit/infrastructure/filesystem/runtime-paths.test.ts `
  tests/unit/infrastructure/filesystem/pdf-output-directory-resolver.test.ts `
  tests/unit/scripts/windows-operational-config.test.ts `
  tests/unit/infrastructure/database/sqlite-migration-runner.test.ts `
  tests/unit/infrastructure/database/research-history-migrations.test.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/config/repository-artifact-hygiene.test.ts `
  tests/architecture/layer-dependency-contract.test.ts
```

Expected: all pass.

- [ ] **Step 5: Run the complete automated gate**

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
git diff --cached --name-only
git rev-parse HEAD
```

Expected:

- all runtime and structural type tests pass;
- zero-warning ESLint and repository-wide Prettier pass;
- main, preload and renderer bundles pass;
- coverage is not below the Stage 3 checkpoint;
- staging is empty;
- HEAD is still `91902e7378ee94f90f714a8079b682477f4b0528`.

- [ ] **Step 6: Run privacy, compatibility and scope scans**

```powershell
$cpfBaselinePath = '.superpowers/sdd/2026-07-27-refactoring-stage-4-data-config-implementation-plan/stage-4-baseline-complete-cpf.txt'
$cpfBaseline = Get-Content -LiteralPath $cpfBaselinePath
$cpfCurrent = @(
  rg -o "\b\d{3}\.\d{3}\.\d{3}-\d{2}\b" src tests scripts docs/architecture |
    Sort-Object -Unique
)
$newCpfOccurrences = @(
  Compare-Object -ReferenceObject $cpfBaseline -DifferenceObject $cpfCurrent |
    Where-Object SideIndicator -eq '=>'
)
if ($newCpfOccurrences.Count -gt 0) {
  $newCpfOccurrences | Format-Table
  throw 'Stage 4 introduced a complete CPF occurrence'
}

Test-Path -LiteralPath 'drizzle.config.ts'
rg -n "drizzle|development\.db|database[/\\\\]agent\.db" `
  src scripts package.json pnpm-lock.yaml
rg -n "agente-cpi\.sqlite|browser-profile|PDF-AGENTE-CPI" `
  src tests scripts docs/architecture
rg -n "process\.env\.APPDATA" scripts
```

Expected:

- no complete CPF occurrence was added relative to the stored Stage 4 baseline;
- `drizzle.config.ts` is absent;
- no Drizzle or obsolete database path remains in supported code/configuration;
- canonical database/profile/PDF compatibility references remain;
- only the Windows script adapter reads `APPDATA`.

- [ ] **Step 7: Perform independent cumulative review**

The reviewer receives:

- the approved Stage 4 design;
- this plan;
- task reports;
- a cumulative working-tree diff containing every Stage 4 path;
- exact gate output.

The review must explicitly verify:

- no production database move;
- no historical row/PDF path rewrite;
- no profile/session reset;
- version-0 adoption and rollback honesty;
- future-version refusal;
- one active configuration source;
- smoke-test isolation;
- Drizzle absence;
- no renderer/preload/IPC behavior change;
- no full CPF;
- empty staging and unchanged HEAD.

Fix every Critical or Important finding through RED → GREEN and repeat review until clean.

- [ ] **Step 8: Stop for manual Windows validation**

Report:

- configuration ownership and values;
- canonical path proof;
- PDF preferred/fallback behavior;
- migration and compatibility evidence;
- Drizzle removal;
- test, typecheck, lint, format, build and coverage results;
- privacy and independent-review results;
- no commit or Stage 5 plan.

Do not proceed until the user manually tests the Windows application and explicitly approves
Stage 4.
