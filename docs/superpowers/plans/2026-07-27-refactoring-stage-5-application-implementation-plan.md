# Stage 5 Application Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract lifecycle, continuous execution, research preparation, individual-cycle and
history orchestration into a technology-independent application core while preserving the exact
Windows behavior and public contracts.

**Architecture:** Application use cases own sequencing, lifecycle and decisions behind semantic
ports. Existing Playwright automation remains as concrete adapters and temporary compatibility
facades until Stage 6. Main remains the production composition root and maps application state to
the unchanged serializable IPC contracts.

**Tech Stack:** TypeScript 5.9, Electron 39, Node 24 runtime, Playwright 1.61, React 19,
better-sqlite3 12, Vitest 4, pnpm 10, Windows.

## Global Constraints

- Follow
  `docs/superpowers/specs/2026-07-30-refactoring-stage-5-application-core-design.md`.
- Preserve the exact CPI → DeskData → CPI operation order, queue behavior and sequential
  execution.
- Preserve public statuses, stages, messages, IPC channels, payloads and renderer behavior.
- Preserve pause and stop at the current safe checkpoints; never replay attachment or save.
- Preserve classification rules, CPI mapping, history rows, PDF paths and event order.
- Preserve `app.getPath('userData')/agente-cpi.sqlite` and
  `%APPDATA%/AgenteCPI/browser-profile`.
- `src/application` may import only `src/application` and `src/domain`.
- Application ports must not expose Electron, Playwright, SQLite, Node filesystem or physical
  path operations.
- CPF completo may exist only in the active operation that needs it. State, logs, errors,
  history, tests and documentation use masked or synthetic-safe values.
- Do not reorganize concrete CPI, DeskData, browser or PDF adapters beyond the thin adapters
  required to implement application ports.
- Do not redesign or modify renderer, CSS, preload or IPC contracts.
- Do not introduce dependencies, retries, timeouts, parallelism or workflow libraries.
- External validation is read-only unless the user separately authorizes a real mutation at
  execution time.
- Do not run `git add`, create a commit, merge, push or open a pull request.
- The project-wide single final commit remains forbidden until every stage and final manual
  Windows validation are approved.
- Each task ends with a task-scoped working-tree diff and independent review, not a commit.

## Baseline

Before Task 1, run:

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
git diff --cached --name-only
git rev-parse HEAD

$stage5Workspace = '.superpowers/sdd/2026-07-27-refactoring-stage-5-application-implementation-plan'
New-Item -ItemType Directory -Path $stage5Workspace -Force | Out-Null
```

Expected baseline inherited from the approved Stage 4 checkpoint:

- Node, renderer and structural typechecks pass;
- ESLint and Prettier pass;
- 93 runtime test files and 487 runtime tests pass;
- main, preload and renderer production bundles pass;
- coverage is at least 84.71% statements, 76.85% branches, 88.99% functions and 84.90%
  lines;
- staging is empty;
- HEAD remains `91902e7378ee94f90f714a8079b682477f4b0528`;
- Stage 4 changes and documents remain uncommitted and must not be reverted.

Record the exact baseline output in:

```text
.superpowers/sdd/2026-07-27-refactoring-stage-5-application-implementation-plan/progress.md
```

Use that ignored ledger for task results, reviews, coverage comparisons and manual validation.
Do not add the ledger to Git.

---

### Task 1: Define technology-independent application primitives

**Files:**

- Create: `src/application/errors/application-error.ts`
- Create: `src/application/ports/application-clock-port.ts`
- Create: `src/application/ports/application-id-generator-port.ts`
- Create: `src/application/ports/safe-message-sanitizer-port.ts`
- Create: `src/application/agent/execution-control.ts`
- Create: `src/application/research/research-cycle-model.ts`
- Create: `tests/unit/application/errors/application-error.test.ts`
- Create: `tests/unit/application/agent/execution-control.test.ts`
- Create: `tests/unit/application/research/research-cycle-model.test-d.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`

**Interfaces:**

- Produces:

```ts
export type ApplicationErrorCode =
  | 'VALIDATION'
  | 'INTEGRATION'
  | 'PREPARATION'
  | 'PERSISTENCE'
  | 'CANCELLED'
  | 'INVALID_STATE'
  | 'UNEXPECTED'

export interface ApplicationErrorOptions {
  code: ApplicationErrorCode
  message: string
  stage?: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  cause?: unknown
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode
  readonly stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER' | null
  readonly cause: unknown
}

export interface ApplicationClock {
  now(): Date
}

export interface ApplicationIdGenerator {
  next(): string
}

export interface SafeMessageSanitizer {
  sanitize(message: unknown): string
}

export type ExecutionDirective = 'NONE' | 'PAUSE' | 'STOP'

export interface ExecutionToken {
  readonly directive: ExecutionDirective
  readonly isCancellationRequested: boolean
  subscribe(listener: () => void): () => void
}

export class ExecutionControl {
  readonly token: ExecutionToken
  requestPause(): void
  requestStop(): void
  clearPause(): void
}

export interface ResearchCycleResult {
  maskedCpf: string
  selectedDatasetCount: number
  classification: ResearchClassification
  pdfPath: string
  pdfSizeBytes: number
  saved: true
  confirmationAccepted: true
}
```

- Preserves:
  - the existing `SingleResearchCycleResult` serialized fields;
  - `ContinuousResearchStage` from
    `src/application/agent/continuous-research-stage.ts`.

- [ ] **Step 1: Write failing tests for error causes and execution-control precedence**

```ts
it('preserva a causa sem expô-la na mensagem', () => {
  const cause = new Error('detalhe técnico')
  const error = new ApplicationError({
    code: 'INTEGRATION',
    message: 'Falha segura',
    stage: 'WAITING_DESKDATA_RESULT',
    cause
  })

  expect(error.message).toBe('Falha segura')
  expect(error.stage).toBe('WAITING_DESKDATA_RESULT')
  expect(error.cause).toBe(cause)
})

