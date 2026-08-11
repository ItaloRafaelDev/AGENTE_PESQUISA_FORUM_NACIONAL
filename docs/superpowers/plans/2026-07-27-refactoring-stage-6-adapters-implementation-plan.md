# Stage 6 External Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every concrete browser, session, CPI, DeskData, PDF and Playwright workflow adapter behind the Stage 5 application ports, remove `src/automation`, and preserve the current Windows behavior exactly.

**Architecture:** Application use cases remain the sole owners of sequencing, state, history and cancellation. Playwright and PDF mechanics move to `src/infrastructure/automation`, `main` composes those implementations, and every temporary Stage 5 facade and dependency exception is removed after its consumers migrate.

**Tech Stack:** TypeScript 5, Node.js, Electron, Playwright, Vitest, `pdf-parse`, pnpm, Prettier and ESLint on Windows.

## Global Constraints

- Preserve exactly the current functional and visual behavior.
- Official support remains Windows only.
- Do not change IPC channels, shared DTOs, renderer output, SQLite schema, runtime paths, browser profile, cookies or session behavior.
- Preserve selector values and fallback order, timeout and polling values, messages, stages, retry counts and operation order.
- DeskData submit, CPI attachment and CPI save must not gain automatic replay.
- Pause and stop remain restricted to the Stage 5 safe checkpoints.
- Full CPF stays only in the active browser closures that require it; public state, history, logs, errors, tests and artifacts use masked or synthetic-safe values.
- Do not run operational scripts against CPI or DeskData as an automated gate.
- Use TDD for every behavioral or architectural change: prove RED, implement the minimum, then prove GREEN.
- Preserve unrelated Stage 1–5 working-tree changes, binding HEAD `0be5d3a226320e43d5230d5fb01a64ff9dc05f32` and an empty index.
- Do not stage, commit, merge, push or mutate a remote during Stage 6. Replace every skill-level commit checkpoint with a recorded uncommitted checkpoint.
- Stop and request a design decision if preserving behavior requires widening the approved scope or changing an application/IPC contract.

This remains one sequential plan because CPI, DeskData and PDF share the same cycle-scoped handles,
execution token and production workspace. Each task is independently reviewable, but the final
facade removal is safe only after all adapter families converge on that single graph.

## Target File Structure

```text
src/infrastructure/automation/
  browser/       # Chromium lifecycle, context and platform page resolution
  session/       # CPI and DeskData authentication evidence
  cpi/           # queue, form, attachment, result and save adapters
  deskdata/      # people search, datasets, result-page resolution
  pdf/           # download, extraction, parsing and report port
  workflow/      # Playwright implementations of application execution ports
```

The workflow boundary produces these concrete interfaces:

```ts
export class PlaywrightResearchQueueAdapter implements ResearchQueuePort
export class PlaywrightDeskDataResearchAdapter implements DeskDataResearchPort
export class DeskDataPdfReportAdapter implements ResearchReportPort
export class PlaywrightCpiPreparationAdapter implements CpiResearchPreparationPort
export class PlaywrightResearchPreparationAdapter implements ResearchPreparationPort
export class PlaywrightCpiResearchCycleAdapter implements CpiResearchCyclePort
export class PlaywrightDeskDataCycleAdapter implements DeskDataCyclePort
export class PlaywrightResearchCycleAdapter implements ResearchCyclePort
export class PlaywrightContinuousResearchExecutionAdapter
  implements ContinuousResearchExecutionPort
export class PlaywrightAgentWorkspaceAdapter implements AgentWorkspacePort
```

The implementation may retain narrow controller interfaces used for unit testing, but none may
duplicate application decisions or expose Playwright types through an application port.

---

### Task 1: Move browser and session adapters and shrink the temporary edge list

**Files:**

