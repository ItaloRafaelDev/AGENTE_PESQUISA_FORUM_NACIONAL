# Stage 3 Progressive Architecture Boundaries Design

**Date:** 2026-07-28
**Status:** approved after written-spec review
**Parent specification:** `2026-07-27-clean-architecture-refactoring-design.md`
**Depends on:** Stage 2 manually approved on Windows

## 1. Goal

Establish enforceable dependency boundaries and the first stable `application` contracts without
changing the functional or visual behavior of the Windows application.

Stage 3 is progressive. It removes verified dependency inversions now and freezes the remaining
legacy composition edge. It does not move the complete automation implementation ahead of the
application-core and adapter stages.

## 2. Current architectural violations

The current source graph contains these relevant inversions:

- `shared/types/agent-runtime-api.ts` imports a workflow stage from `automation`;
- `shared/types/history-api.ts` imports a classification type from `domain`;
- `automation/history/research-history-service.ts` imports persistence input types from the
  concrete SQLite repository;
- `main/ipc/register-history-ipc-handlers.ts` imports history event types from `automation`;
- `main/main-application-runtime.ts` composes the current `automation` implementations directly;
- the target `application` layer does not yet exist.

The first four inversions are removed in Stage 3. The direct composition dependency is contained
by an exact allowlist until Stages 5 and 6 move the application core and adapters.

## 3. Approved source dependency graph

The target rules introduced in this stage are:

```text
domain         → domain only
application    → application + domain
infrastructure → infrastructure + application + domain
shared         → shared only
renderer       → renderer + shared
preload        → preload + shared
main           → main + application + infrastructure + shared
automation     → automation + application + domain + shared
```

External packages are allowed only where the layer owns an external concern:

- `domain`, `application` and `shared` cannot import external runtime packages;
- `infrastructure` may import Node APIs, Zod, Playwright, `better-sqlite3`, PDF and filesystem
  libraries required by its adapters;
- `main` and `preload` may import Electron and their current Electron Toolkit modules;
- `renderer` may import React and renderer-only libraries;
- the transitional `automation` layer may retain its current Node, Playwright and PDF imports
  until adapter migration.

No layer may import `renderer`, `preload` or `main`.

## 4. Exact temporary exception

Only `src/main/main-application-runtime.ts` may import `src/automation/**`.

The exception freezes these current targets:

```text
automation/browser/browser-manager
automation/browser/browser-workspace-service
automation/browser/platform-page-manager
automation/browser/playwright-browser-launcher
automation/cpi/cpi-queue-filter-controller
automation/flow/continuous-research-runner
automation/history/research-history-service
automation/session/platform-session-service
automation/workflow/agent-public-state-store
automation/workflow/continuous-agent-runtime-service
```

The architecture test compares the actual edges with this exact set. A new `main → automation`
edge fails even when added to the allowed source file. Any other `main` source importing
`automation` also fails.

This exception is removed across Stages 5 and 6. It is not a general permission for new legacy
coupling.

## 5. New application contracts

Stage 3 introduces:

```text
src/application/
├── agent/
│   └── continuous-research-stage.ts
├── history/
│   └── research-history-model.ts
└── ports/
    └── research-history-repository-port.ts
```

### 5.1 Continuous research stage

`application/agent/continuous-research-stage.ts` owns:

- the internal `ContinuousResearchStage` union;
- the ordered list of valid stage values;
- `ContinuousResearchStageError`.

The error preserves its current name, message, `stage` and `cause` behavior.

`automation/flow/continuous-research-stage.ts` becomes a compatibility re-export of the same
symbols. Existing scripts, tests and runtime imports therefore receive the same class identity,
not a wrapper or duplicated error class. Removing this compatibility module belongs to Stage 5.

### 5.2 History model

`application/history/research-history-model.ts` owns internal history concerns:

- history status;
- history record and paginated page;
- list input;
- create, complete and fail persistence inputs;
- history events and listener type.

The field names, nullable fields, status values, classification values and date/string formats
remain identical to the current runtime behavior.

### 5.3 Repository port

`application/ports/research-history-repository-port.ts` defines the repository operations
consumed by the history service:

```text
create
setMaskedCpf
complete
fail
list
clear
```

The SQLite repository implements this interface and imports its input/output models from
`application`. The history service also imports the port from `application`; it no longer imports
the concrete infrastructure module.

SQLite schema creation, migrations, queries, indexes and paths are unchanged in this stage.

## 6. Shared IPC contracts

`shared` remains a serialization boundary and cannot reuse internal types through imports.

It owns independent serializable value sets for:

- research classifications sent in history records;
- continuous research stages sent in the public agent state.

Contract tests compare the internal and public ordered value sets. A difference fails the suite,
but production layers remain directionally independent.

This intentional separation distinguishes:

- internal domain/application models, which may evolve behind adapters;
- public IPC DTOs, which are stable contracts consumed by preload and renderer.

## 7. Main-process mapping

The history IPC boundary receives application history models and converts them to shared DTOs
through explicit pure mapping functions in:

```text
src/main/mappers/research-history-ipc-mapper.ts
```

The mapper copies every public field explicitly. It does not pass class instances, methods or
infrastructure objects across IPC.

`register-history-ipc-handlers.ts` uses the mapper for list results and created/updated events.
Channel names, payload fields, pagination behavior and renderer-visible values remain unchanged.

## 8. Architecture analysis

The permanent architecture test uses the installed TypeScript compiler API instead of a regular
expression or a new dependency.

It scans production TypeScript and TSX files and recognizes:

- static imports;
- type-only imports;
- re-exports with module specifiers;
- dynamic imports.

Internal relative imports and configured source aliases are resolved to normalized `src` paths.
Each resolved edge is classified by top-level layer.

A failure reports:

```text
source file → imported module → destination layer → violated rule
```

Unresolved internal source aliases also fail the architecture test. External-package imports are
checked against the owning layer's policy.

The test helper is isolated under `tests/support/architecture/`, while executable contracts live
under `tests/architecture/`.

## 9. Error handling

Stage 3 does not change public error messages or runtime retry/cancellation behavior.

Architecture-test errors are deterministic and sorted by source and import so the same violation
produces the same output on Windows. Windows path separators are normalized before comparison.

The moved `ContinuousResearchStageError` retains the original `cause` reference. The existing
compatibility import must satisfy `instanceof` against the application-exported class.

## 10. Verification

Implementation follows RED → GREEN in independently reviewable units:

1. architecture scanner and failing current-graph contract;
2. internal/public stage separation with compatibility identity tests;
3. internal/public classification and history contract separation;
4. repository port inversion and SQLite compatibility tests;
5. explicit history IPC mapping and unchanged payload tests;
6. exact legacy-edge allowlist and complete architecture gate.

The Stage 3 gate requires:

- all architecture and contract tests passing;
- existing workflow, history, IPC, preload and renderer tests passing;
- Node and renderer typechecks passing;
- ESLint with zero warnings;
- repository-wide Prettier check passing;
- full suite passing;
- all-source coverage not below the Stage 2 checkpoint:
  - statements: 83.75%;
  - branches: 74.83%;
  - functions: 88.33%;
  - lines: 83.97%;
- Windows production build passing;
- no full CPF in new tests, documentation or error fixtures;
- complete diff review confirming no SQLite, renderer, profile, session or PDF behavior change;
- manual Windows validation before Stage 4 planning.

## 11. Out of scope

Stage 3 does not:

- change SQLite schema, migration strategy or persisted paths;
- centralize configuration or remove Drizzle;
- move the complete agent lifecycle into `application`;
- move CPI, DeskData, browser or PDF adapters into `infrastructure`;
- change selectors, timeouts, retries or idempotency behavior;
- change Electron preload, IPC channels, navigation or sandbox settings;
- change renderer DOM, CSS, text or interactions;
- create the Stage 4 plan before Stage 3 acceptance.

Those changes remain assigned to their approved later stages.

## 12. Git rule

No Stage 3 task creates a commit. The generic design-workflow commit step is overridden by the
project rule: one final commit is allowed only after all stages, final manual testing and explicit
user approval.
