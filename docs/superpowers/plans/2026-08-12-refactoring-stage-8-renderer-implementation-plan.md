# Stage 8 Renderer Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the React renderer into feature-focused hooks, pure view-model functions and small
presentation components without changing rendered DOM, CSS, user interactions or preload
contracts.

**Architecture:** Place the only `window.agent` access behind a typed renderer gateway. Compose
dashboard and history behavior from focused hooks, keep formatting/control policies pure, and make
presentation components deterministic while retaining the public component entry points.

**Tech Stack:** Windows, React 19.2.x, React DOM 19.2.x, TypeScript 5.9.x, Electron 39.x, Vitest
4.1.x, Testing Library 16.3.x, jsdom 29.x, pnpm.

**Specification:**
`docs/superpowers/specs/2026-08-12-refactoring-stage-8-renderer-design.md`

## Global Constraints

- Windows is the only supported operating system.
- Preserve every visible Portuguese string, element tag, hierarchy, class, ARIA attribute,
  `data-testid`, table column and sibling order.
- Keep `src/renderer/src/assets/main.css` byte-for-byte equal to SHA-256
  `949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6`.
- Preserve all `window.agent` methods, IPC channels, DTOs, command results and event timing.
- Keep one global dashboard action lock and one global history action lock.
- History remains page 1 with `pageSize: 50`; do not add pagination, filters or search.
- Add no Context, reducer store, state-management dependency, CSS module or design system.
- Render only masked CPF. No full CPF may appear in source, tests, fixtures, docs, logs, snapshots or
  reports.
- Do not modify main/preload/shared/application/infrastructure behavior unless a directly related
  compatibility defect is proven by a failing regression and cannot be fixed in the renderer.
- Use TDD for every production change: observe a focused RED, implement the minimum GREEN and run
  the related regression gate.
- Do not execute real CPI/DeskData automation scripts during this stage.
- Do not stage, commit, merge, push or publish before explicit manual Windows acceptance. Each task
  ends at an uncommitted checkpoint.

## File Map

### New renderer gateway

- `src/renderer/src/api/agent-api.ts` — return the current typed preload API without caching or
  transformation.

### New dashboard feature files

- `src/renderer/src/features/dashboard/dashboard-model.ts` — initial snapshots, action/log types,
  labels and control policy.
- `src/renderer/src/features/dashboard/use-mounted-ref.ts` — mounted-state guard shared by
  asynchronous renderer hooks.
- `src/renderer/src/features/dashboard/use-operational-log.ts` — newest-first ten-entry log.
- `src/renderer/src/features/dashboard/use-dashboard-actions.ts` — one global action lock and safe
  primary-result/error lifecycle.
- `src/renderer/src/features/dashboard/use-dashboard-environment.ts` — browser/session state,
  refresh and browser commands.
- `src/renderer/src/features/dashboard/use-agent-control.ts` — agent state, subscription and agent
  commands.
- `src/renderer/src/features/dashboard/use-agent-dashboard.ts` — initial three-call hydration and
  composition of dashboard hooks.
- `src/renderer/src/features/dashboard/DashboardHeader.tsx` — application heading and agent status.
- `src/renderer/src/features/dashboard/BrowserStatusPanel.tsx` — browser state and controls.
- `src/renderer/src/features/dashboard/AgentStatusPanel.tsx` — metrics and agent controls.
- `src/renderer/src/features/dashboard/PlatformSessionsPanel.tsx` — CPI/DeskData status rows.
- `src/renderer/src/features/dashboard/AgentErrorPanel.tsx` — optional E1 panel.
- `src/renderer/src/features/dashboard/OperationalLogPanel.tsx` — current ten-entry activity markup.
- `src/renderer/src/features/dashboard/StatusIndicator.tsx` — shared status indicator markup.

### New history feature files

- `src/renderer/src/features/history/research-history-model.ts` — pure history formatting and
  immutable upsert/sort.
- `src/renderer/src/features/history/use-research-history.ts` — list/events/clear/PDF state and
  actions.
- `src/renderer/src/features/history/ResearchHistoryTable.tsx` — deterministic table and PDF action
  markup.

### Existing files retained as public composition points

- `src/renderer/src/components/AgentDashboard.tsx`
- `src/renderer/src/components/ResearchHistoryPanel.tsx`
- `src/renderer/src/hooks/use-agent-countdown.ts`
- `src/renderer/src/assets/main.css`

### Test and documentation files

- `tests/unit/renderer/agent-dashboard.test.tsx`
- `tests/unit/renderer/research-history-panel.test.tsx`
- `tests/unit/renderer/use-agent-countdown.test.tsx`
- `tests/unit/renderer/renderer-css-contract.test.ts`
- `tests/unit/renderer/agent-api.test.ts`
- `tests/unit/renderer/dashboard-model.test.ts`
- `tests/unit/renderer/use-operational-log.test.tsx`
- `tests/unit/renderer/use-dashboard-actions.test.tsx`
- `tests/unit/renderer/use-agent-dashboard.test.tsx`
- `tests/unit/renderer/research-history-model.test.ts`
- `tests/unit/renderer/use-research-history.test.tsx`
- `tests/unit/security/dashboard-production-guard.test.ts`
- `tests/unit/security/electron-security-contract.test.ts`
- `docs/architecture/renderer.md`
- `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`