- Move: `src/automation/browser/browser-manager.ts` -> `src/infrastructure/automation/browser/browser-manager.ts`
- Move: `src/automation/browser/browser-types.ts` -> `src/infrastructure/automation/browser/browser-types.ts`
- Move: `src/automation/browser/browser-workspace-service.ts` -> `src/infrastructure/automation/browser/browser-workspace-service.ts`
- Move: `src/automation/browser/platform-page-manager.ts` -> `src/infrastructure/automation/browser/platform-page-manager.ts`
- Move: `src/automation/browser/playwright-browser-launcher.ts` -> `src/infrastructure/automation/browser/playwright-browser-launcher.ts`
- Move: `src/automation/session/platform-session-detector.ts` -> `src/infrastructure/automation/session/platform-session-detector.ts`
- Move: `src/automation/session/platform-session-service.ts` -> `src/infrastructure/automation/session/platform-session-service.ts`
- Move: `tests/unit/automation/browser/*.test.ts` -> `tests/unit/infrastructure/automation/browser/`
- Move: `tests/unit/automation/session/*.test.ts` -> `tests/unit/infrastructure/automation/session/`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`
- Create: `tests/architecture/external-adapter-location-contract.test.ts`

**Interfaces:**

- Consumes: unchanged `BrowserLauncher`, `BrowserManager`, `BrowserWorkspaceService`, `PlatformPageManager`, `PlatformSessionService` APIs.
- Produces: canonical infrastructure imports for browser/session and a temporary `main -> automation` list containing only CPI filter and workspace edges.

- [ ] **Step 1: Record the Stage 6 entry baseline**

Run:

```powershell
git rev-parse HEAD
git diff --cached --name-only
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/automation/browser tests/unit/automation/session tests/unit/main/main-continuous-composition-guard.test.ts tests/architecture/layer-dependency-contract.test.ts
```

Expected: binding HEAD, empty output for the index, and all selected tests passing. Record counts in
`.superpowers/sdd/2026-07-27-refactoring-stage-6-adapters-implementation-plan/task-1-report.md`.

- [ ] **Step 2: Write the failing location contract**

Create `tests/architecture/external-adapter-location-contract.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('localização dos adapters externos', () => {
  it('mantém browser e sessão na infraestrutura', () => {
    expect(existsSync('src/infrastructure/automation/browser/browser-manager.ts')).toBe(true)
    expect(existsSync('src/infrastructure/automation/session/platform-session-service.ts')).toBe(
      true
    )
    expect(existsSync('src/automation/browser')).toBe(false)
    expect(existsSync('src/automation/session')).toBe(false)
  })
})
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/architecture/external-adapter-location-contract.test.ts
```

Expected: FAIL because the infrastructure files do not exist and the old directories do.

- [ ] **Step 4: Move the files without changing their behavior**

Use exact `Move-Item -LiteralPath` operations for the seven source files and their tests. Update only
relative imports and aliases. The public classes and method signatures remain unchanged.

Update `src/main/main-application-runtime.ts` imports to:

```ts
import { BrowserManager } from '../infrastructure/automation/browser/browser-manager'
import { BrowserWorkspaceService } from '../infrastructure/automation/browser/browser-workspace-service'
import { PlatformPageManager } from '../infrastructure/automation/browser/platform-page-manager'
import { PlaywrightBrowserLauncher } from '../infrastructure/automation/browser/playwright-browser-launcher'
import { PlatformSessionService } from '../infrastructure/automation/session/platform-session-service'
```

Do not change constructor arguments, browser options, URLs or shutdown order.

- [ ] **Step 5: Shrink the architecture exception exactly**

Change `EXPECTED_MAIN_AUTOMATION_EDGES` to:

```ts
const EXPECTED_MAIN_AUTOMATION_EDGES = [
  'main/main-application-runtime.ts->automation/cpi/cpi-queue-filter-controller.ts',
  'main/main-application-runtime.ts->automation/workflow/playwright-agent-workspace-adapter.ts'
] as const
```

Rename the test description from “sete arestas” to “arestas temporárias restantes”. Do not widen
any other allowlist.

- [ ] **Step 6: Prove GREEN and run the related gate**

Run:

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/browser tests/unit/infrastructure/automation/session tests/unit/main/main-continuous-composition-guard.test.ts tests/architecture/external-adapter-location-contract.test.ts tests/architecture/layer-dependency-contract.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all pass with no type errors or whitespace errors.

- [ ] **Step 7: Record the uncommitted checkpoint**

Run `git status --short`, `git diff --cached --name-only`, and `git rev-parse HEAD`. Append exact
results and changed paths to the Task 1 report. The index must remain empty and HEAD unchanged.

---

### Task 2: Move CPI queue mechanics and implement `ResearchQueuePort`

**Files:**

- Create: `src/infrastructure/automation/cpi/cpi-selectors.ts`
- Move: `src/automation/cpi/cpi-queue-availability.ts` -> `src/infrastructure/automation/cpi/cpi-queue-availability.ts`
- Move: `src/automation/cpi/cpi-queue-filter-controller.ts` -> `src/infrastructure/automation/cpi/cpi-queue-filter-controller.ts`
- Move: `src/automation/cpi/cpi-queue-monitor.ts` -> `src/infrastructure/automation/cpi/cpi-queue-monitor.ts`
- Create: `src/infrastructure/automation/workflow/playwright-research-queue-adapter.ts`
- Move: queue-related tests from `tests/unit/automation/cpi/` -> `tests/unit/infrastructure/automation/cpi/`
- Create: `tests/unit/infrastructure/automation/workflow/playwright-research-queue-adapter.test.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`

**Interfaces:**

- Consumes: `ResearchQueuePort.waitForResearch({ token, onState })`, existing `CpiQueueMonitor.waitForResearch(page, options)` and unchanged `CpiQueueMonitorResult`.
- Produces: `PlaywrightResearchQueueAdapter implements ResearchQueuePort`; no remaining main import of the CPI filter from `automation`.

- [ ] **Step 1: Run the CPI queue characterization**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/automation/cpi/cpi-queue-availability.test.ts tests/unit/automation/cpi/cpi-queue-filter-controller.test.ts tests/unit/automation/cpi/cpi-queue-monitor.test.ts tests/unit/automation/cpi/cpi-queue-continuous-polling.test.ts tests/unit/automation/cpi/cpi-queue-selectors.test.ts
```

Expected: all pass; record the exact count before moving files.

- [ ] **Step 2: Write the failing queue-port test**

Create a test with a monitor stub returning each legacy result and assert the semantic projection:

```ts
it.each([
  ['HAS_RESEARCH', 'AVAILABLE'],
  ['EMPTY', 'EMPTY'],
  ['INDETERMINATE', 'CHECKING']
] as const)('maps %s to %s', async (legacyState, expectedState) => {
  const observed: string[] = []
  const token: ExecutionToken = {
    get directive() {
      return 'NONE'
    },
    get isCancellationRequested() {
      return false
    },
    subscribe: () => () => undefined
  }
  const queueMonitor: ContinuousQueueMonitorPort = {
    waitForResearch: vi.fn(async (_page, options) => {
      options.onState?.(legacyState, 1)
      return { status: 'RESEARCH_AVAILABLE', checks: 1 }
    })
  }
  const adapter = new PlaywrightResearchQueueAdapter(
    queueMonitor,
    {} as Page,
    new AbortController().signal
  )

  await adapter.waitForResearch({
    token,
    onState: (state) => observed.push(state)
  })

  expect(observed).toEqual([expectedState])
})
```

The test helper must provide a real readonly `ExecutionToken` stub and a monitor whose
`waitForResearch` matches the current technical signature.

- [ ] **Step 3: Verify RED**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/workflow/playwright-research-queue-adapter.test.ts
```

Expected: FAIL because `PlaywrightResearchQueueAdapter` does not exist.

- [ ] **Step 4: Centralize the existing queue selectors mechanically**

Move the current `CPI_QUEUE_SELECTORS` declaration byte-for-byte into `cpi-selectors.ts` and import
it from the filter controller. Preserve its named export so existing selector assertions require
only an import-path change. Do not merge it with research-form selectors yet.

- [ ] **Step 5: Implement the queue adapter minimally**

Create:

```ts
export class PlaywrightResearchQueueAdapter implements ResearchQueuePort {
  constructor(
    private readonly queueMonitor: ContinuousQueueMonitorPort,
    private readonly page: Page,
    private readonly signal: AbortSignal
  ) {}