it('faz STOP prevalecer sobre PAUSE e notifica uma vez por mudança', () => {
  const control = new ExecutionControl()
  const listener = vi.fn()
  control.token.subscribe(listener)

  control.requestPause()
  control.requestStop()
  control.requestPause()

  expect(control.token.directive).toBe('STOP')
  expect(control.token.isCancellationRequested).toBe(true)
  expect(listener).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Write the structural type test**

```ts
import { expectTypeOf } from 'vitest'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'
import type { ResearchClassification } from '@/domain/research/research-classification'

declare const result: ResearchCycleResult

expectTypeOf(result.classification).toEqualTypeOf<ResearchClassification>()
expectTypeOf(result.saved).toEqualTypeOf<true>()
expectTypeOf(result.confirmationAccepted).toEqualTypeOf<true>()
```

- [ ] **Step 3: Run the tests and verify the missing modules fail**

Run:

```powershell
pnpm test -- tests/unit/application/errors/application-error.test.ts tests/unit/application/agent/execution-control.test.ts
pnpm run test:typecheck
```

Expected: FAIL because the new application modules do not exist.

- [ ] **Step 4: Implement the primitives with defensive listener isolation**

Implement `ApplicationError` exactly with the interface above. Implement `ExecutionControl`
with private directive state, a `Set<() => void>`, immutable read access through `token`, STOP
precedence and listener removal. `clearPause()` changes `PAUSE` to `NONE` and does nothing for
`STOP`.

Do not use `AbortController` or import Node APIs in application code.

- [ ] **Step 5: Strengthen the architecture test**

Add a dedicated assertion in `layer-dependency-contract.test.ts`:

```ts
it('mantém todos os contratos da aplicação livres de tipos técnicos', () => {
  const forbidden = dependencies
    .filter((dependency) => dependency.sourceLayer === 'application')
    .filter(
      (dependency) =>
        dependency.moduleSpecifier === 'electron' ||
        dependency.moduleSpecifier === 'playwright' ||
        dependency.moduleSpecifier === 'better-sqlite3' ||
        dependency.moduleSpecifier.startsWith('node:')
    )

  expect(forbidden).toEqual([])
})
```

- [ ] **Step 6: Run Task 1 verification**

```powershell
pnpm test -- tests/unit/application tests/architecture/layer-dependency-contract.test.ts
pnpm run test:typecheck
pnpm run typecheck:node
git diff --check
```

Expected: all commands pass.

- [ ] **Step 7: Review Task 1 without staging**

```powershell
git diff -- src/application tests/unit/application tests/architecture/layer-dependency-contract.test.ts
git diff --cached --name-only
```

Verify application has no external imports, full CPF fixtures or public-contract changes.
Record the review in the Stage 5 ledger.

---

### Task 2: Consolidate classification and fix the supervised script contract

**Files:**

- Create: `src/application/research/research-preparation-model.ts`
- Create: `scripts/support/research-preparation-report-formatter.ts`
- Create: `tests/unit/scripts/research-preparation-report-formatter.test.ts`
- Create: `tests/unit/application/research/research-preparation-model.test-d.ts`
- Create: `tsconfig.scripts.json`
- Modify: `src/automation/flow/full-research-preparation-workflow.ts`
- Modify: `scripts/run-full-supervised-research.ts`
- Modify: `package.json`
- Preserve: `src/automation/deskdata/deskdata-classification-report-formatter.ts`
- Preserve: `tests/unit/automation/deskdata/deskdata-classification-report-formatter.test.ts`

**Interfaces:**

- Consumes:
  - `DeskDataClassification`;
  - `ResearchClassification`;
  - `getCpiClassificationLabel`.
- Produces:

```ts
export type CpiDeskDataClassification = Extract<
  ResearchClassification,
  'CONSTA_RESTRICAO' | 'HA_INFORMACOES'
>

export interface ResearchPreparationClassification {
  classification: CpiDeskDataClassification
  evidence: DeskDataClassification
}

export interface ResearchPreparationReportInput {
  classification: ResearchPreparationClassification
}

export function formatResearchPreparationReport(input: ResearchPreparationReportInput): string[]
```

- The formatter output is exactly:

```text
Classificação técnica: <SIM_CONSTA_RESTRICAO|HA_INFORMACOES>
Resultado destinado à CPI: <existing CPI label>
Motivo técnico: <CRIMINAL_SPHERE_FOUND|NO_CRIMINAL_SPHERE>
Total de processos: <integer>
Esferas normalizadas: <comma-separated values or "Nenhuma identificada">
```

- [ ] **Step 1: Reproduce the current mismatch**

Add a type test that passes `FullResearchPreparationResult['classification']` to the old
formatter and documents that the old formatter requires a different `summary` contract. Then
run:

```powershell
pnpm exec tsc --noEmit --strict --moduleResolution bundler --module preserve --target ES2022 scripts/run-full-supervised-research.ts
```

Expected: FAIL at the formatter call because `summary` is missing. Record the exact diagnostic
in the ledger.

- [ ] **Step 2: Write the failing canonical formatter test**

```ts
it('formata somente as evidências reais da classificação por esfera', () => {
  expect(
    formatResearchPreparationReport({
      classification: {
        classification: 'CONSTA_RESTRICAO',
        evidence: {
          result: 'SIM_CONSTA_RESTRICAO',
          reason: 'CRIMINAL_SPHERE_FOUND',
          totalProcesses: 2,
          normalizedSpheres: ['CRIMINAL', 'CÍVEL']
        }
      }
    })
  ).toEqual([
    'Classificação técnica: SIM_CONSTA_RESTRICAO',
    'Resultado destinado à CPI: Sim, Consta Restrições',
    'Motivo técnico: CRIMINAL_SPHERE_FOUND',
    'Total de processos: 2',
    'Esferas normalizadas: CRIMINAL, CÍVEL'
  ])
})
```

Add a second case for zero spheres expecting `Esferas normalizadas: Nenhuma identificada`.

- [ ] **Step 3: Run the focused tests and verify failure**

```powershell
pnpm test -- tests/unit/scripts/research-preparation-report-formatter.test.ts
pnpm run test:typecheck
```

Expected: FAIL because the canonical model and formatter do not exist.

- [ ] **Step 4: Implement the canonical model and formatter**

In the workflow, replace the flattened intersection with:

```ts
const classification: ResearchPreparationClassification = {
  classification: mapDeskDataResultToResearchClassification(sphereClassification.result),
  evidence: sphereClassification
}
```

Keep the CPI adapter call:

```ts
classification.classification
```

Update all existing workflow expectations from flattened evidence fields to
`classification.evidence`. Do not change the domain classifier.

- [ ] **Step 5: Replace only the broken supervised-script formatter call**

Import `formatResearchPreparationReport` from `scripts/support` and call:

```ts
const reportLines = formatResearchPreparationReport({
  classification: flowResult.classification
})
```

Do not modify script navigation, confirmation, save, attachment or login behavior.

- [ ] **Step 6: Add the dedicated scripts typecheck**

Create `tsconfig.scripts.json`:

```json
{
  "extends": "./tsconfig.node.json",
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts", "src/**/*.ts"]
}
```

Add:

```json
"typecheck:scripts": "tsc --noEmit -p tsconfig.scripts.json --composite false"
```

Insert `pnpm run typecheck:scripts` into `typecheck` after `typecheck:node` and before
`typecheck:web`.

- [ ] **Step 7: Run Task 2 verification**

```powershell
pnpm test -- tests/unit/scripts/research-preparation-report-formatter.test.ts tests/unit/automation/flow/full-research-preparation-workflow.test.ts tests/unit/automation/deskdata/deskdata-classification-report-formatter.test.ts
pnpm run typecheck:scripts
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

Expected: all commands pass and the legacy inspection formatter remains unchanged.

- [ ] **Step 8: Review Task 2 without staging**

```powershell
git diff -- package.json tsconfig.scripts.json src/application/research src/automation/flow/full-research-preparation-workflow.ts scripts/run-full-supervised-research.ts scripts/support tests/unit/scripts tests/unit/automation/flow/full-research-preparation-workflow.test.ts
git diff --cached --name-only
```

Confirm the script correction uses only actual sphere evidence and no real external workflow
was executed. Record the review.

---

### Task 3: Move history orchestration into application

**Files:**

- Create: `src/application/history/research-history-service.ts`
- Create: `tests/unit/application/history/research-history-service.test.ts`
- Modify: `src/automation/history/research-history-service.ts`
- Modify: `tests/unit/automation/history/research-history-service.test.ts`
- Preserve: `src/application/history/research-history-model.ts`
- Preserve: `src/application/ports/research-history-repository-port.ts`
- Preserve: `src/infrastructure/database/research-history-repository.ts`

**Interfaces:**

- Consumes:
  - `ResearchHistoryRepositoryPort`;
  - `ApplicationClock`;
  - `ApplicationIdGenerator`;
  - `SafeMessageSanitizer`;
  - `ResearchCycleResult`;
  - domain `getCpiClassificationLabel`.
- Produces:

```ts
export interface ResearchHistoryServiceDependencies {
  repository: ResearchHistoryRepositoryPort
  clock: ApplicationClock
  idGenerator: ApplicationIdGenerator
  sanitizer: SafeMessageSanitizer
}

export class ResearchHistoryService {
  beginCycle(): ResearchHistoryRecord
  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
  completeCycle(id: string, result: ResearchCycleResult): ResearchHistoryRecord
  failCycle(id: string, stage: string, error: unknown): ResearchHistoryRecord
  list(input: ResearchHistoryListInput): ResearchHistoryPage
  clear(): void
  subscribe(listener: ResearchHistoryEventListener): () => void
}
```

- Compatibility facade:
  - retains the existing automation constructor and optional explicit dates;
  - delegates every decision to the application service;
  - adapts `idFactory`, `Date` inputs and `SafeResearchLogger`;
  - contains no active-cycle map.

- [ ] **Step 1: Write application tests with deterministic ports**

Cover create, masked update, complete, fail, clear rejection, cloned events and invalid dates.
The success test uses:

```ts
const clock = {
  now: vi
    .fn()
    .mockReturnValueOnce(new Date('2026-07-14T10:00:00.000Z'))
    .mockReturnValueOnce(new Date('2026-07-14T10:01:30.000Z'))
}

const service = new ResearchHistoryService({
  repository,
  clock,
  idGenerator: { next: () => 'history-1' },
  sanitizer: { sanitize: (message) => String(message).replace(/\d{11}/g, '[CPF]') }
})
```

Assert `durationMs === 90_000`, one row, unchanged CPI label and masked events.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/history/research-history-service.test.ts
```

Expected: FAIL because the application service does not exist.

- [ ] **Step 3: Implement the application service**

Move the active-cycle map, event set, duration calculation and repository coordination to
application. Use `getCpiClassificationLabel(result.classification)` instead of importing the
automation CPI mapper.

Use `try/finally` semantics around terminal persistence:

```ts
try {
  const record = this.repository.complete(input)
  this.emit({ type: 'UPDATED', record })
  return record
} finally {
  this.activeCycles.delete(id)
}
```

Apply the same cleanup rule to failure. Do not change stored fields or statuses.

- [ ] **Step 4: Convert the automation service into a facade**

Keep current exports and call signatures so existing scripts/tests compile. The facade creates
an application service with a controllable clock whose next explicit date is consumed once.
It must not contain its own active-cycle map, duration logic, sanitization or event listeners.

- [ ] **Step 5: Run Task 3 verification**

```powershell
pnpm test -- tests/unit/application/history tests/unit/automation/history/research-history-service.test.ts tests/unit/infrastructure/database/research-history-repository.test.ts tests/unit/main/ipc/register-history-ipc-handlers.test.ts
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

Expected: all existing history contracts and repository behavior pass.

- [ ] **Step 6: Review Task 3 without staging**

```powershell
rg -n "randomUUID|SafeResearchLogger|SingleResearchCycleResult" src/application
git diff -- src/application/history src/application/ports src/automation/history tests/unit/application/history tests/unit/automation/history
git diff --cached --name-only
```

Expected `rg`: no matches. Record that history has one active-cycle implementation.

---

### Task 4: Introduce the canonical agent state machine and IPC mapper

**Files:**

- Create: `src/application/agent/agent-state.ts`
- Create: `src/application/agent/agent-state-machine.ts`
- Create: `src/main/mappers/agent-public-state-ipc-mapper.ts`
- Create: `tests/unit/application/agent/agent-state-machine.test.ts`
- Create: `tests/unit/main/mappers/agent-public-state-ipc-mapper.test.ts`
- Modify: `src/automation/workflow/agent-public-state-store.ts`
- Modify: `tests/unit/automation/workflow/agent-public-state-store.test.ts`

**Interfaces:**

- Produces:

```ts
export type AgentLifecycleState =
  | 'STOPPED'
  | 'STARTING'
  | 'WAITING_LOGIN'
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSE_REQUESTED'
  | 'PAUSED'
  | 'STOP_REQUESTED'
  | 'FAILED'

export type AgentQueueState = 'UNKNOWN' | 'AVAILABLE' | 'EMPTY'

export interface AgentErrorState {
  stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  message: string
  occurredAt: string
}

export interface AgentState {
  lifecycle: AgentLifecycleState
  currentStage: ContinuousResearchStage | null
  completedCycles: number
  queue: AgentQueueState
  nextCheckAt: string | null
  remainingSeconds: number | null
  currentMaskedCpf: string | null
  lastError: AgentErrorState | null
}

export type AgentProgressPatch = Partial<
  Pick<
    AgentState,
    | 'currentStage'
    | 'completedCycles'
    | 'queue'
    | 'nextCheckAt'
    | 'remainingSeconds'
    | 'currentMaskedCpf'
    | 'lastError'
  >
>

export class AgentStateMachine {
  getSnapshot(): AgentState
  subscribe(listener: (state: AgentState) => void): () => void
  beginStart(): AgentState
  waitForLogin(): AgentState
  beginRun(): AgentState
  markIdle(): AgentState
  markRunning(): AgentState
  requestPause(): AgentState
  markPaused(): AgentState
  resume(): AgentState
  requestStop(): AgentState
  markStopped(): AgentState
  markFailed(error: AgentErrorState): AgentState
  updateProgress(patch: AgentProgressPatch): AgentState
}

export function toAgentPublicState(state: AgentState): AgentPublicState
```

- Mapping:

```ts
const statusMap = {
  STOPPED: 'PARADO',
  STARTING: 'INICIANDO',
  WAITING_LOGIN: 'AGUARDANDO_LOGIN',
  IDLE: 'OCIOSO',
  RUNNING: 'EXECUTANDO',
  PAUSE_REQUESTED: 'PAUSANDO',
  PAUSED: 'PAUSADO',
  STOP_REQUESTED: 'PARANDO',
  FAILED: 'ERRO_E1'
} as const
```

- [ ] **Step 1: Write the transition-table tests**

Use `it.each` to cover accepted transitions and explicit tests for:

```ts
expect(() => new AgentStateMachine().resume()).toThrow('O agente não está pausado')
```

Also cover pause idempotence, stop idempotence, completed-cycle preservation on a new start,
STOP precedence and rejection of an unmasked CPF progress patch.

- [ ] **Step 2: Write the exact IPC mapping test**

For every lifecycle literal, assert the Portuguese public status. Assert cloned `lastError`,
unchanged stage, queue mapping and no shared DTO import from the application model.

- [ ] **Step 3: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/agent/agent-state-machine.test.ts tests/unit/main/mappers/agent-public-state-ipc-mapper.test.ts
```

Expected: FAIL because the state machine and mapper do not exist.

- [ ] **Step 4: Implement state and transitions**

Keep the state private, clone snapshots and errors, publish one event per actual change, and
validate `***.***.***-NN` before accepting `currentMaskedCpf`.

`updateProgress` may update progress fields only; it must not accept `lifecycle`.

- [ ] **Step 5: Convert the old state store to a compatibility adapter**

Retain `AgentPublicStateStore` only for old imports. It delegates to one `AgentStateMachine` and
maps through `toAgentPublicState`. Translate the old `patch` operations only inside this facade;
new application code must never call it. Expose
`getApplicationStateMachine(): AgentStateMachine` only so the legacy runtime facade can reuse
the same canonical state instance during migration.

- [ ] **Step 6: Run Task 4 verification**

```powershell
pnpm test -- tests/unit/application/agent tests/unit/main/mappers/agent-public-state-ipc-mapper.test.ts tests/unit/automation/workflow/agent-public-state-store.test.ts tests/unit/shared/types/dashboard-agent-contracts.test.ts
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

- [ ] **Step 7: Review Task 4 without staging**

```powershell
rg -n "AgentPublicState|AgentPublicStatus" src/application
git diff -- src/application/agent src/main/mappers src/automation/workflow/agent-public-state-store.ts tests/unit/application/agent tests/unit/main/mappers tests/unit/automation/workflow/agent-public-state-store.test.ts
git diff --cached --name-only
```

Expected `rg`: no shared public DTO dependency. Record the transition-table review.

---

### Task 5: Extract research preparation sequencing

**Files:**

- Create: `src/application/ports/research-preparation-ports.ts`
- Create: `src/application/research/prepare-research.ts`
- Create: `tests/unit/application/research/prepare-research.test.ts`
- Modify: `src/automation/flow/full-research-preparation-workflow.ts`
- Modify: `tests/unit/automation/flow/full-research-preparation-workflow.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ResearchIdentity {
  cpf: string
  maskedCpf: string
}

export interface ReportArtifact {
  reference: string
  compatibilityPath: string
  sizeBytes: number
}

export interface DeskDataResearchPort {
  fillCpf(cpf: string): Promise<void>
  applyApprovedDatasets(): Promise<{ selectedCount: number }>
  submitOnce(): Promise<void>
  waitUntilResultReady(): Promise<void>
}

export interface ResearchReportPort {
  create(): Promise<ReportArtifact>
  readProcesses(reference: string): Promise<readonly DeskDataProcessRecord[]>
}

export interface CpiResearchPreparationPort {
  prepareAndAttach(
    classification: CpiDeskDataClassification,
    reportReference: string
  ): Promise<{
    attached: boolean
    requiredFieldsConfirmed: boolean
  }>
}

export interface PrepareResearchDependencies {
  deskData: DeskDataResearchPort
  report: ResearchReportPort
  cpi: CpiResearchPreparationPort
}

export interface PreparedResearch {
  maskedCpf: string
  selectedDatasetCount: number
  classification: ResearchPreparationClassification
  report: ReportArtifact
  attachmentConfirmed: true
  requiredFieldsConfirmed: true
}

export class PrepareResearch {
  execute(identity: ResearchIdentity): Promise<PreparedResearch>
}
```

- [ ] **Step 1: Write the failing ordered-call test**

Use fakes that append to `calls` and assert:

```ts
expect(calls).toEqual([
  'deskdata.fillCpf',
  'deskdata.applyApprovedDatasets',
  'deskdata.submitOnce',
  'deskdata.waitUntilResultReady',
  'report.create',
  'report.readProcesses',
  'cpi.prepareAndAttach'
])
```

Also assert the existing sphere classifier result, CPI mapping, masked CPF, selected count,
report size and confirmation guards.

- [ ] **Step 2: Write guard tests**

Add cases where:

- report size is zero → stage `DOWNLOADING_PDF`;
- attachment is false → stage `ATTACHING_PDF`;
- required fields are false → stage `PREPARING_CPI_RESULT`;
- a port throws → `ApplicationError` with the owning stage and original cause.

- [ ] **Step 3: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/research/prepare-research.test.ts
```

Expected: FAIL because ports and use case do not exist.

- [ ] **Step 4: Implement `PrepareResearch`**

Use the existing pure functions:

```ts
const evidence = classifyDeskDataSpheres(processes)
const classification = {
  classification: mapDeskDataResultToResearchClassification(evidence.result),
  evidence
}
```

Move `mapDeskDataResultToResearchClassification` to the application model or use-case module
and leave an automation re-export for compatibility.

- [ ] **Step 5: Adapt the Playwright workflow without moving concrete controllers**

`FullResearchPreparationWorkflow.prepare(context, deskDataPage, detailFrame, identity)` creates
context-bound port adapters around its existing injected controllers, invokes
`PrepareResearch`, and maps `PreparedResearch` back to the existing
`FullResearchPreparationResult`, including `detailFrame`,
`deskDataResultPage` and `closeDeskDataResultPageAfterSave`.

The application use case must not receive those Playwright-only compatibility fields.

- [ ] **Step 6: Run Task 5 verification**

```powershell
pnpm test -- tests/unit/application/research/prepare-research.test.ts tests/unit/automation/flow/full-research-preparation-workflow.test.ts tests/unit/automation/deskdata tests/integration/automation/deskdata
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

- [ ] **Step 7: Review Task 5 without staging**

```powershell
rg -n "playwright|BrowserContext|Page|Frame|filePath|node:" src/application/research src/application/ports/research-preparation-ports.ts
git diff -- src/application/research src/application/ports/research-preparation-ports.ts src/automation/flow/full-research-preparation-workflow.ts tests/unit/application/research tests/unit/automation/flow/full-research-preparation-workflow.test.ts
git diff --cached --name-only
```

Expected: no technical browser or Node imports. `compatibilityPath` may exist only as opaque
data and must not be inspected by application code.

---

### Task 6: Extract the individual research cycle

**Files:**

- Create: `src/application/ports/research-cycle-ports.ts`
- Create: `src/application/research/run-research-cycle.ts`
- Create: `tests/unit/application/research/run-research-cycle.test.ts`
- Modify: `src/automation/flow/single-research-cycle.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle.test.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle-hooks.test.ts`
- Modify: `tests/unit/automation/flow/single-research-cycle-historical-result.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ResearchCycleHooks {
  onStage?(stage: ContinuousResearchStage): void
  onIdentity?(maskedCpf: string): void
}

export interface CpiResearchCyclePort {
  openNext(): Promise<void>
  readIdentity(): Promise<ResearchIdentity>
  saveOnce(): Promise<{ saved: boolean; confirmationAccepted: boolean }>
  returnToQueue(): Promise<void>
}

export interface DeskDataCyclePort {
  prepareNextSearch(): Promise<void>
  closeHistoricalResult(): Promise<void>
}

export interface ResearchPreparationPort {
  execute(identity: ResearchIdentity): Promise<PreparedResearch>
}

export interface RunResearchCycleDependencies {
  cpi: CpiResearchCyclePort
  deskData: DeskDataCyclePort
  preparation: ResearchPreparationPort
}

export class RunResearchCycle {
  execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult>
}
```

- [ ] **Step 1: Write the complete ordered-cycle test**

Assert this exact application call order:

```ts
expect(calls).toEqual([
  'cpi.openNext',
  'cpi.readIdentity',
  'deskdata.prepareNextSearch',
  'preparation.execute',
  'cpi.saveOnce',
  'deskdata.closeHistoricalResult',
  'deskdata.prepareNextSearch',
  'cpi.returnToQueue'
])
```

Assert hooks preserve the current public stage sequence and identity is notified only after a
valid masked value is returned.

- [ ] **Step 2: Write failure and safe-boundary tests**

Cover:

- STOP before start → `OPENING_CPI_RESEARCH` cancellation;
- failed save → `SAVING_CPI` and no next-search/queue return;
- historical result cleanup failure → `PREPARING_NEXT_SEARCH`;
- adapter failure wrapped once with owning stage;
- an existing `ApplicationError` is not double-wrapped;
- attachment and required-field validation occurs in preparation before save.

- [ ] **Step 3: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/research/run-research-cycle.test.ts
```

- [ ] **Step 4: Implement the application cycle**

Use a private stage helper:

```ts
private async runStage<T>(
  stage: ContinuousResearchStage,
  operation: () => Promise<T>,
  hooks?: ResearchCycleHooks
): Promise<T>
```

The helper calls `hooks?.onStage?.(stage)`, preserves existing application errors and wraps
other failures with `ApplicationError({ code: 'INTEGRATION', stage, cause })`.

- [ ] **Step 5: Turn `SingleResearchCycle` into a Playwright compatibility facade**

Keep its current constructor, input, factory seam and result exports. Create context-bound
semantic adapters around the current opener, identity reader, preparation workflow, save
controller, historical-page cleanup and queue-return controller. Delegate ordering and stage
decisions to `RunResearchCycle`.

Re-export:

```ts
export type SingleResearchCycleResult = ResearchCycleResult
```

- [ ] **Step 6: Run Task 6 verification**

```powershell
pnpm test -- tests/unit/application/research/run-research-cycle.test.ts tests/unit/automation/flow/single-research-cycle.test.ts tests/unit/automation/flow/single-research-cycle-hooks.test.ts tests/unit/automation/flow/single-research-cycle-historical-result.test.ts tests/unit/automation/flow/continuous-safety-guard.test.ts
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

- [ ] **Step 7: Review Task 6 without staging**

```powershell
rg -n "playwright|BrowserContext|Page|Frame|automation/" src/application/research/run-research-cycle.ts src/application/ports/research-cycle-ports.ts
git diff -- src/application/research/run-research-cycle.ts src/application/ports/research-cycle-ports.ts src/automation/flow/single-research-cycle.ts tests/unit/application/research tests/unit/automation/flow
git diff --cached --name-only
```

Expected `rg`: no matches.

---

### Task 7: Extract continuous queue and cycle execution

**Files:**

- Create: `src/application/ports/continuous-research-ports.ts`
- Create: `src/application/research/run-continuous-research.ts`
- Create: `tests/unit/application/research/run-continuous-research.test.ts`
- Modify: `src/automation/flow/continuous-research-runner.ts`
- Modify: `tests/unit/automation/flow/continuous-research-runner.test.ts`
- Modify: `tests/unit/automation/flow/continuous-research-runner-boundary.test.ts`

**Interfaces:**

- Produces:

```ts
export type ContinuousResearchState =
  | { type: 'WAITING_QUEUE'; checks: number }
  | { type: 'IDLE'; nextCheckInMs: number }
  | { type: 'RESEARCH_AVAILABLE'; cycle: number; checks: number }
  | { type: 'CYCLE_COMPLETED'; cycle: number; result: ResearchCycleResult }
  | { type: 'STOPPED'; cycles: number }

export interface ResearchQueuePort {
  waitForResearch(input: {
    token: ExecutionToken
    onState(state: 'CHECKING' | 'EMPTY' | 'AVAILABLE', checks: number): void
  }): Promise<{ status: 'AVAILABLE' | 'CANCELLED'; checks: number }>
}

export interface ResearchCyclePort {
  execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult>
}

export interface ResearchCycleFactory {
  create(): ResearchCyclePort
}

export interface ContinuousResearchInput {
  token: ExecutionToken
  onState?(state: ContinuousResearchState): void
  onCycleStage?(cycle: number, stage: ContinuousResearchStage): void
  onCycleIdentity?(cycle: number, maskedCpf: string): void
}

export interface ContinuousResearchResult {
  status: 'STOPPED_BY_SIGNAL' | 'STOPPED_BY_REQUEST'
  completedCycles: number
}

export class RunContinuousResearch {
  execute(input: ContinuousResearchInput): Promise<ContinuousResearchResult>
}
```

- [ ] **Step 1: Write continuous-loop characterization tests**

Cover:

- empty queue emits `WAITING_QUEUE`, `IDLE`, then checks again;
- one available item creates exactly one cycle;
- completed cycle increments only after success;
- STOP before the next cycle returns `STOPPED_BY_REQUEST`;
- queue cancellation returns `STOPPED_BY_SIGNAL`;
- no cycle begins after a pause/stop request;
- stage and masked-identity callbacks preserve cycle numbering.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/research/run-continuous-research.test.ts
```

- [ ] **Step 3: Implement the continuous use case**

Move only loop decisions and state emission. Keep queue polling, filter refresh, delays and
Playwright cancellation inside the queue adapter. The application loop checks
`input.token.directive` before waiting, after waiting, and after each completed cycle.

- [ ] **Step 4: Adapt `ContinuousResearchRunner`**

Keep the current Playwright input and factory seam. Adapt the current `CpiQueueMonitor` to
`ResearchQueuePort`, map its `PAUSED` result to `CANCELLED`, and adapt `SingleResearchCycle` to
`ResearchCyclePort`.

Map an `AbortSignal` to a task-local `ExecutionControl`:

- abort requests STOP;
- `shouldStopBeforeNextCycle()` requests STOP so the result remains
  `STOPPED_BY_REQUEST`;
- remove the abort listener in `finally`.

Do not let this compatibility mapping change existing runner results.

- [ ] **Step 5: Run Task 7 verification**

```powershell
pnpm test -- tests/unit/application/research/run-continuous-research.test.ts tests/unit/automation/flow/continuous-research-runner.test.ts tests/unit/automation/flow/continuous-research-runner-boundary.test.ts tests/unit/automation/cpi/cpi-queue-continuous-polling.test.ts
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

- [ ] **Step 6: Review Task 7 without staging**

```powershell
rg -n "playwright|Page|BrowserContext|CpiQueue" src/application/research/run-continuous-research.ts src/application/ports/continuous-research-ports.ts
git diff -- src/application/research/run-continuous-research.ts src/application/ports/continuous-research-ports.ts src/automation/flow/continuous-research-runner.ts tests/unit/application/research tests/unit/automation/flow/continuous-research-runner*
git diff --cached --name-only
```

Expected `rg`: no matches.

---

### Task 8: Extract the public agent coordinator

**Files:**

- Create: `src/application/ports/agent-runtime-ports.ts`
- Create: `src/application/agent/continuous-agent-coordinator.ts`
- Create: `src/automation/workflow/playwright-agent-workspace-adapter.ts`
- Create: `tests/unit/application/agent/continuous-agent-coordinator.test.ts`
- Create: `tests/unit/automation/workflow/playwright-agent-workspace-adapter.test.ts`
- Modify: `src/automation/workflow/continuous-agent-runtime-service.ts`
- Modify: `tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts`

**Interfaces:**

- Produces:

```ts
export interface AgentWorkspacePort {
  ensureStarted(): Promise<void>
  areSessionsAuthenticated(): Promise<boolean>
  prepareContinuousExecution(): Promise<ContinuousResearchExecutionPort>
}

export interface ContinuousResearchExecutionPort {
  execute(input: ContinuousResearchInput): Promise<ContinuousResearchResult>
}

export interface AgentHistoryPort {
  beginCycle(): ResearchHistoryRecord
  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
  completeCycle(id: string, result: ResearchCycleResult): ResearchHistoryRecord
  failCycle(id: string, stage: string, error: unknown): ResearchHistoryRecord
}

export interface ContinuousAgentCoordinatorDependencies {
  state: AgentStateMachine
  workspace: AgentWorkspacePort
  history: AgentHistoryPort
  clock: ApplicationClock
  sanitizer: SafeMessageSanitizer
}

export class ContinuousAgentCoordinator {
  getSnapshot(): AgentState
  subscribe(listener: (state: AgentState) => void): () => void
  start(): Promise<AgentState>
  loginCompleted(): Promise<AgentState>
  pause(): Promise<AgentState>
  resume(): Promise<AgentState>
  stop(): Promise<AgentState>
  shutdown(): Promise<void>
}
```

- [ ] **Step 1: Port the runtime characterization tests to application fakes**

The application test must cover all current cases from
`continuous-agent-runtime-service.test.ts`, including:

- start while active error text;
- unauthenticated start → `WAITING_LOGIN`;
- invalid login confirmation errors;
- resume only from paused;
- immediate pause/stop when no cycle is active;
- safe wait when a cycle is active;
- history begin on `RESEARCH_AVAILABLE`;
- masked identity update;
- history completion and cycle count;
- sanitized failure and `FAILED`;
- shutdown idempotence;
- runner overlap rejection.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm test -- tests/unit/application/agent/continuous-agent-coordinator.test.ts
```

- [ ] **Step 3: Implement the coordinator**

Use one `ExecutionControl`, one active execution promise and one current history ID. Lifecycle
transitions go only through `AgentStateMachine`.

Preserve current queue projection:

```ts
case 'WAITING_QUEUE':
  this.state.markIdle()
  this.state.updateProgress({
    currentStage: 'WAITING_QUEUE',
    queue: 'UNKNOWN',
    nextCheckAt: null,
    remainingSeconds: null
  })
case 'IDLE':
  this.state.markIdle()
  this.state.updateProgress({
    currentStage: 'WAITING_QUEUE',
    queue: 'EMPTY',
    nextCheckAt: new Date(
      this.clock.now().getTime() + runnerState.nextCheckInMs
    ).toISOString(),
    remainingSeconds: Math.ceil(runnerState.nextCheckInMs / 1000)
  })
case 'RESEARCH_AVAILABLE':
  this.state.markRunning()
  this.currentHistoryId = this.history.beginCycle().id
case 'CYCLE_COMPLETED':
  this.history.completeCycle(this.requireCurrentHistoryId(), runnerState.result)
```

Use state-machine transition methods separately from progress patches. On failure, fail active
history first, sanitize the public message, then call `markFailed`.

- [ ] **Step 4: Implement the Playwright workspace adapter**

Create `PlaywrightAgentWorkspaceAdapter implements AgentWorkspacePort`. Its constructor
receives the existing browser, session and queue-filter ports plus the complete
`ContinuousResearchRunnerConfig`. It owns `createContinuousResearchRunner(config)` so main does
not import the legacy runner factory.

- locate CPI and DeskData pages only in the adapter;
- apply the criminal-forum filter only in the adapter;
- return a `ContinuousResearchExecutionPort` bound to those pages;
- adapt the application execution token and callbacks to the existing runner input;
- remove every abort listener in `finally`;
- expose no Playwright value through the application port.

Test authenticated and unauthenticated snapshots, missing platform pages, filter-before-run
order and callback/result mapping.

- [ ] **Step 5: Convert the old runtime service into an adapter facade**

Retain `ContinuousAgentRuntimeService` and its current public `AgentPublicState` methods. Build
it from `ContinuousAgentCoordinator`, `AgentStateMachine` and
`PlaywrightAgentWorkspaceAdapter`:

- obtain the canonical machine through
  `dependencies.stateStore.getApplicationStateMachine()`;
- adapt the old history callbacks and explicit clock to `AgentHistoryPort`;
- adapt `SafeResearchLogger.sanitizeMessage` to `SafeMessageSanitizer`;
- map application snapshots through `toAgentPublicState`.

Remove lifecycle flags, history IDs, cycle-active state and error decisions from the facade.

- [ ] **Step 6: Run Task 8 verification**

```powershell
pnpm test -- tests/unit/application/agent/continuous-agent-coordinator.test.ts tests/unit/automation/workflow/playwright-agent-workspace-adapter.test.ts tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts tests/unit/main/ipc/register-continuous-agent-ipc-handlers.test.ts tests/unit/preload/continuous-agent-preload-api.test.ts tests/unit/renderer/agent-dashboard.test.tsx
pnpm run test:typecheck
pnpm run typecheck
git diff --check
```

- [ ] **Step 7: Review Task 8 without staging**

```powershell
rg -n "playwright|BrowserContext|Page|AgentPublicState|shared/" src/application/agent src/application/ports/agent-runtime-ports.ts
rg -n "requestedExit|runnerPromise|abortController|cycleActive|currentHistoryId" src/automation/workflow/continuous-agent-runtime-service.ts
git diff -- src/application/agent src/application/ports/agent-runtime-ports.ts src/automation/workflow tests/unit/application/agent tests/unit/automation/workflow
git diff --cached --name-only
```

Expected: the first scan has no technical/shared imports; the second scan has no lifecycle
ownership in the facade.

---

### Task 9: Compose the application core in main and shrink temporary edges

**Files:**

- Create: `src/infrastructure/runtime/system-clock.ts`
- Create: `src/infrastructure/runtime/uuid-generator.ts`
- Create: `src/infrastructure/logging/safe-research-logger.ts`
- Create: `src/infrastructure/logging/safe-message-sanitizer.ts`
- Create: `src/main/adapters/continuous-agent-ipc-adapter.ts`
- Create: `tests/unit/infrastructure/runtime/system-clock.test.ts`
- Create: `tests/unit/infrastructure/runtime/uuid-generator.test.ts`
- Create: `tests/unit/infrastructure/logging/safe-research-logger.test.ts`
- Create: `tests/unit/infrastructure/logging/safe-message-sanitizer.test.ts`
- Create: `tests/unit/main/adapters/continuous-agent-ipc-adapter.test.ts`
- Modify: `src/automation/logging/safe-research-logger.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`
- Modify: `tests/architecture/layer-dependency-contract.test.ts`
- Preserve: `src/main/ipc/register-continuous-agent-ipc-handlers.ts`
- Preserve: `src/main/ipc/register-history-ipc-handlers.ts`

**Interfaces:**

- Produces:

```ts
export class SystemClock implements ApplicationClock {
  now(): Date
}

export class UuidGenerator implements ApplicationIdGenerator {
  next(): string
}

export class SafeMessageSanitizerAdapter implements SafeMessageSanitizer {
  sanitize(message: unknown): string
}

export class ContinuousAgentIpcAdapter implements ContinuousAgentControlService {
  constructor(private readonly coordinator: ContinuousAgentCoordinator)
  getSnapshot(): AgentPublicState
  subscribe(listener: (state: AgentPublicState) => void): () => void
  start(): Promise<AgentPublicState>
  pause(): Promise<AgentPublicState>
  resume(): Promise<AgentPublicState>
  stop(): Promise<AgentPublicState>
  loginCompleted(): Promise<AgentPublicState>
}
```

- Main directly composes:
  - application `ResearchHistoryService`;
  - application `AgentStateMachine`;
  - application `ContinuousAgentCoordinator`;
  - infrastructure clock, ID generator and sanitizer;
  - concrete automation adapters/facades required until Stage 6.

- IPC handlers consume small structural ports and map application records/state to existing
  shared DTOs.

- [ ] **Step 1: Write adapter tests**

Assert `SystemClock.now()` returns a valid date, `UuidGenerator.next()` returns distinct UUIDs
matching the UUID pattern, and the sanitizer removes a synthetic 11-digit CPF while preserving
the current safe-message truncation behavior.

- [ ] **Step 2: Update composition guard expectations before production code**

Require source strings for:

```ts
new ResearchHistoryService({
new AgentStateMachine()
new ContinuousAgentCoordinator({
new SystemClock()
new UuidGenerator()
new SafeMessageSanitizerAdapter()
new PlaywrightAgentWorkspaceAdapter(
new ContinuousAgentIpcAdapter(
```

Remove expectations that main constructs `AgentPublicStateStore` or owns the old history
service.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
pnpm test -- tests/unit/infrastructure/runtime tests/unit/infrastructure/logging/safe-message-sanitizer.test.ts tests/unit/main/main-continuous-composition-guard.test.ts
```

- [ ] **Step 4: Implement infrastructure adapters**

`UuidGenerator` is the only new Stage 5 module importing `node:crypto`. `SystemClock` returns
`new Date()`. Move the existing `SafeResearchLogger` implementation unchanged to
`src/infrastructure/logging/safe-research-logger.ts`; make its automation path a compatibility
re-export. `SafeMessageSanitizerAdapter` delegates to that class and implements
`sanitize(message: unknown)` without duplicating the regex, masking or 1,000-character policy.

- [ ] **Step 5: Implement the IPC boundary adapter**

Each command calls the corresponding coordinator method and maps the returned `AgentState`
through `toAgentPublicState`. `subscribe` maps a fresh cloned snapshot for every event.

Run:

```powershell
pnpm test -- tests/unit/main/adapters/continuous-agent-ipc-adapter.test.ts tests/unit/main/ipc/register-continuous-agent-ipc-handlers.test.ts
```

Expected: the adapter and unchanged IPC handler preserve every current shared DTO.

- [ ] **Step 6: Recompose main**

Create one instance of each application service. Keep repository opening,
`markUnfinishedAsInterrupted`, browser workspace, session service, queue adapter, IPC
registration and shutdown order unchanged.

Register `ContinuousAgentIpcAdapter` with the unchanged agent IPC handler. Register the
application history service directly with the unchanged history IPC handler, which already
maps application records. Do not change handler channel names or preload contracts.

- [ ] **Step 7: Shrink the architecture edge freeze**

Remove these core ownership edges:

```text
main/main-application-runtime.ts->automation/flow/continuous-research-runner.ts
main/main-application-runtime.ts->automation/history/research-history-service.ts
main/main-application-runtime.ts->automation/workflow/agent-public-state-store.ts
main/main-application-runtime.ts->automation/workflow/continuous-agent-runtime-service.ts
```

Add only this replacement adapter edge:

```text
main/main-application-runtime.ts->automation/workflow/playwright-agent-workspace-adapter.ts
```

Preserve the browser, platform page, filter and session edges for Stage 6.

- [ ] **Step 8: Run Task 9 verification**

```powershell
pnpm test -- tests/unit/infrastructure tests/unit/main tests/architecture/layer-dependency-contract.test.ts tests/unit/preload tests/unit/renderer
pnpm run test:typecheck
pnpm run typecheck
pnpm run build
git diff --check
```

- [ ] **Step 9: Review Task 9 without staging**

```powershell
rg -n "new (ResearchHistoryService|AgentStateMachine|ContinuousAgentCoordinator)" src --glob "*.ts"
rg -n "from ['\"].*automation/(flow|history|workflow)" src/main
git diff -- src/main src/infrastructure/runtime src/infrastructure/logging tests/unit/main tests/unit/infrastructure tests/architecture/layer-dependency-contract.test.ts
git diff --cached --name-only
```

Expected:

- production graph constructed only in `main-application-runtime.ts`;
- no old core service constructed in main;
- remaining main-to-automation imports are concrete Stage 6 adapters only.

---

### Task 10: Document and execute the complete Stage 5 gate

**Files:**

- Create: `docs/architecture/application-core.md`
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Review: `docs/architecture/configuration-and-persistence.md`
- Review: every Stage 5 production and test file
- Do not track:
  `.superpowers/sdd/2026-07-27-refactoring-stage-5-application-implementation-plan/**`

**Documentation content:**

- application use cases and owners;
- semantic ports and concrete adapter mapping;
- lifecycle transition table;
- cooperative pause/stop checkpoints;
- error translation flow;
- sensitive-data boundaries;
- compatibility facades remaining for Stage 6;
- exact temporary architecture edges and removal owner.

- [ ] **Step 1: Write the architecture document from implemented evidence**

Include this dependency diagram:

```text
main ──compose──> application <──implement── automation/infrastructure
                         │
                         └──> domain
```

Include a table with one row per facade:

```text
Current import path | Delegates to | Why retained | Removal stage
```

Do not describe adapters as already moved when they remain under `src/automation`.

- [ ] **Step 2: Run targeted application coverage**

```powershell
pnpm test -- tests/unit/application tests/architecture
pnpm run test:typecheck
```

Expected: every application use case passes with fakes and structural contracts pass.

- [ ] **Step 3: Run the complete automated gate**

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

Expected:

- Node, scripts, renderer and structural typechecks pass;
- ESLint has zero warnings;
- Prettier passes;
- every runtime test passes;
- main, preload and renderer production bundles pass;
- overall coverage does not regress without a documented reason;
- `domain` and `application` each meet at least 85% statements, functions and lines and 80%
  branches.

- [ ] **Step 4: Run architecture and privacy scans**

```powershell
rg -n "from ['\"](electron|playwright|better-sqlite3)|from ['\"]node:" src/application
rg -n "BrowserContext|\\bPage\\b|\\bFrame\\b|Database|Statement" src/application
rg -n "\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b" src tests scripts docs/architecture
git diff --cached --name-only
git rev-parse HEAD
```

Expected:

- first two scans return no matches;
- CPF scan adds no new complete CPF relative to the Stage 4 approved baseline;
- staging is empty;
- HEAD is still `91902e7378ee94f90f714a8079b682477f4b0528`.

- [ ] **Step 5: Perform a cumulative diff review**

Review:

```powershell
git status --short
git diff --stat
git diff -- src/application
git diff -- src/automation/flow src/automation/history src/automation/workflow
git diff -- src/main src/infrastructure
git diff -- scripts package.json tsconfig.scripts.json
git diff -- tests
git diff -- docs/architecture docs/superpowers
```

Checklist:

- exact flow order preserved;
- no duplicate lifecycle/history/orchestration owner;
- adapters contain Playwright mechanics only;
- application ports are semantic;
- IPC and renderer contracts unchanged;
- supervised-script bug has a regression test;
- no unapproved external write was performed;
- no unrelated user changes were reverted;
- no commit, staging or push occurred.

Record Critical, Important and Minor findings in the Stage 5 ledger. Resolve Critical and
Important findings and rerun affected gates before proceeding.

- [ ] **Step 6: Present the Windows manual-validation checklist**

Ask the user to validate:

1. application starts normally;
2. authenticated browser profile and sessions remain available;
3. public dashboard initially matches the approved Stage 4 behavior;
4. start with valid sessions enters the same idle/queue state;
5. start without valid sessions shows the same login-wait flow;
6. one full authorized research follows CPI → DeskData → PDF → CPI in the same order;
7. classification, attachment, confirmation, save and history match the previous behavior;
8. pause reaches `PAUSADO` at the same safe boundary;
9. resume continues without duplicating the cycle;
10. stop reaches `PARADO` without starting another cycle;
11. error messages contain no complete CPF or technical sensitive data;
12. renderer appearance, text, counters and history panel are unchanged.

Any real save, attachment or CPI/DeskData mutation requires explicit authorization immediately
before that validation.

- [ ] **Step 7: Stop at the Stage 5 approval gate**

After automated evidence is green, report:

- files and responsibilities changed;
- exact test/build/coverage results;
- remaining Stage 6 facades and edges;
- supervised-script correction evidence;
- manual validation result.

Wait for the user to choose:

```text
A — Stage 5 tested and working; authorize Stage 6 design
B — A problem was found; diagnose before continuing
C — Repeat or expand a Stage 5 validation
```

Do not write the Stage 6 implementation plan, commit, merge or push until the user approves the
appropriate next action.
