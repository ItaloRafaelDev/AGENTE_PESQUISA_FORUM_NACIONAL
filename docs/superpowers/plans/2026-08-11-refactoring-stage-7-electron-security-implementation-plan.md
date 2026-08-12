# Stage 7 Electron Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Electron main/preload boundary while preserving every current renderer,
automation, history and PDF behavior.

**Architecture:** Introduce small main-process security policies for renderer location, IPC sender
authorization, navigation and event delivery. Keep business behavior in the existing handlers and
services, expose only `window.agent`, enable the renderer sandbox, and run shutdown through one
idempotent exception-safe sequence.

**Tech Stack:** Electron 39.x, electron-vite 5.x, TypeScript 5.9.x, Zod 4.x, Vitest 4.x, React 19.x,
pnpm, Windows.

**Specification:**
`docs/superpowers/specs/2026-08-11-refactoring-stage-7-electron-security-design.md`

## Global Constraints

- Windows is the only supported operating system.
- Preserve current `window.agent` method names, IPC channel strings, DTO shapes, responses and
  event timing.
- Do not change renderer text, layout, CSS, responsiveness or user interactions.
- Do not change CPI, DeskData, browser, PDF, history, pause, resume or stop behavior.
- Keep `contextIsolation: true` and `nodeIntegration: false`.
- `sandbox: true` must survive focused tests, full validation, build and manual Windows acceptance;
  there is no silent fallback.
- Only valid `https:` URLs may reach `shell.openExternal`.
- Full CPF must never be written to source, tests, fixtures, docs, logs, errors or reports. Use only
  the established synthetic zero-valued fixture when a CPF-shaped test value is unavoidable.
- No Electron major upgrade, custom application protocol, fuse configuration or forced shutdown
  timeout belongs to Stage 7.
- Do not stage, commit, push or publish any Stage 7 change before explicit manual acceptance. Every
  task ends at an uncommitted checkpoint.
- Use TDD for every production change: observe the focused RED, implement the minimum GREEN, then
  run the related regression gate.
- Do not reduce or skip a gate because a focused test passed.

## File Map

### New production modules

- `src/main/security/renderer-location.ts` — normalize and compare the one approved renderer URL.
- `src/main/security/renderer-ipc-authorizer.ts` — authenticate main window, main frame and URL.
- `src/main/security/secure-ipc-main-registrar.ts` — authorize every `ipcMain.handle` invocation.
- `src/main/ipc/ipc-argument-contracts.ts` — strict safe parsers for every inbound argument tuple.
- `src/main/security/main-window-event-sender.ts` — target events only at the active main window.
- `src/main/security/navigation-security-policy.ts` — classify renderer and external navigation.
- `src/main/security/install-window-security.ts` — install navigation/window/permission guards.
- `src/main/lifecycle/application-shutdown.ts` — execute cleanup once, in order, despite failures.

### Existing production modules modified

- `src/main/index.ts` — compose policies, hold the main-window reference, enable sandbox and install
  window guards.
- `src/main/main-application-runtime.ts` — consume the secure registrar/event sender and delegate
  shutdown sequencing.
- `src/main/ipc/register-*.ts` — validate complete argument tuples without changing service calls.
- `src/preload/index.ts` — remove the generic Electron exposure.
- `src/preload/index.d.ts` — declare only `window.agent`.

### New test modules

- `tests/unit/main/security/renderer-location.test.ts`
- `tests/unit/main/security/renderer-ipc-authorizer.test.ts`
- `tests/unit/main/security/secure-ipc-main-registrar.test.ts`
- `tests/unit/main/ipc/ipc-argument-contracts.test.ts`
- `tests/unit/main/security/main-window-event-sender.test.ts`
- `tests/unit/main/security/navigation-security-policy.test.ts`
- `tests/unit/main/security/install-window-security.test.ts`
- `tests/unit/main/lifecycle/application-shutdown.test.ts`
- `tests/unit/security/electron-security-contract.test.ts`

---

### Task 1: Approved Renderer Location

**Files:**

- Create: `src/main/security/renderer-location.ts`
- Create: `tests/unit/main/security/renderer-location.test.ts`