---

### Task 1: Freeze Renderer Behavior, Structure and CSS

**Files:**

- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`
- Modify: `tests/unit/renderer/research-history-panel.test.tsx`
- Create: `tests/unit/renderer/renderer-css-contract.test.ts`
- Review: `src/renderer/src/components/AgentDashboard.tsx`
- Review: `src/renderer/src/components/ResearchHistoryPanel.tsx`
- Review: `src/renderer/src/assets/main.css`

**Interfaces:**

- Consumes: accepted Stage 7 renderer with `window.agent` test fakes.
- Produces: characterization that later tasks must keep green; no production change.

- [ ] **Step 1: Extend the dashboard characterization**

Add table-driven assertions for all control states:

```ts
const controlCases = [
  { status: 'PARADO', enabled: ['Iniciar agente'] },
  { status: 'ERRO_E1', enabled: ['Iniciar agente', 'Parar'] },
  { status: 'EXECUTANDO', enabled: ['Pausar', 'Parar'] },
  { status: 'OCIOSO', enabled: ['Pausar', 'Parar'] },
  { status: 'PAUSADO', enabled: ['Continuar', 'Parar'] },
  { status: 'PARANDO', enabled: [] },
  { status: 'AGUARDANDO_LOGIN', enabled: ['Parar', 'Login concluído — continuar'] }
] as const
```

For each case, assert every rendered agent-control button, not only the enabled subset. Add a
pending deferred command and prove every browser/agent/login control is disabled until it settles.

- [ ] **Step 2: Characterize mount, unmount and log behavior**

Add tests proving:

```ts
expect(browserGetStatus).toHaveBeenCalledTimes(1)
expect(agentGetState).toHaveBeenCalledTimes(1)
expect(sessionsGetStatus).toHaveBeenCalledTimes(1)
expect(unsubscribeState).toHaveBeenCalledTimes(1)
```

Use deferred Promises to unmount before hydration resolves/rejects and fail the test on a React
state-update warning. Execute eleven actions with controlled system time and assert only the ten
newest messages remain in newest-first order. Prove secondary refresh rejection does not replace a
successful primary-action log.

- [ ] **Step 3: Freeze dashboard structure**

Assert direct-child signatures rather than one opaque snapshot:

```ts
expect(screen.getByRole('banner')).toHaveClass('dashboard-header')
expect(document.querySelector('.dashboard-content')?.children).toHaveLength(5)
expect(
  [...document.querySelector('.dashboard-content')!.children].map((element) => element.className)
).toEqual([
  'status-grid',
  'platform-grid',
  'activity-panel',
  'activity-panel',
  'activity-panel history-panel'
])
```

Render an E1 state for the five-child form and the normal state for the four-child form. Assert
header text, section ARIA values, test IDs, button order and platform-row order.

- [ ] **Step 4: Extend history characterization**

Use deferred list/PDF/clear Promises and event spies to prove:

- exact `{ page: 1, pageSize: 50 }` input;
- loading, list failure, empty and populated precedence;
- no update after unmount;
- three exact unsubscribes once each;
- events after unmount do not render;
- PDF OPEN/REVEAL success, NOT_FOUND and rejection text;
- clear success/rejection and shared busy lock;
- table/header/row/action DOM hierarchy and exact class names;
- `NADA_CONSTA`, null classification, all four statuses, zero/seconds/minutes duration.

- [ ] **Step 5: Add the CSS hash contract**

```ts
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('renderer CSS contract', () => {
  it('preserva byte a byte o CSS aceito na Stage 7', () => {
    const css = readFileSync('src/renderer/src/assets/main.css')
    const hash = createHash('sha256').update(css).digest('hex').toUpperCase()

    expect(hash).toBe('949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6')
  })
})
```

- [ ] **Step 6: Run characterization and mutation proofs**

Run:

```powershell
pnpm run test -- tests/unit/renderer
```

Expected: all characterization passes on the baseline. Temporarily change one dashboard class and
one CSS byte; confirm the respective tests fail; restore both and rerun GREEN. Record exact counts.

- [ ] **Step 7: Record the uncommitted checkpoint**

Run `pnpm run typecheck:web`, affected ESLint/Prettier, `git diff --check` and `git status --short`.
Do not stage or commit.

---

### Task 2: Introduce the Typed Renderer API Gateway

**Files:**

- Create: `src/renderer/src/api/agent-api.ts`
- Create: `tests/unit/renderer/agent-api.test.ts`

**Interfaces:**

- Consumes: global `window.agent: AgentApi` declared by preload types.
- Produces:

```ts
import type { AgentApi } from '../../../shared/types/agent-api'

