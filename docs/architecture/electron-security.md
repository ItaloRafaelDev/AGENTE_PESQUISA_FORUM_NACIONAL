# Electron Security Boundary

## Scope and status

Stage 7 hardens the Electron main/preload boundary without changing renderer layout, public
`window.agent` methods, IPC channel names, DTOs or automation rules. The implementation is Windows
only.

Automated evidence is recorded in the Stage 7 checkpoint of the refactoring roadmap. Manual
Windows acceptance remains pending; this document does not claim that the operational CPI,
DeskData or PDF flow, or closing the application during initialization/bootstrap, has been
exercised.

## Approved renderer location

`src/main/security/renderer-location.ts` resolves one approved renderer URL and compares candidate
URLs by their normalized WHATWG `URL.href` value. Prefix matches are not accepted.

- In development, the approved location is the normalized value of `ELECTRON_RENDERER_URL`. A
  missing variable selects the production path; an empty or malformed value is rejected with the
  fixed message `URL de desenvolvimento do renderer inválida.`.
- In packaged production, the approved location is the `file:` URL produced by `pathToFileURL` for
  `../renderer/index.html`, resolved from the built main bundle.
- Candidate URLs that are malformed or differ by path, query, fragment, origin or protocol are not
  approved.

The bootstrap uses the same renderer HTML path for the production policy and `loadFile`. The
development loader keeps using the configured development URL.

## Inbound IPC

All production command registrars receive `SecureIpcMainRegistrar`; the Electron `ipcMain` instance
is wrapped once in `src/main/index.ts`. For each invocation, authorization runs before the command
listener and therefore before argument parsing or a privileged service call.

`RendererIpcAuthorizer` accepts an event only when all of these conditions hold:

1. the current main window exists and is not destroyed;
2. `event.sender` is exactly the main window's `webContents`;
3. `event.senderFrame` exists and is exactly that `webContents.mainFrame`;
4. the normalized `senderFrame.url` exactly equals the approved renderer URL.

Another window, a subframe, a stale or malformed renderer URL, a missing frame and a destroyed main
window are rejected with only `Origem IPC não autorizada.`. Once authorization succeeds, the secure
registrar preserves the listener's synchronous or asynchronous result and its service error.

### Argument contracts

`src/main/ipc/ipc-argument-contracts.ts` validates the complete argument tuple with strict Zod
schemas:

- browser start/stop/status, agent get-state/start/pause/resume/stop/login-completed, session status
  and history clear accept exactly zero arguments;
- history list accepts exactly one strict `{ page, pageSize }` object, with positive integers and a
  maximum `pageSize` of 100;
- PDF open and reveal accept exactly one non-empty string and use its trimmed value.

Extra arguments, extra object properties and invalid values are rejected before the service call.
The public error is always `Argumentos IPC inválidos.`; raw Zod issues and invalid input values are
not included.

## Outbound events

`MainWindowEventSender` resolves the current main window for every send. Agent-state and history
events keep their existing shared channel constants and payload DTOs, but delivery occurs only when
that window exists and is not destroyed. The runtime no longer broadcasts events to all Electron
windows.

## Navigation, external URLs and permissions

`installWindowSecurity` is installed immediately after `new BrowserWindow` and before renderer
loading.

- `will-navigate` and `will-redirect` read the Electron 39 event's `url` and prevent every location
  other than the exact approved renderer URL.
- `setWindowOpenHandler` always returns `{ action: 'deny' }`, so requested content never creates a
  new Electron window.
- A denied window-open request may be forwarded to the operating-system browser only when WHATWG
  parsing succeeds and the protocol is exactly `https:`. The policy is protocol-only: it has no
  hostname allowlist and valid HTTPS userinfo is not removed. HTTP, file, JavaScript, mail, custom
  protocols and malformed values never reach `shell.openExternal`.
- A rejection from `shell.openExternal` is consumed without retry or UI contract change.
- The main window's session installs both Electron 39 permission boundaries. Every synchronous
  permission check returns `false` regardless of web contents, permission, requesting origin or
  details. Every permission request invokes its callback once with `false`.

## Preload and BrowserWindow isolation

The preload exposes exactly one global through the context bridge: `window.agent`. Its existing
`browser`, `control`, `sessions`, `history` and `pdf` groups remain unchanged. Event callbacks still
remove the exact Electron listener installed for each subscription.

Neither the generic Electron toolkit API nor arbitrary `send`/`invoke` functions are exposed to the
renderer. `src/preload/index.d.ts` declares only `window.agent: AgentApi`.

The single main `BrowserWindow` has these explicit preferences:

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}
```

The renderer keeps its existing CSP directives for self-hosted scripts and content, inline styles
and data images. Web security is not disabled, insecure content and experimental Blink features are
not enabled, and no webview is introduced.

## Initialization and shutdown

`ApplicationRuntimeLifecycle` owns one initialization promise and one shutdown promise. A shutdown
request made during initialization waits for that initialization to settle; a rejected
initialization still proceeds to cleanup. Initialization requested after shutdown has begun is
refused with a fixed safe error.

`ApplicationShutdown` creates and executes exactly six steps in this order:

1. request safe agent shutdown (`AGENT`);
2. bring the managed browser to quiescence (`BROWSER`);
3. unsubscribe agent IPC (`AGENT_IPC`);
4. unsubscribe history IPC (`HISTORY_IPC`);
5. close the history repository (`HISTORY_REPOSITORY`);
6. clear the runtime references (`RUNTIME_REFERENCES`).

Concurrent and later shutdown calls receive the same stored promise, so the sequence runs once.
Each step has its own exception boundary; a synchronous throw or asynchronous rejection reports
only `Falha no encerramento seguro: <COMPONENT>` and later steps continue. Failure reporting is also
isolated so it cannot interrupt cleanup. The production step factory is the fixed six-element array
above; isolation begins after that factory returns.

`BrowserManager` owns its start, stop and shutdown promises. Once shutdown begins, a new start is
rejected with a fixed safe error. Shutdown awaits a pending `STARTING` launch or `STOPPING` close; a
context produced by a pending launch is closed exactly once, and a rejected launch still settles the
shutdown path. Normal start/stop/status behavior remains unchanged before shutdown.

The first `before-quit` event is prevented and marks shutdown as pending. After the shared shutdown
promise settles, `app.quit()` is retried from `finally`. No forced timeout or `process.exit` is used.
After initialization resolves, the bootstrap checks `isQuitting` before calling `createWindow`, so a
quit already in progress cannot create or load the renderer. A composition contract tests this guard;
the manual Windows acceptance exercised the real Electron timing by closing while initialization
was in progress. The user reported the checklist as tested and working on 2026-08-12.

## Explicit deferrals

Stage 7 keeps the packaged renderer on `file:`. A custom application protocol and Electron fuse
configuration are deferred to the distribution stage so packaged paths, installer behavior and
release hardening can be validated together. A forced shutdown timeout and any Electron major
upgrade are also outside this stage.
