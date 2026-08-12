# Stage 7 — Electron Security Design

**Date:** 2026-08-11
**Status:** Implemented; manual Windows acceptance completed
**Depends on:** Stage 6 manual acceptance and commit `f0b85f6`
**Platform:** Windows only

## 1. Objective

Harden the Electron boundary without changing the current functional or visual behavior. Stage 7
must restrict the preload surface, authenticate every inbound IPC call, constrain renderer
navigation and external URL opening, enable renderer sandboxing when compatibility gates pass, and
make shutdown deterministic and exception-safe.

The renderer continues to consume the same `window.agent` methods, channels, DTOs, messages and
event timing. No CSS, layout, copy, automation rule, history format or CPI/DeskData behavior changes.

## 2. Current evidence

The accepted Stage 6 baseline has:

- Electron `39.x`, React `19.x`, TypeScript `5.9.x`, electron-vite `5.x` and Zod `4.x`;
- `contextIsolation: true` and `nodeIntegration: false`;
- `sandbox: false` explicitly configured;
- a typed `window.agent` preload API plus an unused generic `window.electron` exposure;
- fixed public IPC channel constants, but no common sender authorization;
- Zod validation for history-list and PDF paths, but no strict arity validation for all commands;
- `setWindowOpenHandler` denying Electron windows while passing every requested URL directly to
  `shell.openExternal`;
- no `will-navigate`/redirect restriction and no explicit permission-request policy;
- sequential shutdown logic that can skip later cleanup if disposal or repository closure throws.

Fresh baseline evidence in the Stage 7 worktree:

- `pnpm run validate`: 108 test files and 614 tests passed;
- type tests: 3 passed with no type errors;
- ESLint and Prettier: passed with zero warnings.

## 3. Approved decisions

1. Set `sandbox: true` only when focused tests, full validation, build and manual Windows acceptance
   demonstrate compatibility. There is no silent fallback to `sandbox: false`.
2. Open only valid `https:` URLs in the operating-system browser. Deny `http:`, `file:`,
   `javascript:` and every other protocol.
3. Authorize IPC using all three facts: the active main window, its top-level frame and the exact
   approved renderer URL.
4. Remove the unused generic `window.electron` API and retain only `window.agent`.
5. Preserve graceful shutdown ordering, make it idempotent and continue cleanup after individual
   failures. Do not add a forced timeout.
6. Use small central policies and adapters rather than duplicating security logic in the bootstrap
   or individual IPC handlers.

These choices follow Electron's current security guidance for process sandboxing, context
isolation, sender validation, navigation restriction, new-window restriction and safe use of
`shell.openExternal`:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/sandbox

## 4. Architecture

### 4.1 Security modules

Stage 7 introduces focused modules under `src/main/security/`:

- `renderer-location.ts` derives the exact approved renderer location for development and packaged
  production.
- `renderer-ipc-authorizer.ts` verifies the active main `BrowserWindow`, its `webContents`, its main
  frame and the normalized frame URL.
- `secure-ipc-main-registrar.ts` wraps `ipcMain.handle` and rejects unauthorized events before any
  application or infrastructure service runs.
- `navigation-security-policy.ts` parses navigation/window-open URLs and decides whether they are
  the approved renderer location, an allowed external HTTPS URL, or denied.
- `install-window-security.ts` attaches navigation, redirect, new-window and permission guards to
  the main window.
- `main-window-event-sender.ts` sends public events only to the active authorized main window rather
  than broadcasting to every future `BrowserWindow`.

Each module exposes a narrow interface and contains no application or automation business rule.
`src/main/index.ts` remains the Electron composition root.

### 4.2 Approved renderer location

Development accepts only the normalized URL derived from `ELECTRON_RENDERER_URL`. Production
accepts only the normalized file URL for `../renderer/index.html` resolved from the built main
bundle. URL comparison uses the WHATWG `URL` parser and normalized `href`; string-prefix matching is
forbidden.