export function getAgentApi(): AgentApi
```

- [ ] **Step 1: Write gateway RED**

```ts
it('retorna a referência atual sem cache ou transformação', () => {
  const first = createAgentApiFake('first')
  const second = createAgentApiFake('second')

  Object.defineProperty(window, 'agent', { configurable: true, value: first })
  expect(getAgentApi()).toBe(first)

  Object.defineProperty(window, 'agent', { configurable: true, value: second })
  expect(getAgentApi()).toBe(second)
})
```

The fake implements all five typed API groups with resolved Promises and inert unsubscribe
callbacks. Do not use a partial cast in this contract.

- [ ] **Step 2: Verify RED**

Run the new test. Expected: missing module import failure.

- [ ] **Step 3: Implement the gateway**

```ts
import type { AgentApi } from '../../../shared/types/agent-api'

export function getAgentApi(): AgentApi {
  return window.agent
}
```

- [ ] **Step 4: Verify GREEN and mutation sensitivity**

Run the focused test. Temporarily cache `window.agent` at module scope; confirm the replacement
identity assertion fails; restore the getter and rerun GREEN.

- [ ] **Step 5: Record checkpoint without commit**

Run web typecheck, affected lint/format, privacy scan, diff-check and status.

---

### Task 3: Extract the Pure Dashboard Model

**Files:**

- Create: `src/renderer/src/features/dashboard/dashboard-model.ts`
- Create: `tests/unit/renderer/dashboard-model.test.ts`
- Modify: `src/renderer/src/components/AgentDashboard.tsx`
- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`

**Interfaces:**

```ts
export type DashboardActionName =
  | 'browser-start'
  | 'browser-stop'
  | 'agent-start'
  | 'agent-pause'
  | 'agent-resume'
  | 'agent-stop'
  | 'login-completed'

export interface OperationalLogEntry {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: string
}

export interface DashboardControlState {
  browserRunning: boolean
  operationBusy: boolean
  canStartAgent: boolean
  canPauseAgent: boolean
  canResumeAgent: boolean
  canStopAgent: boolean
  waitingLogin: boolean
}

export const INITIAL_BROWSER_SNAPSHOT: BrowserManagerSnapshot
export const INITIAL_AGENT_SNAPSHOT: AgentPublicState
export const INITIAL_SESSIONS_SNAPSHOT: PlatformSessionsSnapshot
export function formatDashboardState(state: string): string
export function formatSessionState(state: PlatformSessionState): string
export function formatLogTime(date: Date): string
export function getDashboardControlState(
  browserState: BrowserManagerState,
  agentStatus: AgentPublicStatus,
  busyAction: DashboardActionName | null
): DashboardControlState
```

- [ ] **Step 1: Write model RED**

Table-test all labels, snapshots and the full control matrix. Exact assertions include:

```ts
expect(formatDashboardState('WAITING_QUEUE')).toBe('WAITING QUEUE')
expect(formatSessionState('AUTHENTICATED')).toBe('Autenticado')
expect(formatSessionState('WAITING_LOGIN')).toBe('Aguardando login')
expect(formatSessionState('INDETERMINATE')).toBe('Indeterminado')
expect(formatLogTime(new Date('2026-07-14T10:00:05'))).toMatch(/^10:00:05$/)
```

- [ ] **Step 2: Verify RED**

Run model tests and expect missing-module failure.

- [ ] **Step 3: Move the pure rules verbatim**

Implement exported constants/functions with the existing values and conditions. `formatLogTime`
must keep `toLocaleTimeString('pt-BR', { hour, minute, second })`.

- [ ] **Step 4: Replace local dashboard declarations**

Delete the duplicated types, snapshots and formatters from `AgentDashboard.tsx`. Import only from
`dashboard-model.ts` and calculate:

```ts
const controls = getDashboardControlState(browser.state, agent.status, busyAction)
```

Use the named properties in the same existing JSX conditions. Do not change JSX markup.

- [ ] **Step 5: Verify GREEN and ownership mutation**

Run model plus dashboard characterization. Temporarily reintroduce one inline label map in
`AgentDashboard.tsx`; an ownership assertion must fail. Restore and rerun GREEN.

- [ ] **Step 6: Record checkpoint without commit**

Run web typecheck, affected lint/format, CSS hash, diff-check and status.

---

### Task 4: Extract Operational Log and Mounted-State Hooks

**Files:**

- Create: `src/renderer/src/features/dashboard/use-mounted-ref.ts`
- Create: `src/renderer/src/features/dashboard/use-operational-log.ts`
- Create: `tests/unit/renderer/use-operational-log.test.tsx`
- Modify: `src/renderer/src/components/AgentDashboard.tsx`
- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`

**Interfaces:**

```ts
export function useMountedRef(): React.RefObject<boolean>