**Interfaces:**

- Consumes: development URL string and packaged renderer HTML path.
- Produces:

```ts
export interface RendererLocationInput {
  developmentUrl: string | undefined
  productionHtmlPath: string
}

export function resolveApprovedRendererUrl(input: RendererLocationInput): URL
export function isApprovedRendererUrl(candidate: string, approved: URL): boolean
```

- [ ] **Step 1: Write the renderer-location RED**

Create table-driven tests proving:

```ts
expect(
  resolveApprovedRendererUrl({
    developmentUrl: 'http://127.0.0.1:5173/',
    productionHtmlPath: 'C:\\app\\out\\renderer\\index.html'
  }).href
).toBe('http://127.0.0.1:5173/')

expect(
  resolveApprovedRendererUrl({
    developmentUrl: undefined,
    productionHtmlPath: 'C:\\app\\out\\renderer\\index.html'
  }).protocol
).toBe('file:')

expect(isApprovedRendererUrl('http://127.0.0.1:5173/', approved)).toBe(true)
expect(isApprovedRendererUrl('http://127.0.0.1:5173/other', approved)).toBe(false)
expect(isApprovedRendererUrl('not a url', approved)).toBe(false)
```

Also prove that an empty/malformed development URL throws the fixed message
`URL de desenvolvimento do renderer inválida.` rather than leaking the parser error.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm run test -- tests/unit/main/security/renderer-location.test.ts
```

Expected: FAIL because `@/main/security/renderer-location` does not exist.

- [ ] **Step 3: Implement the minimum URL policy**

Use `pathToFileURL` for production and the WHATWG `URL` constructor for both paths:

```ts
import { pathToFileURL } from 'node:url'

export function resolveApprovedRendererUrl(input: RendererLocationInput): URL {
  if (input.developmentUrl !== undefined) {
    try {
      return new URL(input.developmentUrl)
    } catch {
      throw new Error('URL de desenvolvimento do renderer inválida.')
    }
  }

  return pathToFileURL(input.productionHtmlPath)
}