The existing `file://` production load remains in Stage 7 to avoid mixing protocol migration with
IPC and sandbox hardening. A custom application protocol and Electron fuses are explicitly deferred
to the distribution stage, where packaged-path and installer behavior can be validated together.

## 5. IPC boundary

### 5.1 Inbound authorization

Every handler registration goes through `SecureIpcMainRegistrar`. An event is authorized only when:

1. the active main window exists and is not destroyed;
2. `event.sender` is exactly that window's `webContents`;
3. `event.senderFrame` is exactly `event.sender.mainFrame`;
4. the normalized `senderFrame.url` equals the approved renderer location.

Missing frames, destroyed windows, malformed URLs, subframes, other windows and stale renderer
locations are rejected with a fixed public-safe authorization error. Rejection occurs before input
parsing and before invoking privileged services.

### 5.2 Input contracts

Handlers retain their existing return values and service calls, but every command validates the
complete argument tuple:

- browser, agent-control, session-status and history-clear commands accept zero arguments;
- history-list accepts exactly one strict `{ page, pageSize }` object with the existing limits;
- PDF open/reveal accept exactly one non-empty trimmed path string.

Zod tuple/object schemas provide strict arity and shape checks. Unexpected extra arguments are
rejected. No raw Zod issue, filesystem path or internal error crosses back as a public DTO.

### 5.3 Outbound events

Agent-state and history events keep their existing channels and DTOs. The sender targets only the
active main window when it exists and is not destroyed. Event delivery never broadcasts to unknown
or auxiliary windows.

## 6. Preload and renderer sandbox

The preload exposes exactly one global, `window.agent`, containing the existing browser, control,
session, history and PDF methods. It never exposes `ipcRenderer`, `IpcRendererEvent`, Electron's
generic toolkit API or arbitrary channel names.

Event subscriptions continue to wrap Electron callbacks and pass only the public payload to the
renderer. Each unsubscribe removes exactly the handler created by that subscription.

`src/preload/index.d.ts` declares only `window.agent`. A contract test scans renderer sources to
prove that `window.electron` has no consumer before and after removal.

The main window uses:

```ts
webPreferences: {
  preload: approvedPreloadPath,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}
```

The existing restrictive Content Security Policy is preserved. Web security, insecure content,
experimental Blink features and webviews remain disabled by default.

If the sandboxed preload fails a focused test, Electron build or real Windows validation, Stage 7
stops and records the concrete incompatibility. It does not silently revert the flag.

## 7. Navigation, external URLs and permissions

The main window security installer applies four rules:

1. `will-navigate` allows only the exact approved renderer location and prevents every other
   navigation.
2. Redirect attempts use the same exact-location rule and are denied otherwise.
3. `setWindowOpenHandler` always returns `{ action: 'deny' }`. Before returning, it may schedule
   `shell.openExternal` only for a successfully parsed `https:` URL.
4. The window session installs both `setPermissionCheckHandler` and
   `setPermissionRequestHandler`. Every permission check returns `false`, and every permission
   request invokes its callback exactly once with `false`, because the dashboard does not require
   camera, microphone, geolocation, notifications, MIDI, display capture or other Chromium
   permissions.

Malformed URLs and denied protocols are ignored safely. They never reach `shell.openExternal` and
never create a new Electron window. There is no hostname allowlist because the current UI exposes
no product-owned external-link catalogue; HTTPS is the approved protocol boundary.

## 8. Shutdown

`MainApplicationRuntime.shutdown()` stores and returns one shared shutdown promise. Concurrent or
repeated calls cannot execute cleanup twice.

The existing order remains:

1. request safe agent shutdown;
2. bring the managed browser to quiescence, including pending start or stop operations;
3. unsubscribe agent IPC;
4. unsubscribe history IPC;
5. close the history repository;
6. clear runtime references.

Each step executes through an exception boundary. A failure is recorded with a fixed component
label and a sanitized, bounded message; raw objects, CPF values, selectors and filesystem details
are not logged. Later steps always run. References are cleared in a final step.