export interface OperationalLogController {
  logs: readonly OperationalLogEntry[]
  addLog(message: string, type?: OperationalLogEntry['type']): void
}

export function useOperationalLog(): OperationalLogController
```

- [ ] **Step 1: Write mounted/log hook RED**

Using `renderHook`, prove mounted is true after mount and false after unmount. With fake system time,
add eleven entries and assert:

```ts
expect(result.current.logs).toHaveLength(10)
expect(result.current.logs.map(({ message }) => message)).toEqual([
  'evento 11',
  'evento 10',
  'evento 9',
  'evento 8',
  'evento 7',
  'evento 6',
  'evento 5',
  'evento 4',
  'evento 3',
  'evento 2'
])
expect(result.current.logs[0]).toMatchObject({ type: 'info', timestamp: '10:00:00' })
```

- [ ] **Step 2: Verify RED**

Run the new hook test and expect missing modules.

- [ ] **Step 3: Implement hooks**

`useMountedRef` sets a ref true initially and false only in effect cleanup. `useOperationalLog`
uses a functional state update with the existing `Date.now()` ID, `formatLogTime(new Date())`,
newest-first insertion and `.slice(0, 10)`.

- [ ] **Step 4: Integrate only the operational log**

Replace local `logs`, `setLogs` and `addLog` in `AgentDashboard.tsx` with:

```ts
const { logs, addLog } = useOperationalLog()
```

Keep action functions and markup unchanged.

- [ ] **Step 5: Verify GREEN and regression**

Run hook/dashboard/CSS characterization and web typecheck. Mutation: remove `.slice(0, 10)`, observe
the eleven-entry test fail, restore and rerun GREEN.

- [ ] **Step 6: Record checkpoint without commit**

Run affected style checks, diff-check, privacy scan and status.

---

### Task 5: Move Dashboard Effects and Commands into Feature Hooks

**Files:**

- Create: `src/renderer/src/features/dashboard/use-dashboard-actions.ts`
- Create: `src/renderer/src/features/dashboard/use-dashboard-environment.ts`
- Create: `src/renderer/src/features/dashboard/use-agent-control.ts`
- Create: `src/renderer/src/features/dashboard/use-agent-dashboard.ts`
- Create: `tests/unit/renderer/use-dashboard-actions.test.tsx`
- Create: `tests/unit/renderer/use-agent-dashboard.test.tsx`
- Modify: `src/renderer/src/components/AgentDashboard.tsx`
- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`

**Interfaces:**

```ts
export interface DashboardActionInput<T> {
  actionName: DashboardActionName
  action(): Promise<T>
  onSuccess(result: T): void | Promise<void>
  successMessage: string
}

export interface DashboardActionController {
  busyAction: DashboardActionName | null
  runAction<T>(input: DashboardActionInput<T>): Promise<void>
}

export interface DashboardEnvironmentController {
  browser: BrowserManagerSnapshot
  sessions: PlatformSessionsSnapshot
  hydrate(browser: BrowserManagerSnapshot, sessions: PlatformSessionsSnapshot): void
  refresh(): Promise<void>
  startBrowser(): Promise<void>
  stopBrowser(): Promise<void>
}

export interface AgentControlController {
  agent: AgentPublicState
  hydrate(agent: AgentPublicState): void
  startAgent(): Promise<void>
  pauseAgent(): Promise<void>
  resumeAgent(): Promise<void>
  stopAgent(): Promise<void>
  completeLogin(): Promise<void>
}

export interface AgentDashboardController
  extends DashboardEnvironmentController, AgentControlController, OperationalLogController {
  busyAction: DashboardActionName | null
}

export function useAgentDashboard(api?: AgentApi): AgentDashboardController
```

- [ ] **Step 1: Write the global action-runner RED**

Use a deferred primary operation. Assert `busyAction` is set synchronously, concurrent runner calls
do not create a second primary action, success calls `onSuccess` before the success log, primary
failure logs the exact `Error.message`, non-Error failure logs `Falha inesperada.`, and `busyAction`
returns to null in every case.

The runner receives `addLog` and `mountedRef`; it must not update/log after unmount.

- [ ] **Step 2: Write dashboard-controller RED**

Inject a complete typed `AgentApi` fake and prove:

```ts
expect(api.browser.getStatus).toHaveBeenCalledTimes(1)
expect(api.control.getState).toHaveBeenCalledTimes(1)
expect(api.sessions.getStatus).toHaveBeenCalledTimes(1)
expect(api.control.onStateChanged).toHaveBeenCalledTimes(1)
```

Cover the exact seven commands, secondary-refresh swallowing, hydration failure, subscription
updates, unmount during hydration/action and exact unsubscribe. The default call
`useAgentDashboard()` must obtain the API through `getAgentApi()`.

- [ ] **Step 3: Verify RED**

Run the two new tests. Expected: missing hook modules.

- [ ] **Step 4: Implement the shared action runner**

