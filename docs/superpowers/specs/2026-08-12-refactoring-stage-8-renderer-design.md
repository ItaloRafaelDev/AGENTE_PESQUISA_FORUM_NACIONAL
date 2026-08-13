# Stage 8 — Renderer Refactoring Design

**Date:** 2026-08-12
**Status:** Approved design; implementation not started
**Depends on:** Stage 7 manual acceptance and commit `da76063`
**Platform:** Windows only

## 1. Objective

Refactor the React renderer into smaller feature-focused hooks, pure view-model functions and
presentation components while preserving the exact functional and visual behavior accepted after
Stage 7.

Stage 8 changes internal ownership only. It does not redesign the dashboard, add functionality,
rename public APIs, change Electron IPC, alter automation behavior or modify the rendered DOM and
CSS contract.

## 2. Current evidence

The accepted Stage 7 baseline uses React `19.2.x`, React DOM `19.2.x`, TypeScript `5.9.x`, Vitest
`4.1.x` and Testing Library `16.3.x`. The renderer contains eight source files, with most behavior
concentrated in:

- `AgentDashboard.tsx`: 499 lines mixing IPC access, initial loading, subscriptions, action
  orchestration, state, logging, formatting, control policy and JSX;
- `ResearchHistoryPanel.tsx`: 278 lines mixing history loading, three event subscriptions,
  reconciliation, PDF actions, feedback, formatting and table JSX;
- `main.css`: 394 lines whose current cascade and ordering are manually accepted;
- three renderer test files totaling 603 lines and covering the primary flows, but not the complete
  loading, error, unmount, concurrency and structural matrix.

Fresh Stage 8 worktree baseline:

- branch `refactor/stage-8-renderer` at `da76063`;
- `pnpm test`: 118 files and 701 tests passed;
- `main.css` SHA-256:
  `949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6`.

## 3. Approved decisions

1. Use feature-focused custom hooks and presentation components without adding a state-management
   dependency.
2. Preserve the exact rendered element hierarchy, class names, text, ARIA attributes and section
   order.
3. Preserve the current global action lock: while any dashboard action is pending, no other
   dashboard action can start.
4. Keep history limited to the first page of at most 50 records; do not introduce pagination.
5. Protect visual equivalence with behavioral tests, a structural DOM/CSS contract and manual
   Windows comparison rather than a monolithic HTML snapshot.
6. Keep `main.css` byte-for-byte unchanged during Stage 8.
7. Centralize `window.agent` behind one small typed renderer gateway; hooks consume the gateway and
   presentation components never access IPC.
8. Organize the implementation as feature slices rather than one large container hook or a minimal
   helper-only extraction.

This follows the React guidance that components and hooks remain pure, effects synchronize with
external systems, and custom hooks expose specific reusable behavior while leaving components
focused on intent:

- https://react.dev/learn/reusing-logic-with-custom-hooks
- https://react.dev/reference/rules
- https://react.dev/learn/keeping-components-pure

## 4. Architecture

### 4.1 Renderer gateway

`src/renderer/src/api/agent-api.ts` is the only renderer module that reads `window.agent`. It
returns the current typed `AgentApi` reference without caching, wrapping, retrying or transforming
requests and responses.

The gateway does not expose raw `ipcRenderer`, event objects, channel names or generic `send` and
`invoke` functions. It preserves the restricted preload boundary introduced in Stage 7.

### 4.2 Dashboard feature

The dashboard feature is organized below `src/renderer/src/features/dashboard/`:

- `dashboard-model.ts` owns initial snapshots, action-name/log types, formatting functions and pure
  control-capability calculations;
- `use-operational-log.ts` owns the ten-entry newest-first log and the existing time format;
- `use-dashboard-environment.ts` owns browser/session state, refresh and browser commands;
- `use-agent-control.ts` owns agent state, realtime subscription and agent commands;
- a small dashboard coordinator composes initial hydration, the shared action lock and the feature
  hooks without duplicating their logic;
- presentation components own the header, browser panel, agent panel, platform sessions, E1 error
  and operational log markup.

`components/AgentDashboard.tsx` remains the public root. It composes these units and preserves its
existing default export.