  async waitForResearch(input: {
    token: ExecutionToken
    onState(state: 'CHECKING' | 'EMPTY' | 'AVAILABLE', checks: number): void
  }): Promise<{ status: 'AVAILABLE' | 'CANCELLED'; checks: number }> {
    const result = await this.queueMonitor.waitForResearch(this.page, {
      signal: this.signal,
      isPauseRequested: () => input.token.directive !== 'NONE',
      onState: (state, checks) =>
        input.onState(
          state === 'HAS_RESEARCH' ? 'AVAILABLE' : state === 'EMPTY' ? 'EMPTY' : 'CHECKING',
          checks
        )
    })

    return {
      status: result.status === 'RESEARCH_AVAILABLE' ? 'AVAILABLE' : 'CANCELLED',
      checks: result.checks
    }
  }
}
```

Move the three CPI queue source files and related tests, then update imports.

- [ ] **Step 6: Remove the CPI main edge**

Import `CpiQueueFilterController` from infrastructure in `main-application-runtime.ts`. Change
`EXPECTED_MAIN_AUTOMATION_EDGES` to contain only:

```ts
'main/main-application-runtime.ts->automation/workflow/playwright-agent-workspace-adapter.ts'
```

- [ ] **Step 7: Run GREEN and related tests**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/cpi/cpi-queue-availability.test.ts tests/unit/infrastructure/automation/cpi/cpi-queue-filter-controller.test.ts tests/unit/infrastructure/automation/cpi/cpi-queue-monitor.test.ts tests/unit/infrastructure/automation/cpi/cpi-queue-continuous-polling.test.ts tests/unit/infrastructure/automation/cpi/cpi-queue-selectors.test.ts tests/unit/infrastructure/automation/workflow/playwright-research-queue-adapter.test.ts tests/architecture/layer-dependency-contract.test.ts tests/unit/main/main-continuous-composition-guard.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all pass. Record HEAD/index invariants and exact counts without committing.

---

### Task 3: Move CPI research controls and centralize CPI selector ownership

**Files:**

- Move: all remaining `src/automation/cpi/*.ts` -> `src/infrastructure/automation/cpi/`
- Move: all remaining `tests/unit/automation/cpi/*.test.ts` -> `tests/unit/infrastructure/automation/cpi/`
- Modify: `src/infrastructure/automation/cpi/cpi-selectors.ts`
- Modify: CPI controllers that currently declare selector constants
- Create: `tests/unit/infrastructure/automation/cpi/cpi-selector-ownership.test.ts`

**Interfaces:**

- Consumes: unchanged CPI opener, identity reader, result preparation, attachment and save controller APIs.
- Produces: one CPI selector module and behaviorally identical low-level infrastructure controllers for Task 7.

- [ ] **Step 1: Run the complete remaining CPI baseline**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/automation/cpi
```

Expected: all legacy CPI tests pass. Exclude already moved queue tests only if Vitest reports the
old directory as absent.

- [ ] **Step 2: Write the selector-ownership RED test**

Create a source contract that lists every controller with a selector declaration today and asserts
that the declaration exists only in `cpi-selectors.ts`:

```ts
const CPI_ROOT = resolve('src/infrastructure/automation/cpi')
const controllerSources = [
  'cpi-first-research-opener.ts',
  'cpi-queue-filter-controller.ts',
  'cpi-research-identity-reader.ts',
  'cpi-research-pdf-attachment-controller.ts'
].map((file) => readFileSync(resolve(CPI_ROOT, file), 'utf8'))

expect(controllerSources.join('\n')).not.toMatch(/export const CPI_.*SELECTOR/)
expect(readFileSync(resolve(CPI_ROOT, 'cpi-selectors.ts'), 'utf8')).toContain(
  'CPI_RESEARCH_PDF_UPLOAD_SELECTOR'
)
```

- [ ] **Step 3: Verify RED**

Run the new test. Expected: FAIL because selector declarations are still distributed.

- [ ] **Step 4: Move source and test files mechanically**

Move each remaining CPI file with `Move-Item -LiteralPath`. Preserve exported class/function/type
names. Update only imports required by the new location.

- [ ] **Step 5: Centralize selectors without changing literals**

Move these existing declarations into `cpi-selectors.ts`:

```ts
CPI_QUEUE_SELECTORS
CPI_RESEARCH_SELECTORS
CPI_RESEARCH_DATA_SELECTORS
CPI_RESEARCH_PDF_UPLOAD_SELECTOR
```

Controllers import them from `./cpi-selectors`. Existing tests continue to assert the exact literal
values and fallback ordering. Keep classification parsing, save confirmation and CPI result mapping
in infrastructure because they translate external CPI formats.

- [ ] **Step 6: Run CPI GREEN and privacy checks**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/cpi
pnpm run typecheck:node
rg -n --pcre2 '\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b' src/infrastructure/automation/cpi tests/unit/infrastructure/automation/cpi
git diff --check
```

Expected: tests and typecheck pass; CPF matches are absent or explicitly synthetic-safe fixtures
already adjudicated by a test. Record results without staging.

---

### Task 4: Move DeskData browser adapters and centralize DeskData selectors

**Files:**

- Create: `src/infrastructure/automation/deskdata/deskdata-selectors.ts`
- Move: non-PDF `src/automation/deskdata/*.ts` -> `src/infrastructure/automation/deskdata/`
- Move: `src/automation/deskdata/deskdata-pdf-download-controller.ts` -> `src/infrastructure/automation/pdf/deskdata-pdf-download-controller.ts`
- Move: matching unit/integration tests -> `tests/unit/infrastructure/automation/deskdata/` and `tests/integration/infrastructure/automation/deskdata/`
- Move: `tests/unit/automation/deskdata/deskdata-pdf-download-controller.test.ts` -> `tests/unit/infrastructure/automation/pdf/deskdata-pdf-download-controller.test.ts`
- Create: `tests/unit/infrastructure/automation/deskdata/deskdata-selector-ownership.test.ts`

**Interfaces:**

- Consumes: existing CPF form, dataset, next-search, submit, result-ready and result-page resolver APIs.
- Produces: low-level DeskData infrastructure controllers and one selector catalog for Tasks 5–7.

- [ ] **Step 1: Run DeskData characterization before moving files**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/automation/deskdata tests/integration/automation/deskdata
```

Expected: all current DeskData tests pass.

- [ ] **Step 2: Write the selector-ownership RED test**

Assert that controller source files do not declare the following constants after migration and the
catalog does:

```ts
const selectorSource = readFileSync(
  resolve('src/infrastructure/automation/deskdata/deskdata-selectors.ts'),
  'utf8'
)
const expectedCatalogExports = [
  'DESKDATA_SEARCH_SELECTORS',
  'DESKDATA_DATASET_SELECTORS',
  'DESKDATA_NEXT_SEARCH_SELECTORS',
  'DESKDATA_SUBMIT_SELECTORS',
  'DESKDATA_SIMILAR_QUERY_SELECTORS',
  'DESKDATA_PDF_EXPORT_SELECTOR'
]

for (const exportName of expectedCatalogExports) {
  expect(selectorSource).toContain(`export const ${exportName}`)
}
```

Expected RED: the catalog does not exist.

- [ ] **Step 3: Move the browser-facing DeskData files**

Move CPF form, dataset, inspection page preparer, next search, result ready, result-page resolver
and submit controller first. Move the browser-facing PDF download controller to the PDF directory;
keep extraction/parsing/reader files for Task 5. Move the
classification formatter, inspection classifier, result analyzer and inspector with DeskData
because they interpret DeskData external output before canonical domain classification.

- [ ] **Step 4: Centralize exact selector declarations**

Move each existing selector constant to `deskdata-selectors.ts`, preserving its value and property
order. Re-export named constants only from the catalog and update controllers/tests to import the
catalog directly. Do not create a catch-all selector string or merge direct-result and
similar-query fallbacks.

- [ ] **Step 5: Prove DeskData GREEN**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/deskdata tests/unit/infrastructure/automation/pdf/deskdata-pdf-download-controller.test.ts tests/integration/infrastructure/automation/deskdata
pnpm run typecheck:node
git diff --check
```

Expected: exact behavior tests pass, including navbar fallback and direct-versus-historical result
selection. Record HEAD/index invariants.

---

### Task 5: Move the PDF pipeline and implement `ResearchReportPort`

**Files:**

- Move: `src/automation/deskdata/deskdata-pdf-process-parser.ts` -> `src/infrastructure/automation/pdf/deskdata-pdf-process-parser.ts`
- Move: `src/automation/deskdata/deskdata-pdf-process-reader.ts` -> `src/infrastructure/automation/pdf/deskdata-pdf-process-reader.ts`
- Move: `src/automation/deskdata/deskdata-pdf-text-extractor.ts` -> `src/infrastructure/automation/pdf/deskdata-pdf-text-extractor.ts`
- Move: `src/automation/deskdata/deskdata-pdf-text-snapshot.ts` -> `src/infrastructure/automation/pdf/deskdata-pdf-text-snapshot.ts`
- Move: `src/automation/deskdata/deskdata-latest-pdf-locator.ts` -> `src/infrastructure/automation/pdf/deskdata-latest-pdf-locator.ts`
- Create: `src/infrastructure/automation/pdf/deskdata-pdf-report-adapter.ts`
- Move: matching remaining PDF tests -> `tests/unit/infrastructure/automation/pdf/`
- Create: `tests/unit/infrastructure/automation/pdf/deskdata-pdf-report-adapter.test.ts`

**Interfaces:**

- Consumes: `ResearchReportPort`, `DeskDataPdfDownloadController.downloadOnce`, `DeskDataPdfProcessReader.read`, bound `BrowserContext` and a result-page provider.
- Produces: `DeskDataPdfReportAdapter implements ResearchReportPort`, preserving `reference === compatibilityPath === filePath` and `sizeBytes`.

- [ ] **Step 1: Run the current PDF characterization**

Run the five remaining reader/parser/extractor/locator tests from their old location together with
the download-controller test moved in Task 4. Expected: all pass, including error codes,
file-size behavior and download timing.

- [ ] **Step 2: Write the report adapter RED test**

```ts
it('downloads once and preserves the compatibility path', async () => {
  const downloadOnce = vi
    .fn()
    .mockResolvedValue({ filePath: 'C:\\safe\\report.pdf', sizeBytes: 42 })
  const read = vi.fn().mockResolvedValue([])
  const adapter = new DeskDataPdfReportAdapter(
    {} as BrowserContext,
    () => ({}) as Page,
    { downloadOnce },
    { read }
  )

  await expect(adapter.create()).resolves.toEqual({
    reference: 'C:\\safe\\report.pdf',
    compatibilityPath: 'C:\\safe\\report.pdf',
    sizeBytes: 42
  })
  await expect(adapter.readProcesses('C:\\safe\\report.pdf')).resolves.toEqual([])
  expect(downloadOnce).toHaveBeenCalledTimes(1)
  expect(read).toHaveBeenCalledWith('C:\\safe\\report.pdf')
})
```

Expected RED: adapter module missing.

- [ ] **Step 3: Move the PDF modules and tests**

Preserve error classes, error codes, `pdf-parse` usage and physical path handling. Reuse the download
controller and its already-characterized event timing from Task 4. Import
`DESKDATA_PDF_EXPORT_SELECTOR` from the DeskData selector catalog.

- [ ] **Step 4: Implement the report adapter**

Use a bound result-page provider so the application port does not expose `Page`:

```ts
export class DeskDataPdfReportAdapter implements ResearchReportPort {
  constructor(
    private readonly context: BrowserContext,
    private readonly resultPage: () => Page,
    private readonly downloader: Pick<DeskDataPdfDownloadController, 'downloadOnce'>,
    private readonly reader: Pick<DeskDataPdfProcessReader, 'read'>
  ) {}

  async create(): Promise<ReportArtifact> {
    const pdf = await this.downloader.downloadOnce(this.context, this.resultPage())
    return { reference: pdf.filePath, compatibilityPath: pdf.filePath, sizeBytes: pdf.sizeBytes }
  }

  readProcesses(reference: string): Promise<readonly DeskDataProcessRecord[]> {
    return this.reader.read(reference)
  }
}
```

The provider must throw the existing safe message when DeskData result resolution has not occurred.

- [ ] **Step 5: Prove PDF GREEN and resource cleanup**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/pdf
pnpm run typecheck:node
git diff --check
```

Expected: all pass, download called once, reader receives only the logical reference, and existing
download listener cleanup assertions remain green.

---

### Task 6: Implement DeskData and CPI preparation adapters

**Files:**

- Create: `src/infrastructure/automation/workflow/playwright-research-preparation-state.ts`
- Create: `src/infrastructure/automation/workflow/playwright-automation-config.ts`
- Create: `src/infrastructure/automation/workflow/playwright-deskdata-research-adapter.ts`
- Create: `src/infrastructure/automation/workflow/playwright-cpi-preparation-adapter.ts`
- Create: `src/infrastructure/automation/workflow/playwright-research-preparation-adapter.ts`
- Create: `tests/unit/infrastructure/automation/workflow/playwright-research-preparation-adapter.test.ts`
- Modify: imports in moved CPI/DeskData/PDF modules as required

**Interfaces:**

- Consumes: `DeskDataResearchPort`, `CpiResearchPreparationPort`, `ResearchReportPort`, `PrepareResearch`, bound Playwright handles and the exact Stage 5 runtime config values.
- Produces: `PlaywrightResearchPreparationAdapter implements ResearchPreparationPort` and a private compatibility state used only for post-save page cleanup.

The task also produces this script/composition factory without a legacy method surface:

```ts
export function createPlaywrightResearchPreparationAdapter(input: {
  context: BrowserContext
  deskDataPage: Page
  detailFrame: CpiResearchPdfPreparationFrame
  config: PlaywrightAutomationConfig
}): PlaywrightResearchPreparationAdapter
```

- [ ] **Step 1: Write the preparation-sequence RED test**

```ts
it('delegates the exact preparation order through semantic ports', async () => {
  const calls: string[] = []
  const submitOnce = vi.fn(async () => void calls.push('submit'))
  const createReport = vi.fn(async () => {
    calls.push('report')
    return { reference: 'report-1', compatibilityPath: 'C:\\safe\\report.pdf', sizeBytes: 42 }
  })
  const prepareAndAttach = vi.fn(async () => {
    calls.push('attach')
    return { attached: true, requiredFieldsConfirmed: true }
  })
  const deskData: DeskDataResearchPort = {
    fillCpf: async () => void calls.push('fillCpf'),
    applyApprovedDatasets: async () => {
      calls.push('datasets')
      return { selectedCount: 3 }
    },
    submitOnce,
    waitUntilResultReady: async () => void calls.push('ready')
  }
  const report: ResearchReportPort = {
    create: createReport,
    readProcesses: async () => {
      calls.push('read')
      return []
    }
  }
  const cpi: CpiResearchPreparationPort = {
    prepareAndAttach
  }
  const adapter = new PlaywrightResearchPreparationAdapter(deskData, report, cpi)

  const result = await adapter.execute({ cpf: '00000000000', maskedCpf: '***.***.***-00' })

  expect(calls).toEqual(['fillCpf', 'datasets', 'submit', 'ready', 'report', 'read', 'attach'])
  expect(submitOnce).toHaveBeenCalledTimes(1)
  expect(createReport).toHaveBeenCalledTimes(1)
  expect(prepareAndAttach).toHaveBeenCalledTimes(1)
  expect(result).toMatchObject({
    maskedCpf: '***.***.***-00',
    selectedDatasetCount: 3,
    report: { reference: 'report-1', compatibilityPath: 'C:\\safe\\report.pdf', sizeBytes: 42 },
    attachmentConfirmed: true,
    requiredFieldsConfirmed: true
  })
})
```

- [ ] **Step 2: Verify RED**

Run the new test. Expected: FAIL because the three adapters and preparation state do not exist.

- [ ] **Step 3: Implement the private preparation state**

The state may retain only active technical compatibility handles:

```ts
export interface PlaywrightResolvedDeskDataResult {
  resultPage: Page
  closeResultPageAfterSave: boolean
}

export class PlaywrightResearchPreparationState {
  private resolvedResult: PlaywrightResolvedDeskDataResult | null = null

  setResolvedResult(value: PlaywrightResolvedDeskDataResult): void {
    this.resolvedResult = value
  }

  requireResolvedResult(): PlaywrightResolvedDeskDataResult {
    if (!this.resolvedResult) {
      throw new Error('O resultado da DeskData não foi resolvido para gerar o relatório.')
    }
    return this.resolvedResult
  }
}
```

Do not store full CPF in this state.

- [ ] **Step 4: Extract the canonical Playwright config without changing fields**

Create `PlaywrightAutomationConfig` with these exact `ContinuousResearchRunnerConfig` fields:

```ts
export interface PlaywrightAutomationConfig {
  queueCheckIntervalMs: number
  cpiSearchPollingIntervalMs: number
  actionTimeoutMs: number
  readTimeoutMs: number
  queueFilterSettleDelayMs: number
  cpiFrameSearchAttempts: number
  deskDataPeopleUrl: string
  navigationTimeoutMs: number
  downloadStartTimeoutMs: number
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

The legacy runner temporarily retains its own identical interface until Task 8 removes it; do not
create an `automation -> infrastructure` compatibility import. Do not change main's values.

- [ ] **Step 5: Implement `PlaywrightDeskDataResearchAdapter`**

It binds `Page`, identity and controllers, implements the four `DeskDataResearchPort` methods, and
stores the resolved result page only in the private compatibility state. Preserve the resolver call
with the active full CPF and do not emit that CPF through hooks or errors.

- [ ] **Step 6: Implement `PlaywrightCpiPreparationAdapter`**

It binds the CPI detail frame and delegates exactly once to
`CpiResearchPdfPreparationWorkflow.prepareWithAttachment`. Return only:

```ts
{
  attached: result.attachment.attached,
  requiredFieldsConfirmed: Boolean(result.prepared)
}
```

- [ ] **Step 7: Implement the preparation facade as a real application-port adapter**

```ts
export class PlaywrightResearchPreparationAdapter implements ResearchPreparationPort {
  constructor(
    private readonly deskData: DeskDataResearchPort,
    private readonly report: ResearchReportPort,
    private readonly cpi: CpiResearchPreparationPort
  ) {}

  execute(identity: ResearchIdentity): Promise<PreparedResearch> {
    return new PrepareResearch({
      deskData: this.deskData,
      report: this.report,
      cpi: this.cpi
    }).execute(identity)
  }
}
```

Construction helpers may build the low-level controllers from config, but may not add orchestration.

- [ ] **Step 8: Run focused and related GREEN gates**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/workflow/playwright-research-preparation-adapter.test.ts tests/unit/application/research/prepare-research.test.ts tests/unit/infrastructure/automation/deskdata tests/unit/infrastructure/automation/pdf tests/unit/infrastructure/automation/cpi
pnpm run test:typecheck
pnpm run typecheck:node
git diff --check
```

Expected: all pass with no raw CPF in failures or snapshots. Record results without committing.

---

### Task 7: Implement the Playwright research-cycle adapters

**Files:**

- Create: `src/infrastructure/automation/workflow/playwright-research-cycle-state.ts`
- Create: `src/infrastructure/automation/workflow/playwright-cpi-research-cycle-adapter.ts`
- Create: `src/infrastructure/automation/workflow/playwright-deskdata-cycle-adapter.ts`
- Create: `src/infrastructure/automation/workflow/playwright-research-cycle-adapter.ts`
- Create: `tests/unit/infrastructure/automation/workflow/playwright-research-cycle-adapter.test.ts`
- Modify: `tests/unit/automation/flow/automatic-save-guard.test.ts`

**Interfaces:**

- Consumes: `CpiResearchCyclePort`, `DeskDataCyclePort`, `ResearchPreparationPort`, `RunResearchCycle`, current CPI/DeskData controllers and `ExecutionToken`.
- Produces: `PlaywrightResearchCycleAdapter implements ResearchCyclePort`, with application-owned sequencing and technical state scoped to one cycle.

- [ ] **Step 1: Write RED tests for cycle sequence and non-idempotent calls**

Cover the existing stage sequence and assert:

```ts
expect(openNext).toHaveBeenCalledTimes(1)
expect(readIdentity).toHaveBeenCalledTimes(1)
expect(preparation.execute).toHaveBeenCalledTimes(1)
expect(saveOnce).toHaveBeenCalledTimes(1)
expect(returnToQueue).toHaveBeenCalledTimes(1)
```

Add a failure case proving save is not called when preparation fails and a cleanup case proving the
historical DeskData result page closes only after confirmed save.

- [ ] **Step 2: Verify RED**

Run the new cycle test. Expected: FAIL because `PlaywrightResearchCycleAdapter` is absent.

- [ ] **Step 3: Implement cycle-scoped technical state**

Store only CPI detail-frame identity and preparation compatibility required by adapters. Provide
`setDetailFrame`, `requireDetailFrame`, `setPreparation` and `requirePreparation`. Do not store
public lifecycle state, history or a second execution control.

- [ ] **Step 4: Implement CPI and DeskData semantic adapters**

`PlaywrightCpiResearchCycleAdapter` delegates `openNext`, `readIdentity`, `saveOnce` and
`returnToQueue`. `PlaywrightDeskDataCycleAdapter` delegates `prepareNextSearch` and closes the
historical result page only when `closeResultPageAfterSave` is true, never closing the main page.

- [ ] **Step 5: Implement `PlaywrightResearchCycleAdapter`**

```ts
export class PlaywrightResearchCycleAdapter implements ResearchCyclePort {
  constructor(private readonly dependencies: RunResearchCycleDependencies) {}

  async execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult> {
    try {
      return await new RunResearchCycle(this.dependencies).execute(input)
    } catch (error: unknown) {
      if (error instanceof ApplicationError && error.stage && error.stage !== 'CONTINUOUS_RUNNER') {
        throw ContinuousResearchStageError.fromPublicMessage(error.stage, error.message)
      }
      throw error
    }
  }
}
```

Keep the current safe public-message boundary. Technical causes must not be rewrapped as public.

- [ ] **Step 6: Update the automatic-save guard**

Change its source assertion from the legacy facade to the new CPI/cycle adapter and keep the same
semantic assertions: one call site for save and stage/confirmation ownership in application.

- [ ] **Step 7: Run cycle GREEN and regression gates**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/workflow/playwright-research-cycle-adapter.test.ts tests/unit/application/research/run-research-cycle.test.ts tests/unit/automation/flow/automatic-save-guard.test.ts tests/unit/automation/flow/single-research-cycle.test.ts tests/unit/automation/flow/single-research-cycle-hooks.test.ts tests/unit/automation/flow/single-research-cycle-historical-result.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all pass. Legacy facade tests remain temporarily until Task 9 proves equivalent coverage.

---

### Task 8: Replace the legacy runner with the continuous execution and workspace adapters

**Files:**

- Modify: `src/infrastructure/automation/workflow/playwright-automation-config.ts`
- Create: `src/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter.ts`
- Move/replace: `src/automation/workflow/playwright-agent-workspace-adapter.ts` -> `src/infrastructure/automation/workflow/playwright-agent-workspace-adapter.ts`
- Remove after parity: `src/automation/flow/continuous-research-runner.ts`
- Create: `tests/unit/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter.test.ts`
- Move/replace: workspace adapter tests under `tests/unit/infrastructure/automation/workflow/`
- Move/replace: runner boundary/safety tests under `tests/unit/infrastructure/automation/workflow/`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`

**Interfaces:**

- Consumes: `RunContinuousResearch`, `PlaywrightResearchQueueAdapter`, `PlaywrightResearchCycleAdapter`, `ExecutionToken` and unchanged Stage 5 workspace behavior.
- Produces: the only active `ContinuousResearchExecutionPort` and `AgentWorkspacePort`; zero `main -> automation` edges.

The task also produces this factory for `main` and the supervised scripts:

```ts
export function createPlaywrightContinuousResearchExecutionAdapter(input: {
  context: BrowserContext
  cpiPage: Page
  deskDataPage: Page
  config: PlaywrightAutomationConfig
}): PlaywrightContinuousResearchExecutionAdapter
```

- [ ] **Step 1: Write RED tests for the active execution boundary**

Cover:

```ts
expect(receivedCycleToken).toBe(input.token)
expect(abortListenerCountAfterExecute).toBe(0)
expect(unsubscribe).toHaveBeenCalledTimes(1)
expect(executeResult).toEqual({ status: 'STOPPED_BY_REQUEST', completedCycles: 0 })
```

Also preserve the current rule that abort masks only recognized `AbortError`/`ABORT_ERR`; technical
errors remain failures even when a directive exists.

- [ ] **Step 2: Verify RED**

Run the new execution test. Expected: FAIL because the new execution adapter is absent.

- [ ] **Step 3: Prove and adopt the canonical Playwright config**

Compare the temporary legacy runner interface to `PlaywrightAutomationConfig` from Task 6. The
field set must be exactly:

```ts
queueCheckIntervalMs
cpiSearchPollingIntervalMs
actionTimeoutMs
readTimeoutMs
queueFilterSettleDelayMs
cpiFrameSearchAttempts
deskDataPeopleUrl
navigationTimeoutMs
downloadStartTimeoutMs
deskDataFormPollingIntervalMs
deskDataResultPollingIntervalMs
deskDataHistoryNavigationIntervalMs
submitSettleDelayMs
queueReturnDelayMs
cpiIdentitySearchAttempts
cpiAttachmentSearchAttempts
cpiResultSearchAttempts
cpiResultStabilizationAttempts
deskDataFormReadyAttempts
deskDataResultSearchAttempts
deskDataHistoryNavigationAttempts
pdfOutputDirectory
```

Update workspace/main imports to the canonical interface. Remove the legacy runner only after the
new execution tests cover its state mapping, cancellation, cycle factory and listener cleanup.

- [ ] **Step 4: Implement continuous execution directly over the application use case**

Bind context/pages/config in the constructor. In `execute(input: ContinuousResearchInput)`, create
one local `AbortController`, subscribe once to the canonical token, instantiate
`RunContinuousResearch` with the queue adapter and cycle factory, then unsubscribe in `finally`.
Copy the recognized-abort translation and `cycleActive` safe-checkpoint behavior exactly from the
Stage 5 workspace boundary. Do not instantiate `ExecutionControl`.

- [ ] **Step 5: Move and simplify the workspace adapter**

`PlaywrightAgentWorkspaceAdapter implements AgentWorkspacePort` must:

1. call `browser.ensureStarted()`;
2. return `sessions.getSnapshot().allAuthenticated`;
3. resolve the same CPI queue and DeskData pages;
4. apply the same CPI criminal-forum filter;
5. return one `PlaywrightContinuousResearchExecutionAdapter`.

Remove `createLegacyAgentWorkspaceBridge` and the runner factory seam after consumers migrate.

- [ ] **Step 6: Recompose main without automation imports**

Import all concrete browser/session/CPI/workspace classes from
`../infrastructure/automation/...`. Keep the config object field-for-field identical and preserve
the single coordinator instance and shutdown order.

Update the composition guard to assert:

```ts
expect(runtimeSource).toContain("from '../infrastructure/automation/")
expect(runtimeSource).not.toContain("from '../automation/")
expect(runtimeSource).toContain('new PlaywrightAgentWorkspaceAdapter(')
expect(runtimeSource).not.toContain('createContinuousResearchRunner')
```

- [ ] **Step 7: Remove the main/automation allowlist**

Delete `EXPECTED_MAIN_AUTOMATION_EDGES` and `ALLOWED_MAIN_AUTOMATION_EDGES`. Add:

```ts
it('não permite dependências do processo principal para automation', () => {
  expect(
    dependencies.filter(
      ({ sourceLayer, targetLayer }) => sourceLayer === 'main' && targetLayer === 'automation'
    )
  ).toEqual([])
})
```

The generic direction test must no longer contain a main-to-automation exception.

- [ ] **Step 8: Run the active-graph GREEN gate**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/infrastructure/automation/workflow tests/unit/application/research/run-continuous-research.test.ts tests/unit/application/agent/continuous-agent-coordinator.test.ts tests/unit/main/main-continuous-composition-guard.test.ts tests/architecture/layer-dependency-contract.test.ts
pnpm run test:typecheck
pnpm run typecheck
pnpm test
git diff --check
```

Expected: full suite passes before deleting legacy facades. Record counts and HEAD/index invariants.

---

### Task 9: Migrate scripts/tests, remove facades and delete `src/automation`

**Files:**

- Modify: `scripts/browser-smoke-test.ts`
- Modify: `scripts/inspect-cpi-first-research.ts`
- Modify: `scripts/inspect-cpi-pdf-attachment.ts`
- Modify: `scripts/inspect-cpi-queue.ts`
- Modify: `scripts/inspect-cpi-research-form.ts`
- Modify: `scripts/inspect-deskdata-pdf-download.ts`
- Modify: `scripts/inspect-deskdata-search.ts`
- Modify: `scripts/inspect-platform-sessions.ts`
- Modify: `scripts/prepare-next-deskdata-search.ts`
- Modify: `scripts/retry-cpi-save-with-latest-pdf.ts`
- Modify: `scripts/run-continuous-auto-research.ts`
- Modify: `scripts/run-full-supervised-research.ts`
- Modify: `scripts/save-cpi-research-result.ts`
- Modify: `scripts/simulate-cpi-research-result.ts`
- Modify: `scripts/test-cpi-continuous-monitor.ts`
- Modify: `scripts/test-cpi-open-first-research.ts`
- Modify: `scripts/test-cpi-queue-controls.ts`
- Modify: `scripts/test-cpi-to-deskdata-cpf.ts`
- Modify: `scripts/test-cpi-to-deskdata-submit.ts`
- Modify: `scripts/test-deskdata-approved-datasets.ts`
- Remove: all remaining files under `src/automation/flow`, `history`, `logging`, `workflow` and the now-empty `src/automation`
- Move/replace: remaining `tests/unit/automation/flow` tests with canonical application/infrastructure tests
- Remove after equivalence proof: facade-only tests under `tests/unit/automation/history`, `logging` and `workflow`
- Modify: `tests/unit/application/research/research-preparation-model.test-d.ts`
- Modify: `tests/support/architecture/source-import-graph.ts`
- Modify: `tests/support/architecture/layer-dependency-policy.ts`
- Modify: `tests/architecture/external-adapter-location-contract.test.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`

**Interfaces:**

- Consumes: canonical application errors/use cases and infrastructure adapters from Tasks 1–8.
- Produces: compilable scripts/tests with zero old imports, no compatibility facades, no automation layer classification and no inverse logging exception.

- [ ] **Step 1: Write the final removal RED contract**

Extend `external-adapter-location-contract.test.ts`:

```ts
function collectTypeScriptFiles(roots: readonly string[]): string[] {
  const visit = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = resolve(path, entry.name)
      return entry.isDirectory() ? visit(entryPath) : /\.tsx?$/.test(entry.name) ? [entryPath] : []
    })

  return roots.flatMap(visit)
}

function findOldImportLines(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const moduleSpecifiers = [...source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  )

  return moduleSpecifiers
    .filter((moduleSpecifier) =>
      /(?:@\/automation|src\/automation|(?:^|\/)automation\/)/.test(moduleSpecifier)
    )
    .map((moduleSpecifier) => `${relative('.', file)}:${moduleSpecifier}`)
}

it('remove a camada automation e todos os imports compiláveis antigos', () => {
  expect(existsSync('src/automation')).toBe(false)

  const oldImports = collectTypeScriptFiles(['src', 'scripts', 'tests']).flatMap(findOldImportLines)

  expect(oldImports).toEqual([])
})
```

The helper must inspect `.ts`/`.tsx` imports and exclude historical Markdown documents. Expected
RED: old source directory and imports still exist.

- [ ] **Step 2: Run legacy facade characterization before deletion**

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/unit/automation/flow tests/unit/automation/history tests/unit/automation/logging tests/unit/automation/workflow tests/unit/application/agent tests/unit/application/history tests/unit/application/research tests/unit/infrastructure/automation/workflow tests/unit/infrastructure/logging
```

Record which canonical tests cover every facade behavior before removing a facade-only test.

- [ ] **Step 3: Migrate operational script imports**

Update low-level controller imports to `../src/infrastructure/automation/...`. Replace:

```ts
import { ExecutionControl } from '../src/application/agent/execution-control'
import { ContinuousResearchStageError } from '../src/application/agent/continuous-research-stage'
import { SafeResearchLogger } from '../src/infrastructure/logging/safe-research-logger'
import { createPlaywrightContinuousResearchExecutionAdapter } from '../src/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter'
import { createPlaywrightResearchPreparationAdapter } from '../src/infrastructure/automation/workflow/playwright-research-preparation-adapter'

const preparation = createPlaywrightResearchPreparationAdapter({
  context,
  deskDataPage,
  detailFrame,
  config
})
const prepared = await preparation.execute(identity)

const control = new ExecutionControl()
const execution = createPlaywrightContinuousResearchExecutionAdapter({
  context,
  cpiPage,
  deskDataPage,
  config
})
const continuousResult = await execution.execute({ token: control.token })
```

Preserve every CLI argument, output string, exit code, default, path and supervised confirmation.
Do not execute a script that opens or mutates CPI/DeskData.

- [ ] **Step 4: Prove script compatibility by typecheck**

```powershell
pnpm run typecheck:scripts
```

Expected: zero errors. This is the only automated script gate; no operational script is run.

- [ ] **Step 5: Remove the eight facades after equivalence is green**

Delete:

```text
src/automation/flow/continuous-research-stage.ts
src/automation/history/research-history-service.ts
src/automation/workflow/agent-public-state-store.ts
src/automation/workflow/continuous-agent-runtime-service.ts
src/automation/flow/continuous-research-runner.ts
src/automation/flow/single-research-cycle.ts
src/automation/flow/full-research-preparation-workflow.ts
src/automation/logging/safe-research-logger.ts
```

Remove facade-only tests only after the recorded canonical replacement passes. Migrate behavioral
flow assertions to the new infrastructure workflow tests rather than weakening or deleting them.

- [ ] **Step 6: Remove the automation layer from architecture support**

Change `SOURCE_LAYERS` to:

```ts
export const SOURCE_LAYERS = [
  'application',
  'domain',
  'infrastructure',
  'main',
  'preload',
  'renderer',
  'shared'
] as const
```

Remove the `automation` entries from `LAYERS_WITH_NODE_ACCESS` and
`ALLOWED_EXTERNAL_PACKAGES`. Delete `ALLOWED_AUTOMATION_INFRASTRUCTURE_EDGES` and its exception.

- [ ] **Step 7: Delete the empty old tree and verify GREEN**

Resolve the absolute path first and verify it equals
`E:\agente-cpi\.worktrees\stage-5-application-core\src\automation`; then remove only that empty
directory tree. Run:

```powershell
pnpm exec tsx scripts/run-vitest-electron.ts run tests/architecture/external-adapter-location-contract.test.ts tests/architecture/layer-dependency-contract.test.ts tests/unit/infrastructure/automation tests/unit/application
pnpm run typecheck
pnpm run test:typecheck
pnpm test
rg -n '@/automation|src/automation|\.\./automation' src scripts tests --glob '*.ts' --glob '*.tsx'
git diff --check
```

Expected: tests pass and `rg` returns no matches. HEAD remains binding and the index empty.

---

### Task 10: Whole-stage review, documentation and final gates

**Files:**

- Create: `docs/architecture/external-adapters.md`
- Modify: `docs/architecture/application-core.md`
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Create/update: `.superpowers/sdd/2026-07-27-refactoring-stage-6-adapters-implementation-plan/progress.md`
- Create: `.superpowers/sdd/2026-07-27-refactoring-stage-6-adapters-implementation-plan/task-10-report.md`

**Interfaces:**

- Consumes: the complete Stage 6 diff and every task report.
- Produces: reviewed architecture documentation, reproducible automated evidence and a manual-test handoff without commit/push.

- [ ] **Step 1: Document the implemented architecture, not the intended one**

`docs/architecture/external-adapters.md` must include:

```text
final directory tree
port -> concrete adapter table
selector ownership table
wait/polling ownership table
idempotent versus non-idempotent operation table
resource ownership and cleanup rules
error/privacy translation
production composition graph
operational script compatibility
```

Remove the Stage 6 temporary-facade and edge inventory from `application-core.md`, replacing it
with a link to the final adapter document. Update the roadmap only with verified evidence.

- [ ] **Step 2: Perform a whole-stage manual diff review**

Review from binding HEAD:

```powershell
git diff --stat 0be5d3a226320e43d5230d5fb01a64ff9dc05f32
git diff --name-status 0be5d3a226320e43d5230d5fb01a64ff9dc05f32
git diff 0be5d3a226320e43d5230d5fb01a64ff9dc05f32 -- src/application src/infrastructure/automation src/main scripts tests
```

Classify every finding as Critical, Important or Minor. Fix all Critical/Important findings through
RED/GREEN and re-review before continuing. Record accepted/deferred Minor findings with rationale.

- [ ] **Step 3: Run focused architecture and privacy scans**

```powershell
rg -n '@/automation|src/automation|\.\./automation' src scripts tests --glob '*.ts' --glob '*.tsx'
rg -n 'new ContinuousAgentCoordinator|new ExecutionControl' src
rg -n --pcre2 '\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b' src tests scripts
git diff --check
```

Expected: no old imports, exactly one active production coordinator, no second active execution
control, and no real full CPF. Synthetic zero-prefixed fixtures must be documented, not silently
accepted.

- [ ] **Step 4: Run the complete validation gate**

```powershell
pnpm run validate
```

Expected: node/scripts/web typechecks, type tests, lint, format check and full test suite all pass.

- [ ] **Step 5: Run build and coverage**

```powershell
pnpm run build
pnpm run test:coverage
```

Expected: build passes; coverage does not materially regress from the Stage 5 honest baseline:

```text
overall: statements 86.68%, branches 79.68%, functions 90.49%, lines 86.88%
application: statements 96.40%, branches 89.08%, functions 100%, lines 96.37%
domain: 100% / 100% / 100% / 100%
```

Any reduction must be explained by moved-file accounting and supported by behavioral tests; do not
add coverage-only assertions.

- [ ] **Step 6: Verify Git invariants and write the automated result**

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git diff --cached --name-only
git status --short
```

Expected: branch `refactor/stage-5-application-core`, binding HEAD unchanged, empty index and only
the accumulated uncommitted refactor diff. Mark the report `DONE_AUTOMATED_GATE_ONLY`; do not claim
manual acceptance.

- [ ] **Step 7: Hand off the Windows manual checklist**

Ask the user to validate browser startup/reuse, CPI and DeskData sessions, CPI filtering/queue,
complete CPI -> DeskData -> PDF -> CPI cycle, pause/resume/stop, history/messages/visual state and
application restart. Only after explicit confirmation update the report/roadmap to
`DONE_STAGE_6_MANUAL_ACCEPTED`. Do not commit or push.

## Final Definition of Done

- [ ] All ten tasks have reports with RED/GREEN evidence and exact command results.
- [ ] Every application port used by browser automation has an explicit infrastructure adapter.
- [ ] `src/automation` and all eight Stage 5 facades are absent.
- [ ] `src`, `scripts` and `tests` contain no compilable old-path import.
- [ ] `main` has zero dependency on an automation layer and no temporary allowlist remains.
- [ ] Selector, wait and idempotency ownership is singular and documented.
- [ ] Public behavior, IPC, history, errors, privacy, cancellation and resource cleanup remain compatible.
- [ ] Whole-stage review has zero open Critical or Important findings.
- [ ] `pnpm run validate`, `pnpm run build`, `pnpm run test:coverage` and `git diff --check` pass.
- [ ] The user has explicitly approved the Windows manual test.
- [ ] HEAD is unchanged, the index is empty, and no commit or push was created.