The runner owns the one `busyAction` state. If `busyAction` is non-null, return before invoking a
second action. Otherwise set it, await the primary operation, await `onSuccess`, add the exact log
when mounted, log the primary error when mounted and clear the lock in `finally` when mounted.

- [ ] **Step 5: Implement environment and agent hooks**

Environment starts with `INITIAL_BROWSER_SNAPSHOT`/`INITIAL_SESSIONS_SNAPSHOT`. Its `refresh()` is:

```ts
const [browserSnapshot, sessionSnapshot] = await Promise.all([
  api.browser.getStatus(),
  api.sessions.getStatus()
])
if (!mountedRef.current) return
setBrowser(browserSnapshot)
setSessions(sessionSnapshot)
```

Browser success sets the command result, then attempts only `api.sessions.getStatus()` and swallows
that secondary failure.

Agent starts with `INITIAL_AGENT_SNAPSHOT`, subscribes once to `api.control.onStateChanged`, ignores
events after unmount and calls the exact unsubscribe once. Each agent command uses the shared runner,
sets its returned state, then calls `environment.refresh().catch(() => undefined)`.

- [ ] **Step 6: Implement initial coordinator hydration**

`useAgentDashboard` calls `getAgentApi()` only when no API was injected, composes the hooks and uses
one mount effect containing the exact three-call `Promise.all`. On success, hydrate environment and
agent, then log `Estado inicial carregado.`. On failure, log the existing public/generic error. Guard
both paths after unmount.

- [ ] **Step 7: Replace dashboard local behavior**

`AgentDashboard.tsx` becomes a render composition consumer:

```ts
const dashboard = useAgentDashboard()
const countdownSeconds = useAgentCountdown(
  dashboard.agent.nextCheckAt,
  dashboard.agent.remainingSeconds
)
const controls = getDashboardControlState(
  dashboard.browser.state,
  dashboard.agent.status,
  dashboard.busyAction
)
```

Replace button callbacks with `dashboard.startBrowser`, `stopBrowser`, `startAgent`, `pauseAgent`,
`resumeAgent`, `stopAgent` and `completeLogin`. Do not change the JSX tree.

- [ ] **Step 8: Verify GREEN and mutation proofs**

Run all dashboard hook/component tests. Mutations, one at a time:

- remove subscription cleanup;
- omit session refresh after browser success;
- permit a second action while busy;
- remove the mounted guard from hydration.

Each mutation must fail its named test; restore and rerun GREEN.

- [ ] **Step 9: Run related security/types gate**

Run renderer tests, dashboard production guard, Electron security contract, web typecheck and type
tests.

- [ ] **Step 10: Record checkpoint without commit**

Run affected lint/format, CSS hash, privacy, diff-check and status.

---

### Task 6: Extract Dashboard Presentation Components

**Files:**

- Create: `src/renderer/src/features/dashboard/StatusIndicator.tsx`
- Create: `src/renderer/src/features/dashboard/DashboardHeader.tsx`
- Create: `src/renderer/src/features/dashboard/BrowserStatusPanel.tsx`
- Create: `src/renderer/src/features/dashboard/AgentStatusPanel.tsx`
- Create: `src/renderer/src/features/dashboard/PlatformSessionsPanel.tsx`
- Create: `src/renderer/src/features/dashboard/AgentErrorPanel.tsx`
- Create: `src/renderer/src/features/dashboard/OperationalLogPanel.tsx`
- Modify: `src/renderer/src/components/AgentDashboard.tsx`
- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`
- Modify: `tests/unit/security/dashboard-production-guard.test.ts`

**Interfaces:**

```ts
export interface DashboardHeaderProps {
  agentStatus: AgentPublicStatus
}

export interface BrowserStatusPanelProps {
  browser: BrowserManagerSnapshot
  controls: DashboardControlState
  onStart(): void
  onStop(): void
}

export interface AgentStatusPanelProps {
  agent: AgentPublicState
  countdownSeconds: number | null
  controls: DashboardControlState
  onStart(): void
  onPause(): void
  onResume(): void
  onStop(): void
  onLoginCompleted(): void
}

export interface PlatformSessionsPanelProps {
  sessions: PlatformSessionsSnapshot
}

export interface AgentErrorPanelProps {
  error: AgentPublicError
}