The browser owner stores its pending start, stop and shutdown operations. Browser shutdown blocks
new starts with a fixed safe error, awaits `STARTING` and `STOPPING`, closes exactly once any context
created by a pending launch, and settles safely after a launch rejection. It does not change normal
RUNNING-only context access or the public start/stop/status contract.

The application-level `before-quit` guard remains re-entrant. After the shared shutdown settles,
`app.quit()` is called from `finally`, preventing one cleanup failure from trapping the process.
After initialization, the bootstrap checks the quit flag before creating/loading the main window.
No forced timeout or abrupt process exit is introduced.

## 9. Error and privacy rules

- Unauthorized IPC returns one stable generic error and performs no privileged action.
- Invalid command input preserves the existing rejected-Promise behavior but exposes no internal
  stack or raw parsing structure through application DTOs.
- External URL rejection is silent to preserve the current UI.
- Shutdown logging never contains full CPF, PDF paths, profile paths, selectors, URLs with private
  query data or raw exception objects.
- Public event DTOs and history persistence remain byte-for-byte compatible with their current
  types and mappers.

## 10. Testing strategy

Implementation uses test-driven development. Required RED/GREEN coverage includes:

- exact preload global surface and removal of `window.electron`;
- exact command/event channel allowlist;
- authorized main-window/main-frame/exact-URL IPC;
- rejection of another window, subframe, stale URL, malformed URL and destroyed window;
- zero-argument command arity and strict history/PDF tuple schemas;
- service non-invocation when sender or arguments are rejected;
- event delivery only to the active main window;
- navigation and redirect table tests;
- valid HTTPS external opening and denial of HTTP, file, JavaScript, custom and malformed URLs;
- new-window denial regardless of URL;
- permission-check denial for distinct permissions/origins and permission-request denial exactly
  once;
- sandbox/context-isolation/node-integration/CSP contracts;
- pending browser launch plus concurrent shutdown, post-shutdown start rejection, exactly-once
  context close, pending stop wait and launch-rejection settlement;
- bootstrap guard before `createWindow()` when quitting began during initialization;
- shutdown ordering, concurrent calls, repeated calls and one failure at every cleanup boundary;
- preservation of the primary failure and execution of all later cleanup steps.

Required automated gates:

1. focused RED/GREEN suites;
2. related main/preload/renderer regression suites;
3. `pnpm run validate`;
4. `pnpm run build`;
5. `pnpm run test:coverage`;
6. `git diff --check`;
7. scans for generic Electron exposure, unguarded IPC handlers, unsafe `shell.openExternal`,
   navigation gaps and full CPF literals.

## 11. Manual Windows acceptance

The user validates the packaged/development application on Windows:

- dashboard opens with the same layout and copy;
- browser start/stop and session status work;
- continuous agent start/login/pause/resume/stop work;
- CPI → DeskData → PDF → CPI remains unchanged;
- history list, clear, live events, PDF open and PDF reveal work;
- external HTTPS links, if exercised, open only in the system browser;
- no unexpected Electron windows or permission prompts appear;
- closing the application during initialization/bootstrap waits for shutdown and terminates
  normally;
- application close waits for safe automation cleanup and terminates normally;
- restart reopens the same operational state expected from the accepted baseline.

Stage 7 is not complete until the user explicitly reports that this checklist works.

The user completed this checklist on 2026-08-12 and explicitly reported
`A — testado e funcionando`.

## 12. Non-goals

- no renderer component refactor or visual change;
- no application/domain/automation behavior change;
- no IPC channel or DTO rename;
- no Electron major-version upgrade;
- no custom application protocol or Electron fuse configuration;
- no forced shutdown timeout;
- no macOS/Linux support;
- no commit, push or publication before explicit manual acceptance.

## 13. Completion criteria

Stage 7 is accepted only when:

- all approved policies are implemented without contract drift;
- `sandbox: true` remains enabled through automated and manual validation;
- all automated gates pass with zero lint/type/format/test/build errors;
- whole-diff review has zero open Critical or Important findings;
- manual Windows acceptance is explicit;
- the working tree is reviewed before any commit or integration decision.