export function isApprovedRendererUrl(candidate: string, approved: URL): boolean {
  try {
    return new URL(candidate).href === approved.href
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Verify GREEN and related URL behavior**

Run the focused test, then:

```powershell
pnpm run test -- tests/unit/config/windows-only-project-contract.test.ts
pnpm run typecheck:node
```

Expected: all pass.

- [ ] **Step 5: Record the uncommitted checkpoint**

Run `git diff --check` and `git status --short`. Do not stage or commit.

---

### Task 2: IPC Sender Authorization and Secure Registrar

**Files:**

- Create: `src/main/security/renderer-ipc-authorizer.ts`
- Create: `src/main/security/secure-ipc-main-registrar.ts`
- Create: `tests/unit/main/security/renderer-ipc-authorizer.test.ts`
- Create: `tests/unit/main/security/secure-ipc-main-registrar.test.ts`

**Interfaces:**

- Consumes: `() => RendererWindowLike | null`, approved `URL`, and an `ipcMain`-compatible registrar.
- Produces:

```ts
export const UNAUTHORIZED_IPC_MESSAGE = 'Origem IPC não autorizada.'

export interface RendererFrameLike {
  readonly url: string
}

export interface RendererWebContentsLike {
  readonly mainFrame: RendererFrameLike
}

export interface RendererWindowLike {
  readonly webContents: RendererWebContentsLike
  isDestroyed(): boolean
}

export interface IpcInvokeEventLike {
  readonly sender: RendererWebContentsLike
  readonly senderFrame: RendererFrameLike | null
}

export type IpcHandler = (event: unknown, ...arguments_: unknown[]) => unknown

export interface IpcMainRegistrar {
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}

export interface IpcEventAuthorizer {
  assertAuthorized(event: unknown): void
}

export class RendererIpcAuthorizer implements IpcEventAuthorizer {
  constructor(getMainWindow: () => RendererWindowLike | null, approvedRendererUrl: URL)
  assertAuthorized(event: unknown): void
}

export class SecureIpcMainRegistrar {
  constructor(ipcMain: IpcMainRegistrar, authorizer: IpcEventAuthorizer)
  handle(channel: string, listener: IpcHandler): void
  removeHandler(channel: string): void
}
```

- [ ] **Step 1: Write the authorizer RED**

Build structural fakes for a window, web contents and frame. Prove authorization only when all
identities and the URL match. The table must independently reject:

```ts
;[
  'missing window',
  'destroyed window',
  'different sender webContents',
  'missing senderFrame',
  'subframe instead of mainFrame',
  'different renderer URL',
  'malformed renderer URL'
]
```

For each rejection, assert the fixed message and no private URL in the error.

- [ ] **Step 2: Verify authorizer RED**

Run:

```powershell
pnpm run test -- tests/unit/main/security/renderer-ipc-authorizer.test.ts
```

Expected: FAIL on the missing production module.

- [ ] **Step 3: Implement identity-first authorization**

Use narrow structural interfaces. Check identities before parsing the URL:

```ts
assertAuthorized(rawEvent: unknown): void {
  const event = rawEvent as Partial<IpcInvokeEventLike>
  const mainWindow = this.getMainWindow()

  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    !event.senderFrame ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    !isApprovedRendererUrl(event.senderFrame.url, this.approvedRendererUrl)
  ) {
    throw new Error(UNAUTHORIZED_IPC_MESSAGE)
  }
}
```

- [ ] **Step 4: Write and verify the secure-registrar RED**

Prove that `handle()` registers one wrapper, the wrapper calls authorization before the listener,
unauthorized calls never invoke the listener, sync/async results are preserved, thrown service
errors remain primary after authorization, and `removeHandler()` delegates the exact channel.

Run:

```powershell
pnpm run test -- tests/unit/main/security/secure-ipc-main-registrar.test.ts
```

Expected: FAIL because the registrar module is absent.

- [ ] **Step 5: Implement the registrar wrapper**

```ts
handle(channel: string, listener: IpcHandler): void {
  this.ipcMain.handle(channel, (event, ...arguments_) => {
    this.authorizer.assertAuthorized(event)
    return listener(event, ...arguments_)
  })
}

removeHandler(channel: string): void {
  this.ipcMain.removeHandler(channel)
}
```

- [ ] **Step 6: Verify GREEN and mutation sensitivity**

Run both focused files together. Temporarily remove the main-frame identity check, confirm at least
the subframe test fails, restore the check, and rerun to GREEN. Record commands/results; do not keep
the mutation.

- [ ] **Step 7: Record the uncommitted checkpoint**

Run `pnpm run typecheck:node`, `git diff --check` and `git status --short`. Do not stage or commit.

---

### Task 3: Strict IPC Argument Contracts

**Files:**

- Create: `src/main/ipc/ipc-argument-contracts.ts`
- Create: `tests/unit/main/ipc/ipc-argument-contracts.test.ts`
- Modify: `src/main/ipc/register-browser-ipc-handlers.ts`
- Modify: `src/main/ipc/register-session-ipc-handlers.ts`
- Modify: `src/main/ipc/register-pdf-ipc-handlers.ts`
- Modify: `src/main/ipc/register-history-ipc-handlers.ts`
- Modify: `src/main/ipc/register-continuous-agent-ipc-handlers.ts`
- Modify: the five matching test files under `tests/unit/main/ipc/`

**Interfaces:**

- Consumes: `unknown[]` received from an IPC invoke wrapper.
- Produces:

```ts
import type { ResearchHistoryListInput } from '../../application/history/research-history-model'

export const INVALID_IPC_ARGUMENTS_MESSAGE = 'Argumentos IPC inválidos.'
export function parseNoIpcArguments(raw: unknown[]): void
export function parseHistoryListIpcArguments(raw: unknown[]): ResearchHistoryListInput
export function parsePdfPathIpcArguments(raw: unknown[]): string
```

- [ ] **Step 1: Write the argument-contract RED**

Use real Zod-backed parsers. Prove:

```ts
expect(() => parseNoIpcArguments([])).not.toThrow()
expect(() => parseNoIpcArguments(['extra'])).toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)
expect(parseHistoryListIpcArguments([{ page: 1, pageSize: 50 }])).toEqual({ page: 1, pageSize: 50 })
expect(() => parseHistoryListIpcArguments([{ page: 0, pageSize: 50 }])).toThrow(
  INVALID_IPC_ARGUMENTS_MESSAGE
)
expect(() => parseHistoryListIpcArguments([{ page: 1, pageSize: 50, extra: true }])).toThrow(
  INVALID_IPC_ARGUMENTS_MESSAGE
)
expect(parsePdfPathIpcArguments([' E:\\PDF-AGENTE-CPI\\result.pdf '])).toBe(
  'E:\\PDF-AGENTE-CPI\\result.pdf'
)
expect(() => parsePdfPathIpcArguments(['one.pdf', 'two.pdf'])).toThrow(
  INVALID_IPC_ARGUMENTS_MESSAGE
)
```

Assert that no Zod issue array or raw invalid value appears in the thrown message.

- [ ] **Step 2: Verify RED**

Run the new test and expect missing-module failure.

- [ ] **Step 3: Implement safe tuple parsing**

Define `z.tuple([])`, strict history object tuple, and one-path tuple. Use `safeParse`; on failure,
throw only `new Error(INVALID_IPC_ARGUMENTS_MESSAGE)`. Return the normalized successful value.

- [ ] **Step 4: Integrate parsers into all handlers**

Every handler must receive rest arguments and parse before calling its service:

```ts
ipcMain.handle(BROWSER_IPC_CHANNELS.start, (_event, ...rawArguments) => {
  parseNoIpcArguments(rawArguments)
  return browserService.start()
})

ipcMain.handle(HISTORY_IPC_CHANNELS.list, (_event, ...rawArguments) => {
  return mapResearchHistoryPageToDto(
    historyService.list(parseHistoryListIpcArguments(rawArguments))
  )
})

ipcMain.handle(PDF_IPC_CHANNELS.open, (_event, ...rawArguments) => {
  return pdfService.open(parsePdfPathIpcArguments(rawArguments))
})
```

Apply the zero-argument parser to every browser, agent-control, session-status and history-clear
command.

- [ ] **Step 5: Extend handler tests before accepting GREEN**

For each handler family, invoke the captured listener with one unexpected argument and assert:

```ts
await expect(listener({}, 'unexpected')).rejects.toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)
expect(serviceMethod).not.toHaveBeenCalled()
```

Retain every existing success, response, mapping, cleanup and channel-registration assertion.

- [ ] **Step 6: Run the exact handler gate**

Run the parser test plus all five IPC handler tests. Expected: all pass and existing call counts stay
unchanged.

- [ ] **Step 7: Run types and checkpoint**

Run `pnpm run typecheck:node`, `pnpm run test:typecheck`, `git diff --check` and status. Do not stage
or commit.

---

### Task 4: Main-Window Event Targeting and Secure IPC Composition

**Files:**

- Create: `src/main/security/main-window-event-sender.ts`
- Create: `tests/unit/main/security/main-window-event-sender.test.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`
- Modify: `tests/unit/main/ipc/register-continuous-agent-ipc-handlers.test.ts`
- Modify: `tests/unit/main/ipc/register-history-ipc-handlers.test.ts`

**Interfaces:**

- Consumes: `() => MainWindowEventTarget | null` and secure registrar from Task 2.
- Produces:

```ts
export interface MainWindowEventTarget {
  readonly webContents: {
    send(channel: string, payload: unknown): void
  }
  isDestroyed(): boolean
}

export class MainWindowEventSender {
  constructor(getMainWindow: () => MainWindowEventTarget | null)
  send(channel: string, payload: unknown): void
}

export interface MainApplicationRuntimeElectronBoundary {
  ipcMain: SecureIpcMainRegistrar
  eventSender: MainWindowEventSender
}
```

- [ ] **Step 1: Write event-sender RED**

Prove one exact send to a live window and zero sends for missing/destroyed windows. Replace the
provider result between calls and prove events follow only the current window.

- [ ] **Step 2: Verify RED, implement and verify GREEN**

The implementation is intentionally small:

```ts
send(channel: string, payload: unknown): void {
  const mainWindow = this.getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}
```

- [ ] **Step 3: Write the composition RED**

Update the composition guard to require:

- one mutable `mainWindow` reference in `src/main/index.ts`;
- one `RendererIpcAuthorizer` using `() => mainWindow`;
- one `SecureIpcMainRegistrar` wrapping Electron `ipcMain`;
- one `MainWindowEventSender` using the same provider;
- `MainApplicationRuntime` constructed with those two dependencies;
- absence of `BrowserWindow.getAllWindows().forEach` broadcasting in runtime code.

Run the composition guard and expect failure against the current bootstrap.

- [ ] **Step 4: Inject the Electron boundary into runtime**

Replace the global broadcast sender and direct registrations:

```ts
export class MainApplicationRuntime {
  constructor(private readonly electronBoundary: MainApplicationRuntimeElectronBoundary) {}

  async initialize(): Promise<void> {
    // existing service composition remains unchanged
    registerBrowserIpcHandlers(this.electronBoundary.ipcMain, this.browserService)
    registerSessionIpcHandlers(this.electronBoundary.ipcMain, sessionService)
    this.disposeAgentIpc = registerContinuousAgentIpcHandlers(
      this.electronBoundary.ipcMain,
      new ContinuousAgentIpcAdapter(this.agentCoordinator),
      this.electronBoundary.eventSender
    )
    this.disposeHistoryIpc = registerHistoryIpcHandlers(
      this.electronBoundary.ipcMain,
      historyService,
      this.electronBoundary.eventSender
    )
    registerPdfIpcHandlers(this.electronBoundary.ipcMain, pdfFileService)
  }
}
```

Compose dependencies in `index.ts` from one `mainWindow` provider. Do not reorder initialization,
renderer loading or `ready-to-show` behavior.

- [ ] **Step 5: Verify focused and related GREEN**

Run event sender, authorizer, secure registrar, composition guard, all IPC handler tests and preload
tests. Then run `pnpm run typecheck:node`.

- [ ] **Step 6: Record checkpoint without commit**

Run diff-check and status only.

---

### Task 5: Navigation, New-Window and Permission Security

**Files:**

- Create: `src/main/security/navigation-security-policy.ts`
- Create: `src/main/security/install-window-security.ts`
- Create: `tests/unit/main/security/navigation-security-policy.test.ts`
- Create: `tests/unit/main/security/install-window-security.test.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`

**Interfaces:**

```ts
export interface WindowSecurityTarget {
  readonly webContents: {
    on(
      event: 'will-navigate' | 'will-redirect',
      listener: (event: { preventDefault(): void }, url: string) => void
    ): void
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
    readonly session: {
      setPermissionCheckHandler(
        handler: (
          webContents: unknown,
          permission: string,
          requestingOrigin: string,
          details: unknown
        ) => boolean
      ): void
      setPermissionRequestHandler(
        handler: (
          webContents: unknown,
          permission: string,
          callback: (permissionGranted: boolean) => void,
          details: unknown
        ) => void
      ): void
    }
  }
}

export class NavigationSecurityPolicy {
  constructor(approvedRendererUrl: URL)
  isApprovedRendererNavigation(rawUrl: string): boolean
  getApprovedExternalUrl(rawUrl: string): string | null
}

export interface WindowSecurityDependencies {
  openExternal(url: string): Promise<unknown>
}

export function installWindowSecurity(
  mainWindow: WindowSecurityTarget,
  policy: NavigationSecurityPolicy,
  dependencies: WindowSecurityDependencies
): void
```

- [ ] **Step 1: Write navigation-policy RED**

Table-test exact renderer navigation and external protocols:

```ts
expect(policy.isApprovedRendererNavigation(approved.href)).toBe(true)
expect(policy.isApprovedRendererNavigation(`${approved.href}other`)).toBe(false)

expect(policy.getApprovedExternalUrl('https://example.com/path?q=1')).toBe(
  'https://example.com/path?q=1'
)

for (const denied of [
  'http://example.com',
  'file:///C:/Windows/System32/cmd.exe',
  'javascript:alert(1)',
  'mailto:test@example.com',
  'custom:payload',
  'not a url'
]) {
  expect(policy.getApprovedExternalUrl(denied)).toBeNull()
}
```

- [ ] **Step 2: Verify RED and implement pure policy GREEN**

Use only `new URL`, exact approved renderer comparison from Task 1, and protocol equality
`parsed.protocol === 'https:'`.

- [ ] **Step 3: Write installer RED**

Use a fake webContents/session to capture callbacks. Prove:

- approved same-location navigation is not prevented;
- different navigation and redirect call `preventDefault()` exactly once;
- new windows always return `{ action: 'deny' }`;
- valid HTTPS schedules exactly one `openExternal` call;
- denied/malformed URLs never call `openExternal`;
- an `openExternal` rejection is consumed without an unhandled rejection or second call;
- every permission check returns `false` for distinct permissions and requesting origins;
- every permission request invokes its callback exactly once with `false`.

- [ ] **Step 4: Implement and integrate installer**

In the window-open handler:

```ts
const externalUrl = policy.getApprovedExternalUrl(details.url)
if (externalUrl) {
  void dependencies.openExternal(externalUrl).catch(() => undefined)
}
return { action: 'deny' }
```

Install guards immediately after `new BrowserWindow(...)` and before loading the renderer. Remove
the old direct `setWindowOpenHandler` implementation from `index.ts`.

- [ ] **Step 5: Mutation-proof the protocol boundary**

Temporarily accept `http:` alongside `https:` and verify the HTTP denial test fails. Restore the
strict comparison and rerun GREEN.

- [ ] **Step 6: Run the navigation/composition gate**

Run the two new tests, composition guard, Windows project contract and dashboard production guard.
Then run `pnpm run typecheck:node`.

- [ ] **Step 7: Record checkpoint without commit**

Run ESLint/Prettier only on affected files, diff-check and status.

---

### Task 6: Restricted Preload and Renderer Sandbox

**Files:**

- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/preload/continuous-agent-preload-api.test.ts`
- Modify: `tests/unit/security/dashboard-production-guard.test.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`
- Create: `tests/unit/security/electron-security-contract.test.ts`

**Interfaces:**

- Consumes: existing typed `AgentApi` and fixed channel constants.
- Produces: exactly one global declaration and exposure, `window.agent: AgentApi`.

- [ ] **Step 1: Write preload-surface RED**

Change the preload unit test expectation before production code:

```ts
expect(electron.exposeInMainWorld.mock.calls.map(([name]) => name)).toEqual(['agent'])
expect(Object.keys(api)).toEqual(['browser', 'control', 'sessions', 'history', 'pdf'])
```

Add a source contract that scans `src/renderer` and fails on `window.electron`, raw `ipcRenderer`,
`IpcRendererEvent` or arbitrary `send`/`invoke` exposure.

Run both tests; expect RED because the generic toolkit API is still exposed and declared.

- [ ] **Step 2: Remove generic Electron exposure**

Delete:

```ts
import { electronAPI } from '@electron-toolkit/preload'
contextBridge.exposeInMainWorld('electron', electronAPI)
```

Remove `ElectronAPI` and `window.electron` from `src/preload/index.d.ts`. Keep the event wrappers,
`process.contextIsolated` guard and `window.agent` object unchanged.

- [ ] **Step 3: Add sandbox/security contract RED**

The new security contract must require in `src/main/index.ts`:

```ts
sandbox: true
contextIsolation: true
nodeIntegration: false
```

It must also assert absence of `sandbox: false`, `webSecurity: false`,
`allowRunningInsecureContent: true`, `experimentalFeatures: true`, `enableBlinkFeatures`, and
`<webview` in production sources.

Run and observe RED on current `sandbox: false`.

- [ ] **Step 4: Enable sandbox and preserve CSP**

Set `sandbox: true`. Do not change the existing CSP meta tag. Extend the security contract to read
`src/renderer/index.html` and require its current restrictive `default-src`, `script-src`,
`style-src` and `img-src` directives.

- [ ] **Step 5: Run sandbox compatibility gates**

Run:

```powershell
pnpm run test -- tests/unit/preload/continuous-agent-preload-api.test.ts tests/unit/security/electron-security-contract.test.ts tests/unit/security/dashboard-production-guard.test.ts tests/unit/main/main-continuous-composition-guard.test.ts
pnpm run typecheck
pnpm run build
```

Expected: all pass and the preload bundle builds. If build fails because sandboxed preload imports an
unsupported Node/Electron surface, stop and document the exact import; do not revert the flag.

- [ ] **Step 6: Record checkpoint without commit**

Run affected lint/Prettier, diff-check, privacy scan and status.

---

### Task 7: Idempotent Exception-Safe Shutdown

**Files:**

- Create: `src/main/lifecycle/application-shutdown.ts`
- Create: `tests/unit/main/lifecycle/application-shutdown.test.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`

**Interfaces:**

```ts
export type ShutdownComponent =
  'AGENT' | 'BROWSER' | 'AGENT_IPC' | 'HISTORY_IPC' | 'HISTORY_REPOSITORY' | 'RUNTIME_REFERENCES'

export interface ShutdownStep {
  component: ShutdownComponent
  execute(): void | Promise<void>
}

export type ShutdownFailureReporter = (component: ShutdownComponent) => void

export class ApplicationShutdown {
  constructor(createSteps: () => readonly ShutdownStep[], reportFailure: ShutdownFailureReporter)
  run(): Promise<void>
}
```

- [ ] **Step 1: Write shutdown RED**

Prove:

- steps run once and in declared order;
- one sync throw and one async rejection are reported by component while later steps still run;
- the returned promise resolves after all steps even when failures occur;
- concurrent `run()` calls return the same promise identity;
- calls after completion return that same settled promise and do not rerun steps;
- the reporter receives only the component enum, never the raw thrown value.

- [ ] **Step 2: Verify RED and implement the minimum sequence**

```ts
run(): Promise<void> {
  if (!this.operation) {
    this.operation = this.executeOnce()
  }
  return this.operation
}

private async executeOnce(): Promise<void> {
  for (const step of this.createSteps()) {
    try {
      await step.execute()
    } catch {
      this.reportFailure(step.component)
    }
  }
}
```

- [ ] **Step 3: Write runtime integration RED**

Update the source composition guard to require `ApplicationShutdown`, all six component labels, and
a `finally` path from `before-quit` to `app.quit()`. Add a test that rejects raw error logging in the
shutdown path (`console.error(..., error)` or serialization of the caught object).

- [ ] **Step 4: Delegate runtime cleanup without reordering**

Build the steps from current nullable resources. Keep the current conditions and sequence. The final
step clears every runtime reference. Report failures with a fixed safe message plus component label:

```ts
console.error(`Falha no encerramento seguro: ${component}`)
```

Do not include the caught error object.

In `before-quit`, preserve the guard and use:

```ts
void mainRuntime.shutdown().finally(() => {
  app.quit()
})
```

- [ ] **Step 5: Mutation-proof failure continuation**

Temporarily remove the per-step `catch`; verify the test with an early failing step no longer reaches
the repository/reference cleanup assertions. Restore and rerun GREEN.

- [ ] **Step 6: Run shutdown and regression gate**

Run the shutdown test, composition guard, coordinator tests, browser manager tests, history service
tests and all IPC handler tests. Then run Node typecheck.

- [ ] **Step 7: Record checkpoint without commit**

Run affected lint/Prettier, diff-check and status.

#### Final whole-stage review correction

The final review adds one focused RED/GREEN wave without adding a seventh shutdown step:

- `BrowserManager` owns shared start, stop and shutdown operations, rejects new starts after shutdown
  begins, awaits `STARTING`/`STOPPING`, closes a context produced by a pending launch exactly once and
  settles after launch rejection;
- `BrowserWorkspaceService.shutdown()` delegates to that owner, and the existing `BROWSER` step uses
  this quiescent shutdown instead of a `RUNNING` snapshot check;
- the Electron bootstrap checks `isQuitting` after `initialize()` and before `createWindow()`;
- RED/GREEN tests cover pending launch plus shutdown, start after shutdown, exactly-once close,
  pending stop, launch rejection, service delegation and the active bootstrap guard.

---

### Task 8: Whole-Stage Review, Documentation and Handoff

**Files:**

- Create: `docs/architecture/electron-security.md`
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Review: every Stage 7 production/test/documentation delta

**Interfaces:**

- Consumes: completed Tasks 1–7 and the approved design.
- Produces: accurate architecture documentation, automated gate evidence and manual Windows
  checklist. No commit or push.

- [ ] **Step 1: Write the architecture document**

Document the implemented boundary only:

- exact renderer location rules for dev/production;
- inbound IPC authorization sequence;
- strict argument contracts;
- outbound event targeting;
- navigation/new-window/permission rules;
- preload surface and sandbox flags;
- shutdown ordering and failure behavior;
- explicit deferral of custom protocol/fuses.

Do not claim manual acceptance or a gate result before it exists.

- [ ] **Step 2: Add an honest Stage 7 automated checkpoint to the roadmap**

Record the actual counts from the fresh final commands. Status must remain
`DONE_AUTOMATED_GATE_ONLY` until the user tests Windows and explicitly approves.

- [ ] **Step 3: Run focused security gate**

```powershell
pnpm run test -- tests/unit/main/security tests/unit/main/ipc tests/unit/main/lifecycle tests/unit/preload tests/unit/security/electron-security-contract.test.ts tests/unit/main/main-continuous-composition-guard.test.ts
```

Expected: every security, IPC, preload and lifecycle test passes.

- [ ] **Step 4: Run full automated gates once on the final tree**

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

Record exact file/test/module/coverage counts and every command exit code.

- [ ] **Step 5: Run architectural and privacy scans**

Use `rg` to prove:

- no `window.electron` or generic toolkit API exposure;
- no production `ipcMain.handle` registration outside the secure registrar boundary;
- no unvalidated direct `shell.openExternal(details.url)` call;
- no `sandbox: false`, `nodeIntegration: true` or `contextIsolation: false`;
- no full CPF literal in Stage 7 production, tests, docs or reports;
- no unexpected IPC channel string outside shared channel constants.

Every scan command and no-match result must be recorded.

- [ ] **Step 6: Review the complete diff against the specification**

Classify findings as Critical, Important or Minor. Fix all Critical/Important findings through a new
RED/GREEN round and repeat affected plus global gates. Defer a Minor only with explicit rationale in
the handoff.

- [ ] **Step 7: Present the Windows manual checklist**

Ask the user to validate dashboard appearance, browser/session controls, complete CPI → DeskData →
PDF → CPI flow, history/PDF actions, pause/resume/stop, HTTPS external opening, absence of permission
prompts/new Electron windows, closing during initialization/bootstrap, safe close and restart.

- [ ] **Step 8: Stop before Git integration**

Keep all Stage 7 work uncommitted and unstaged. Only after the user explicitly reports that the
manual checklist works may status change to `DONE_STAGE_7_MANUAL_ACCEPTED` and a separate Git
integration decision be offered.

## Plan Self-Review Matrix

| Specification requirement                         | Owning task |
| ------------------------------------------------- | ----------- |
| Exact development/production renderer URL         | Task 1      |
| Window + main-frame + URL IPC authorization       | Task 2      |
| Common secure IPC registrar                       | Task 2      |
| Strict safe argument validation                   | Task 3      |
| Events only to active main window                 | Task 4      |
| Secure composition without broadcast              | Task 4      |
| Navigation/redirect/new-window restrictions       | Task 5      |
| HTTPS-only external opening                       | Task 5      |
| Permission denial                                 | Task 5      |
| Remove generic Electron preload API               | Task 6      |
| Sandbox/context isolation/no Node integration/CSP | Task 6      |
| Ordered idempotent exception-safe shutdown        | Task 7      |
| Full gates, documentation and manual handoff      | Task 8      |

## Execution Notes

- Worktree:
  `C:\Users\italo\AppData\Local\Temp\agente-cpi-stage7-electron-security`
- Branch: `refactor/stage-7-electron-security`
- Binding baseline: `f0b85f6`
- Baseline gate: 108 test files, 614 tests, 3 type tests, no type/lint/format failures.
- The worktree uses a local `node_modules` junction to `E:\agente-cpi\node_modules`; it is not a
  repository artifact.