export interface OperationalLogPanelProps {
  logs: readonly OperationalLogEntry[]
}
```

- [ ] **Step 1: Strengthen presentation-boundary RED**

Extend the production guard to read all renderer sources recursively and assert that files exported
as presentation components contain none of:

```ts
;[/\bwindow\b/, /\buseEffect\b/, /\buseState\b/, /getAgentApi/, /\.agent\./]
```

Before extraction, assert that expected component paths exist; observe RED because they do not.

- [ ] **Step 2: Extract `StatusIndicator` and header**

Move the exact current `<span className=...>` indicator and `<header className="dashboard-header">`
markup. `DashboardHeader` computes only labels through pure model functions. Run dashboard structure
tests after this extraction.

- [ ] **Step 3: Extract browser and agent panels**

Move the two existing `<article className="status-panel">` nodes without adding wrappers. Callbacks
receive no arguments and the button handlers remain `onClick={() => void onStart()}` form, retaining
void-Promise behavior and disabled conditions from `controls`.

- [ ] **Step 4: Extract sessions, error and log panels**

Move the exact two-row `.platform-grid`, optional E1 `.activity-panel` and operational-log
`.activity-panel`. `AgentErrorPanel` receives a non-null error, so the parent retains the conditional.
`OperationalLogPanel` retains `aria-live="polite"`, count text and empty state.

- [ ] **Step 5: Reduce the public dashboard root**

The root must render exactly:

```tsx
<div className="dashboard-shell">
  <DashboardHeader agentStatus={dashboard.agent.status} />
  <main className="dashboard-content">
    <section className="status-grid" aria-label="Estados operacionais">
      <BrowserStatusPanel />
      <AgentStatusPanel />
    </section>
    <PlatformSessionsPanel sessions={dashboard.sessions} />
    {dashboard.agent.lastError ? <AgentErrorPanel error={dashboard.agent.lastError} /> : null}
    <OperationalLogPanel logs={dashboard.logs} />
    <ResearchHistoryPanel />
  </main>
</div>
```

Supply every required prop/callback from the controller; no prop may cause a new DOM wrapper.

- [ ] **Step 6: Verify structural and behavioral GREEN**

Run dashboard/controller/structure/CSS/security tests. Mutation: wrap one extracted component in an
extra `<div>`; confirm the direct-child structure test fails; restore and rerun GREEN.

- [ ] **Step 7: Record checkpoint without commit**

Run web typecheck, affected lint/format, privacy, diff-check and status.

---

### Task 7: Extract the Pure Research History Model

**Files:**

- Create: `src/renderer/src/features/history/research-history-model.ts`
- Create: `tests/unit/renderer/research-history-model.test.ts`
- Modify: `src/renderer/src/components/ResearchHistoryPanel.tsx`
- Modify: `tests/unit/renderer/research-history-panel.test.tsx`

**Interfaces:**

```ts
export const RESEARCH_HISTORY_PAGE_SIZE = 50
export function formatHistoryDate(value: string | null): string
export function formatHistoryDuration(durationMs: number | null): string
export function formatResearchClassification(
  classification: ResearchHistoryRecord['classification']
): string
export function formatResearchStatus(status: ResearchHistoryRecord['status']): string
export function upsertResearchHistoryRecord(
  records: readonly ResearchHistoryRecord[],
  record: ResearchHistoryRecord
): ResearchHistoryRecord[]
```

- [ ] **Step 1: Write pure model RED**

Cover:

```ts
expect(formatHistoryDate(null)).toBe('—')
expect(formatHistoryDuration(null)).toBe('—')
expect(formatHistoryDuration(0)).toBe('0s')
expect(formatHistoryDuration(59_600)).toBe('1min 0s')
expect(formatResearchClassification('CONSTA_RESTRICAO')).toBe('Consta restrição')
expect(formatResearchClassification('HA_INFORMACOES')).toBe('Há informações')
expect(formatResearchClassification('NADA_CONSTA')).toBe('—')
expect(formatResearchClassification(null)).toBe('—')
```

Assert all four status labels. Freeze the input array/records, perform created and updated upserts,
and prove descending `startedAt` order without mutation.

- [ ] **Step 2: Verify RED and implement GREEN**

Run the new test and expect missing module. Move the current functions and constant verbatim, change
the upsert input to readonly, and run GREEN.

- [ ] **Step 3: Replace local model code**

Delete `PAGE_SIZE`, formatting and upsert functions from `ResearchHistoryPanel.tsx`; import the
canonical exports. Keep effect, actions and markup unchanged.

- [ ] **Step 4: Mutation-proof ordering and mapping**

Temporarily reverse the sort comparator and swap one classification label. Each focused assertion
must fail. Restore and rerun model plus panel GREEN.

- [ ] **Step 5: Record checkpoint without commit**

Run web typecheck, affected lint/format, CSS/privacy/diff/status gates.

---

### Task 8: Move History Effects and Commands into Its Hook

**Files:**

- Create: `src/renderer/src/features/history/use-research-history.ts`
- Create: `tests/unit/renderer/use-research-history.test.tsx`
- Modify: `src/renderer/src/components/ResearchHistoryPanel.tsx`
- Modify: `tests/unit/renderer/research-history-panel.test.tsx`

**Interfaces:**

```ts
export interface ResearchHistoryController {
  records: readonly ResearchHistoryRecord[]
  loading: boolean
  busy: boolean
  feedback: string | null
  openPdf(pdfPath: string): Promise<void>
  revealPdf(pdfPath: string): Promise<void>
  clearHistory(): Promise<void>
}