The exact file split may combine two adjacent pure view components when separating them would
create a trivial one-use abstraction. No extracted production hook or component may recreate a
second copy of a rule owned by another unit.

### 4.3 History feature

The history feature is organized below `src/renderer/src/features/history/`:

- `research-history-model.ts` owns pure date, duration, classification and status formatting plus
  record upsert/sort;
- `use-research-history.ts` owns page-one loading, the three event subscriptions, busy/feedback
  state, clearing and PDF actions;
- a history table component renders rows and actions from props without IPC access.

`components/ResearchHistoryPanel.tsx` remains the public composition component and preserves its
existing default export.

### 4.4 Presentation boundary

Presentation components:

- receive immutable typed props;
- render deterministically;
- contain no `window`, Electron or preload access;
- do not start asynchronous work or subscribe to events;
- do not reproduce domain/application business rules;
- introduce no wrapper element, class, visible text, ARIA change or reordered sibling.

Fragments may group extracted JSX only when they produce no DOM node.

## 5. Exact behavioral contract

### 5.1 Initial dashboard hydration

The first effect starts these three calls in the same `Promise.all`:

1. `browser.getStatus()`;
2. `control.getState()`;
3. `sessions.getStatus()`.

Only a complete success hydrates all three snapshots and adds `Estado inicial carregado.`. A
failure preserves the current initial snapshots and adds the same public error message currently
used. Neither outcome updates state after unmount.

The `control.onStateChanged` subscription is installed during the same mount lifecycle without
polling. Its exact unsubscribe is called once during cleanup, and events after cleanup do not update
state.

### 5.2 Global dashboard action lock

`busyAction` remains one global lock shared by browser and agent commands. It is set before a
command starts and cleared in `finally`.

Browser actions:

1. await the selected browser command;
2. set the returned browser snapshot;
3. request session status;
4. swallow only that secondary refresh failure;
5. add the same success or primary-error log.

Agent actions:

1. await the selected control command;
2. set the returned agent state;
3. refresh browser and session status together;
4. swallow only that secondary refresh failure;
5. add the same success or primary-error log.

The action functions and success messages remain the same. No retry, debounce, optimistic update or
new notification is introduced.

### 5.3 Control availability

The existing matrix is invariant:

- start agent: `PARADO` or `ERRO_E1`;
- pause: `EXECUTANDO` or `OCIOSO`;
- resume: `PAUSADO`;
- stop: every state except `PARADO` and `PARANDO`;
- login completed: rendered only for `AGUARDANDO_LOGIN`;
- open browser: browser is not `RUNNING`;
- close browser: browser is `RUNNING`;
- every control above: disabled while the global action lock is active.

### 5.4 Operational log and countdown

Logs remain newest-first, limited to ten entries and formatted with `pt-BR` hours, minutes and
seconds. Existing info/success/error classifications and messages remain unchanged.

`useAgentCountdown` remains the countdown owner and preserves its current interval, fallback and
non-negative behavior.

### 5.5 History

History loads exactly `{ page: 1, pageSize: 50 }`. Loading, empty, feedback and populated states
retain their current precedence and text.

Created and updated records are reconciled by ID, placed in descending `startedAt` order and never
mutate the prior array. The cleared event empties the list. The three exact unsubscribe callbacks
run once at unmount, and pending list completion cannot update state after unmount.

PDF open/reveal and history clear share the existing `busy` lock. Their success, not-found, generic
error and preservation messages remain identical. Clearing removes displayed records but never
deletes PDFs.

## 6. Exact visual and accessibility contract

Stage 8 preserves:

- every visible Portuguese string;
- the order of header, status grid, platform grid, optional E1 panel, activity log and history;
- every tag, class name, `data-testid`, `role`, `aria-label`, `aria-labelledby` and `aria-live`;
- button types, labels and disabled conditions;
- table headers, column order and status-class construction;
- the conditional presence of masked CPF, error and PDF buttons;
- locale formatting through `pt-BR`;
- the contents and byte order of `src/renderer/src/assets/main.css`.

No design-system migration, CSS modules, new animation, responsive change, accessibility redesign or
copy edit belongs to Stage 8.

## 7. Error, privacy and lifecycle rules