export function useResearchHistory(api?: AgentApi): ResearchHistoryController
```

- [ ] **Step 1: Write hook RED**

Inject a complete typed API fake. Prove exact list input, loading transitions, list success/failure,
unmount during pending list, created/updated/cleared events, exact three unsubscribes, ignored events
after unmount, PDF results/errors, clear results/errors and the shared busy lock.

Explicit result assertions:

```ts
expect(result.current.feedback).toBe('PDF não encontrado.')
expect(result.current.feedback).toBe('PDF aberto.')
expect(result.current.feedback).toBe('PDF localizado na pasta.')
expect(result.current.feedback).toBe('Histórico limpo. Os PDFs foram preservados.')
```

- [ ] **Step 2: Verify RED**

Run the new hook test and expect missing-module failure.

- [ ] **Step 3: Implement list and subscription lifecycle**

The hook defaults to `getAgentApi()`, starts with current state values and uses one effect to call:

```ts
api.history.list({ page: 1, pageSize: RESEARCH_HISTORY_PAGE_SIZE })
```

It subscribes to created/updated/cleared immediately, guards every state update with a mounted ref,
sets loading false in guarded `finally`, and calls all three exact unsubscribe callbacks in cleanup.

- [ ] **Step 4: Implement PDF and clear actions**

Use one internal busy lifecycle. Reject a concurrent action without starting another command. Set
feedback null first, preserve every exact result/error message, clear records only after successful
history clear and reset busy in guarded `finally`.

- [ ] **Step 5: Replace panel state/effects/actions**

`ResearchHistoryPanel` calls `useResearchHistory()` and aliases its values/actions. Button callbacks
become `() => void history.openPdf(record.pdfPath)` and `revealPdf`; the clear button calls
`history.clearHistory`. Keep markup unchanged.

- [ ] **Step 6: Verify GREEN and mutation proofs**

Run hook/panel tests. Mutations:

- omit one unsubscribe;
- update records after unmount;
- allow a second PDF action while busy;
- clear records before the clear command succeeds.

Each must fail; restore and rerun GREEN.

- [ ] **Step 7: Record checkpoint without commit**

Run renderer/security/type/style/CSS/privacy/diff/status gates.

---

### Task 9: Extract the Research History Table Presentation

**Files:**

- Create: `src/renderer/src/features/history/ResearchHistoryTable.tsx`
- Modify: `src/renderer/src/components/ResearchHistoryPanel.tsx`
- Modify: `tests/unit/renderer/research-history-panel.test.tsx`
- Modify: `tests/unit/security/dashboard-production-guard.test.ts`

**Interfaces:**

```ts
export interface ResearchHistoryTableProps {
  records: readonly ResearchHistoryRecord[]
  busy: boolean
  onOpenPdf(pdfPath: string): void
  onRevealPdf(pdfPath: string): void
}
```

- [ ] **Step 1: Add table-boundary RED**

Require the new table path and assert presentation files do not import `getAgentApi`, `useEffect` or
`useState`. Observe missing-file RED.

- [ ] **Step 2: Move the complete table branch**

Move `.history-table-wrapper`, `<table>`, headers, row mapping, status class, duration and PDF action
buttons into `ResearchHistoryTable`. Retain exact tags/classes/text/order. Replace the populated
branch with:

```tsx
<ResearchHistoryTable
  records={history.records}
  busy={history.busy}
  onOpenPdf={(pdfPath) => void history.openPdf(pdfPath)}
  onRevealPdf={(pdfPath) => void history.revealPdf(pdfPath)}
/>
```

- [ ] **Step 3: Remove unsafe path assertions**

Inside the table, narrow once:

```ts
const pdfPath = record.pdfPath
```

Render action buttons only when `pdfPath` is truthy and pass that narrowed string. Do not retain
`record.pdfPath as string`.

- [ ] **Step 4: Verify structural/behavioral GREEN**

Run history hook/model/panel/structure/security tests. Mutation: reorder two table headers and add a
wrapper around the table component; the structural assertions must fail. Restore and rerun GREEN.

- [ ] **Step 5: Record checkpoint without commit**

Run web typecheck, affected lint/format, CSS/privacy/diff/status.

---

### Task 10: Final Architecture Guard, Documentation, Review and Handoff

**Files:**

- Modify: `tests/unit/security/dashboard-production-guard.test.ts`
- Modify: `tests/unit/security/electron-security-contract.test.ts`
- Create: `docs/architecture/renderer.md`
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Review: every Stage 8 production/test/documentation delta

**Interfaces:**

- Consumes: completed Tasks 1–9 and approved Stage 8 specification.
- Produces: enforced renderer boundaries, accurate documentation, final gate evidence and manual
  Windows checklist. No commit or push.

- [ ] **Step 1: Write final architecture-contract RED**

Recursively collect renderer `.ts`/`.tsx` sources and assert:

```ts
expect(filesContaining(/\bwindow\.agent\b/)).toEqual(['src/renderer/src/api/agent-api.ts'])
expect(filesContaining(/\bipcRenderer\b|\bIpcRendererEvent\b/)).toEqual([])
expect(filesContaining(/@electron-toolkit\/preload|\belectronAPI\b/)).toEqual([])
```

Require public component files and every planned feature file. For each presentation component,
reject state/effect hooks, gateway imports and global window access. Require hook/model ownership and
absence of copied label/control/upsert blocks in public components.

- [ ] **Step 2: Verify RED and migrate legacy source guards**

Run dashboard production guard. Expected RED: it still reads only the two original component files
and searches for behavior that moved. Replace those assertions with recursive ownership-aware
checks while preserving manual-start, no-agent-polling, SQLite/history/PDF integration and privacy
contracts.

- [ ] **Step 3: Prove CSS and DOM equivalence**

Run CSS hash and all renderer structural tests. Compare the final rendered signature for normal,
E1, waiting-login, loading, empty and populated-history states against Task 1 characterization.
Record zero structural differences.

- [ ] **Step 4: Write renderer architecture documentation**

Document only implemented facts:

- gateway and preload boundary;
- dashboard hook/component ownership;
- history hook/model/table ownership;
- initial hydration, subscriptions, action locks and cleanup;
- unchanged DOM/CSS contract;
- testing and manual acceptance boundary.

Do not claim a gate or manual result before it exists.

- [ ] **Step 5: Update roadmap with automated checkpoint**

Record actual final counts and status `DONE_AUTOMATED_GATE_ONLY`. List the pending manual renderer
and complete operational-flow checklist. Do not claim commit, merge or push.

- [ ] **Step 6: Run focused final gate**

```powershell
pnpm run test -- tests/unit/renderer tests/unit/preload tests/unit/security/dashboard-production-guard.test.ts tests/unit/security/electron-security-contract.test.ts
```

Record exact file/test counts.

- [ ] **Step 7: Run full final gates once on the final tree**

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

Record every exit code, test/module count and coverage percentage. A sandbox `spawn EPERM` may be
repeated once outside the sandbox and must be documented as environmental.

- [ ] **Step 8: Run final architecture/privacy/scope scans**

Prove:

- only the gateway contains `window.agent`;
- no renderer raw Electron IPC or generic API;
- presentation components contain no state/effect hooks;
- no full CPF literal across Stage 8 source/tests/docs/reports;
- `main.css` hash is unchanged;
- no main/preload/shared/API contract diff;
- no operational automation command was executed.

- [ ] **Step 9: Review the entire Stage 8 diff**

Classify findings as Critical, Important or Minor. Fix every Critical/Important through a new focused
RED/GREEN round and rerun affected plus global gates. A Minor may be deferred only with a concrete
risk/rationale in the report and ledger.

- [ ] **Step 10: Present manual Windows acceptance**

Ask the user to validate exact dashboard appearance, all button states/actions, initial/realtime
state, countdown/log, sessions, E1, history/PDF flows, full CPI → DeskData → PDF → CPI behavior,
normal close, close during initialization and restart.

- [ ] **Step 11: Stop before Git integration**

Keep the Stage 8 tree uncommitted and unstaged. Only after the user explicitly reports
`A — testado e funcionando` may the roadmap/report status change to
`DONE_STAGE_8_MANUAL_ACCEPTED` and a separate Git integration choice be offered.

## Plan Self-Review Matrix

| Specification requirement                                        | Owning task       |
| ---------------------------------------------------------------- | ----------------- |
| Exact baseline DOM/CSS/behavior characterization                 | Task 1            |
| Typed non-caching `window.agent` gateway                         | Task 2            |
| Pure dashboard snapshots/labels/control policy                   | Task 3            |
| Ten-entry operational log and mounted guard                      | Task 4            |
| Initial Promise.all, realtime agent state and global action lock | Task 5            |
| Small pure dashboard presentation components                     | Task 6            |
| Pure history formatting and immutable upsert                     | Task 7            |
| History list/events/PDF/clear hook ownership                     | Task 8            |
| Pure history table without path assertion                        | Task 9            |
| Recursive architecture/security contracts                        | Task 10           |
| Exact DOM/classes/text/ARIA/order                                | Tasks 1, 6, 9, 10 |
| Byte-identical main.css                                          | Tasks 1 and 10    |
| No new feature/dependency/IPC/DTO behavior                       | Tasks 2–10        |
| Full gates, whole-diff review and Windows handoff                | Task 10           |

## Execution Notes

- Worktree: `C:\Users\italo\AppData\Local\Temp\agente-cpi-stage8-renderer`
- Branch: `refactor/stage-8-renderer`
- Binding baseline: `da7606367b6f31e48ecd3d06964419f97db55ea2`
- Baseline gate: 118 test files and 701 tests passed.
- `node_modules` is a local junction to `E:\agente-cpi\node_modules`; it is not a repository
  artifact.
- The Stage 7 worktree/branch is unrelated and must not be modified or removed by this plan.