- Existing public `Error.message` values continue to display unchanged.
- Non-Error failures continue using the same generic messages for each action.
- Secondary environment/session refresh errors remain silent.
- No new log, telemetry, retry or error serialization is added.
- Only masked CPF from public DTOs may render; no full CPF may enter renderer source, tests, docs,
  reports or snapshots.
- PDF paths remain command inputs and are not newly rendered or logged.
- Every asynchronous hook guards state updates after unmount.
- Every subscription stores and calls the exact returned unsubscribe once.
- React render paths remain pure and never access time, IPC or mutable external state directly.

## 8. Testing strategy

Implementation is test-driven. Characterization is extended before extraction.

### 8.1 Dashboard characterization

Tests cover:

- exact initial `Promise.all` call set and success/error logs;
- no update after unmount during pending hydration;
- realtime agent subscription, no polling, exact cleanup and ignored post-unmount event;
- the complete control-availability matrix;
- all seven action commands and exact success/error messages;
- one pending browser or agent command disabling every dashboard control;
- secondary refresh rejection preserving the successful primary action;
- ten-entry newest-first log behavior;
- masked CPF, E1 and countdown presentation;
- structural signature of tags, classes, attributes, text and section order.

### 8.2 History characterization

Tests cover:

- page-one input and all loading/empty/error/populated states;
- no update after unmount during pending list;
- exact three-subscription cleanup and ignored post-unmount events;
- created/updated reconciliation and descending order;
- clear success/error/event behavior;
- PDF open/reveal success, not-found and failure behavior;
- shared busy lock and structural table contract;
- all classification, status, date and duration formatting cases.

### 8.3 Extraction gates

Each extraction observes a focused RED before production changes, reaches GREEN with the minimum
implementation and performs a mutation proof for its ownership contract. Tests assert behavior and
rendered output rather than implementation names, except architecture/source contracts whose
purpose is to enforce the gateway and presentation boundaries.

`main.css` is hash-checked against the accepted baseline. The final Windows check compares the
dashboard at the same window dimensions and exercises all conditional states; it does not approve a
new visual design.

## 9. Automated gates

The final tree must pass:

1. focused renderer model/hook/component tests;
2. preload and Electron security contract tests;
3. Node, scripts and web typechecks plus type-tests;
4. ESLint and Prettier with zero warnings;
5. `pnpm run validate`;
6. `pnpm run build`;
7. `pnpm run test:coverage` without reducing configured coverage thresholds;
8. `git diff --check`;
9. architecture scans proving `window.agent` appears only in the gateway and presentation units do
   not import the gateway;
10. privacy scan proving no full CPF literal;
11. byte-for-byte `main.css` hash equality.

## 10. Manual Windows acceptance

The user validates:

- identical dashboard layout, spacing, colors, typography, responsive behavior and copy;
- every browser and agent button in the same state combinations;
- initial load, realtime agent changes, countdown and operational log;
- login confirmation, pause, resume, stop and E1 display;
- CPI and DeskData session indicators;
- history loading, records, realtime updates and clearing;
- PDF open/reveal and not-found feedback;
- full CPI → DeskData → PDF → CPI behavior;
- normal close, close during initialization and restart.

No Stage 8 commit, merge or push occurs before the user explicitly reports that this checklist is
tested and working.

## 11. Explicit non-goals

- no visual redesign or CSS reorganization;
- no new feature, pagination, filter, search, toast or telemetry;
- no Context, reducer store or external state library;
- no preload, channel, DTO or main-process change unless a regression proves a directly related
  compatibility defect that cannot be fixed in the renderer;
- no automation, database or distribution change;
- no performance memoization without measured need;
- no snapshot of full CPF, raw Electron event or private error detail;
- no commit, push or publication before manual acceptance.

## 12. Completion criteria

Stage 8 is accepted only when:

- the gateway is the renderer's only preload access point;
- hooks own asynchronous state/effects and presentation components remain pure;
- public component paths and exports remain compatible;
- rendered DOM, CSS and user-visible behavior match the accepted Stage 7 baseline;
- all automated gates pass with zero Critical or Important review findings;
- the user explicitly completes manual Windows acceptance;
- Git integration is requested separately after that acceptance.
