# Stage 5 Application Core Design

**Date:** 2026-07-30
**Status:** approved after written-spec review on 2026-07-30
**Parent specification:** `2026-07-27-clean-architecture-refactoring-design.md`
**Depends on:** Stage 4 manually approved on Windows on 2026-07-29

## 1. Goal

Extract the agent lifecycle, continuous execution, individual research cycle, preparation,
classification result and history orchestration into a technology-independent application
core.

Stage 5 must make the use cases independently testable without Electron, Playwright, SQLite,
physical paths or concrete CPI and DeskData controllers while preserving the current
functional and visual behavior.

The stage preserves:

- the exact CPI → DeskData → CPI operational sequence;
- current queue selection, session reuse and continuous-cycle behavior;
- current pause and stop safety boundaries;
- renderer structure, styles, text and interactions;
- preload and IPC channel names, request shapes, response shapes and event payloads;
- current public agent-state semantics and messages;
- current classification rules and CPI result mapping;
- research-history meaning, stored rows and notifications;
- canonical database, browser profile, authenticated sessions and PDF compatibility;
- the Windows-only support decision.

## 2. Approved decisions

The user approved:

1. progressive extraction instead of a big-bang rewrite;
2. application-owned models mapped to the existing IPC contracts at the boundary;
3. cohesive use cases coordinated by one application service instead of one large migrated
   service;
4. explicit cooperative cancellation and typed application errors;
5. application-owned history orchestration with repository, clock, ID and safe-logging ports;
6. semantic ports that never expose Playwright or Electron types;
7. one canonical lifecycle state machine instead of independent mutable flags;
8. pause and stop at the existing safe checkpoints;
9. vertical migration slices protected by characterization and compatibility tests;
10. temporary compatibility facades in `src/automation` until adapter reorganization in
    Stage 6;
11. an isolated correction for the confirmed supervised-script classification mismatch;
12. no commit or push after Stage 5; final Git publication remains gated by the user's final
    manual approval.

## 3. Verified current state

`src/application` currently contains only an initial architecture skeleton:

- the continuous-research stage model;
- the research-history application model;
- the research-history repository port.

Most application orchestration still lives in `src/automation`:

- `continuous-agent-runtime-service.ts` owns lifecycle, sessions, queue coordination, public
  state, pause, stop and failure handling;
- `agent-public-state-store.ts` owns mutable public state and sensitive-data masking;
- `continuous-research-runner.ts` coordinates the queue and repeated cycles;
- `single-research-cycle.ts` coordinates an individual CPI → DeskData → CPI cycle;
- `full-research-preparation-workflow.ts` coordinates DeskData submission, PDF processing,
  classification and CPI preparation;
- `research-history-service.ts` owns active-cycle state, IDs, duration, persistence,
  sanitization and notifications.

These modules define useful seams, but several ports still expose `BrowserContext`, `Page`,
`Frame` or concrete adapter types. Default factory seams also compose concrete automation
controllers inside orchestration modules. This prevents the use cases from running without
Playwright and makes orchestration, resource handling and platform mechanics difficult to
distinguish.

The Stage 3 architecture test currently freezes ten temporary `main → automation` imports.
Some are browser/platform adapter dependencies that legitimately remain until Stage 6. The
Stage 5 core-related dependencies must be reduced without falsely claiming that all
automation migration is complete.

### 3.1 Confirmed supervised-script defect

`scripts/run-full-supervised-research.ts` passes
`FullResearchPreparationClassification` to
`DeskDataClassificationReportFormatter.format`.

The workflow result is a sphere-based `DeskDataClassification` extended with the CPI
classification. The formatter instead requires `DeskDataInspectionClassification`, whose
mandatory `summary` property is absent from the supplied value. It then dereferences
`result.summary`.

This is both a TypeScript contract violation and a possible runtime failure. The regular
project typecheck does not report it because operational scripts are outside its compilation
scope.

The correction must:

- reproduce the mismatch with a failing contract or type test before implementation;
- avoid pretending that sphere evidence and inspection-summary evidence are interchangeable;
- format only fields present in the canonical result;
- preserve the main application, renderer and CPI classification behavior;
- add an explicit scripts typecheck so the mismatch cannot return.

## 4. Target boundaries

Stage 5 establishes the following application structure:

```text
src/application/
├── agent/
│   ├── models/
│   ├── services/
│   └── use-cases/
├── research/
│   ├── models/
│   └── use-cases/
├── history/
│   ├── models/
│   └── use-cases/
├── ports/
│   ├── browser/
│   ├── cpi/
│   ├── deskdata/
│   ├── observability/
│   ├── persistence/
│   └── reports/
└── errors/
```

Exact file names may be refined in the implementation plan, but responsibility and dependency
direction may not change.

```text
main ──composes──> application <──implements── automation/infrastructure
                          │
                          └──> domain
```

Rules:

- `application` imports only `application` and `domain`;
- `application` does not import Electron, Playwright, SQLite, Node filesystem APIs or concrete
  automation/infrastructure modules;
- `application` does not construct concrete adapters;
- ports are owned by the application behavior that consumes them;
- `main` remains the only production composition root;
- `shared` remains the owner of serializable IPC contracts;
- `main` or a dedicated boundary mapper converts application models to the unchanged shared
  contracts;
- Playwright pages, frames, contexts, selectors and navigation remain inside adapters;
- SQLite statements and migration details remain inside infrastructure;
- physical PDF-path resolution remains an adapter responsibility;
- temporary `automation` facades may delegate to application use cases but may not duplicate
  their decisions or state.

Stage 6 will move and reorganize concrete CPI, DeskData, browser and PDF adapters. Stage 5 does
not perform that directory migration.

## 5. Application responsibilities

### 5.1 Agent lifecycle

The application owns:

- validation of commands against the current lifecycle state;
- start, pause, resume and stop intent;
- the active execution context;
- safe-checkpoint decisions;
- continuous-run completion and failure;
- the canonical state snapshot;
- publication of application-level state changes.

It does not own:

- Electron process lifecycle;
- window creation;
- browser launch mechanics;
- Playwright resource instances;
- IPC registration.

### 5.2 Continuous research

The continuous coordinator owns:

- requesting prepared logical sessions from a gateway;
- requesting the current CPI queue;
- selecting and opening the next eligible logical item according to existing behavior;
- invoking exactly one research cycle at a time;
- registering the result;
- returning to the research view;
- deciding whether another cycle may start;
- honoring pause and stop directives at safe checkpoints.

The coordinator does not inspect DOM state or manipulate a browser page.

### 5.3 Individual research cycle

The individual-cycle use case owns this exact sequence:

1. open the selected CPI research;
2. obtain the research subject and masked identity;
3. prepare and execute the DeskData research;
4. receive the generated report reference and classification;
5. prepare the CPI result;
6. attach the report;
7. confirm and save the CPI result;
8. finalize history;
9. prepare the next DeskData search when required;
10. return control to the queue coordinator.

No step may be reordered. No new retry, timeout, parallelism or duplicate-save policy is
introduced in Stage 5.

### 5.4 Research preparation

The preparation use case owns the semantic sequence:

1. submit the research identity;
2. apply the approved datasets;
3. execute the search once;
4. obtain the completed external result;
5. request report generation;
6. request report interpretation;
7. classify the interpreted process data using the existing domain rule;
8. return a canonical application result.

Navigation, selectors, popup resolution, download events, PDF parsing implementation and CPI
controls remain adapter details.

### 5.5 History

The application owns one history lifecycle:

```text
cycle requested
→ active history context
→ success or sanitized failure
→ persistence
→ compatible notification
→ active context cleared
```

History orchestration receives time and IDs from ports. It sends records through the existing
repository port or a compatible refinement of it. It never imports `better-sqlite3`,
`randomUUID` or a concrete logger.

Only one active history context is allowed per sequential agent cycle. Cleanup must occur in a
`finally`-equivalent path so stale sensitive or cycle state cannot leak into the next run.

## 6. Canonical application models

Application models express use-case meaning, not transport or adapter mechanics.

The minimum model set includes:

- lifecycle state and command result;
- execution context and cancellation directive;
- logical session set;
- queue item and selected-research reference;
- research subject with controlled access to the full CPF and an always-available masked CPF;
- prepared-research result;
- canonical classification result and its actual evidence;
- logical report reference;
- individual-cycle result;
- continuous-run result;
- history lifecycle input and persisted record;
- application error and public-safe failure projection.

Rules:

- full CPF may exist only in the active execution path that needs it;
- public state, events, logs and history use only the masked CPF;
- raw sensitive values are never included in generic `details`, `metadata` or error objects;
- adapter handles are opaque application values only when a semantic operation cannot avoid a
  reference; they must not reveal Playwright types or offer browser operations;
- report references may carry compatibility metadata through a dedicated type, but
  application code must not resolve, join, create or inspect filesystem paths;
- application models are not imported by the renderer or preload;
- shared IPC DTOs are not used as mutable application state;
- boundary mappers preserve every existing serialized field and omission rule.

The canonical classification model keeps the CPI classification and the evidence that
actually produced it. Sphere-based evidence is not cast to the unrelated historical
inspection-summary type. The supervised report formatter will accept the canonical model or
a dedicated projection whose fields can all be produced truthfully from that model.

## 7. Semantic ports

The application depends on capability-oriented ports. Representative responsibilities are:

### 7.1 Session gateway

- prepare the logical CPI and DeskData sessions;
- report authentication/session availability using application values;
- release or close application-owned session scope when required.

### 7.2 Research queue gateway

- load the current eligible queue;
- open the selected logical research;
- return to the research list;
- report queue availability and stable item identity.

### 7.3 Research subject gateway

- read the subject required for the active research;
- return controlled full and masked CPF forms;
- avoid publishing raw CPF in error metadata.

### 7.4 External research gateway

- submit the subject;
- apply the currently approved datasets;
- execute one search;
- wait for and return one logical result reference;
- prepare the external platform for the next search.

### 7.5 Report gateway

- create a report for the current result;
- interpret the report into domain process records;
- return a logical report reference and compatibility metadata.

### 7.6 CPI attendance gateway

- prepare the existing CPI classification;
- attach the generated report exactly once;
- save with the existing confirmation semantics.

### 7.7 History and observability ports

- persist and query history;
- provide current time;
- generate a cycle ID;
- publish state/history events;
- record safe structured logs.

Port contracts must not contain:

- `Page`, `Frame`, `BrowserContext`, locators or selectors;
- Electron windows, apps, events or IPC objects;
- SQL, SQLite connections or repository implementation details;
- absolute-path construction rules;
- concrete CPI, DeskData, PDF or browser controller classes.

## 8. Lifecycle state machine

The application has one canonical lifecycle state:

```text
idle → starting → running
                    ├─→ pause-requested → paused → running
                    ├─→ stop-requested  → stopping → idle
                    └─→ failed          → idle
```

The implementation may represent terminal outcomes separately from the stable public snapshot
when characterization tests show that this is required for compatibility. It may not restore
independent mutable flags as competing sources of truth.

Transition rules:

- start is accepted only from the existing compatible idle condition;
- pause is idempotent only where current behavior is idempotent;
- resume is accepted only from the compatible paused condition;
- stop is accepted from every currently stoppable active condition;
- a stop request takes precedence over a pending pause at the next safe checkpoint;
- failure records and sanitizes the active error before returning to the compatible idle
  state;
- a new run cannot observe state or sensitive data from the previous execution;
- invalid commands produce the existing public behavior through the boundary mapper.

The application state snapshot is canonical. The current shared `AgentPublicState` shape is a
projection produced at the boundary. Characterization tests define the exact observable
timing, field values and messages.

## 9. Cooperative execution control

Each active run receives an execution-control context. It is the only source used by
application use cases to observe pause and stop requests.

Safe checkpoints remain aligned with current behavior:

- before selecting or opening another queue item;
- between idempotent preparation steps where current cancellation is safe;
- before starting another individual cycle;
- after a non-idempotent CPI operation reaches its known result;
- during current controlled polling/wait boundaries where adapters already support safe
  interruption.

Rules:

- Stage 5 does not introduce forceful interruption of an in-progress CPI save or attachment;
- pause waits at a safe checkpoint and resumes the same logical run;
- stop prevents another cycle, completes mandatory cleanup and releases the active context;
- cancellation is an explicit application outcome, not an arbitrary adapter exception;
- adapters may use native cancellation internally but translate it before crossing the port;
- overlapping runs remain forbidden.

## 10. Errors and boundary translation

Application errors use stable categories:

- validation;
- integration;
- preparation;
- persistence;
- cancellation;
- invalid state or transition;
- unexpected internal failure.

An application error contains:

- a stable internal category or code;
- a safe application message;
- optional safe context limited to known fields;
- an internal cause that never crosses IPC or persistence automatically.

Adapters translate Playwright, platform, PDF and infrastructure failures into these errors.
The main/compatibility boundary translates application failures into the existing public
messages, state fields and IPC behavior.

Rules:

- no new raw external error is exposed to the renderer or database;
- CPF, session tokens, cookies, page HTML and local profile data are excluded from error
  context;
- existing public messages are preserved unless a confirmed bug requires a separately tested
  correction;
- cleanup errors do not hide the primary failure;
- retries remain in the adapter or policy that currently owns them;
- non-idempotent operations are never automatically replayed by a generic application retry.

## 11. Compatibility and migration strategy

Stage 5 uses vertical extraction slices:

1. add or strengthen characterization tests around the current orchestration;
2. introduce application models, ports, errors and execution control;
3. consolidate the classification result and correct the supervised-script contract;
4. extract history orchestration;
5. extract lifecycle state and its public-state projection;
6. extract research preparation and the individual cycle;
7. extract continuous execution and its coordinator;
8. connect concrete adapters in the composition root;
9. retain thin compatibility facades for consumers not yet moved;
10. update dependency tests and document the remaining Stage 6 debt.

For every slice:

1. a failing test captures the required behavior or architectural constraint;
2. the smallest responsibility is extracted;
3. the existing automation entry point delegates to the new application behavior;
4. targeted tests and architecture checks pass;
5. the full suite passes before the next slice;
6. duplicated state or decisions are removed immediately after delegation is proven.

Compatibility facades:

- keep existing import paths only where changing all consumers would mix Stage 5 and Stage 6;
- contain construction/delegation and type mapping only;
- do not own business decisions, lifecycle flags or history state;
- are marked in the architecture inventory with their Stage 6 removal target;
- are covered by tests that compare their public result with the previous contract.

The architecture test's temporary-edge list must shrink for core orchestration. Browser and
platform adapter edges may remain only when they are explicitly assigned to Stage 6.

## 12. Supervised-script correction

The script correction is a bounded bug fix, not an authorization to modernize all scripts.

Implementation requirements:

1. reproduce the incompatible formatter input with a test or scripts typecheck;
2. expose the canonical classification result from the preparation use case;
3. format a truthful technical report from that result without dereferencing absent fields;
4. preserve CPI classification and all main-application behavior;
5. add regression coverage for the exact script-facing projection or formatter;
6. add a dedicated TypeScript configuration or equivalent command that checks operational
   scripts against production contracts;
7. run the script typecheck in the Stage 5 verification gate.

No real CPI save, attachment or external mutation is authorized by this design. Live
destructive validation still requires separate explicit user authorization at execution time.

## 13. Testing strategy

### 13.1 Characterization tests

Before each extraction, tests freeze:

- start, pause, resume, stop and repeated-command behavior;
- public-state snapshots and notification order;
- queue and session sequencing;
- individual-cycle stage order and hooks;
- safe-boundary behavior around save, attachment and cleanup;
- history start, success, failure, duration and sanitization;
- classification and report result shapes;
- main composition and IPC projections.

### 13.2 Application unit tests

Application tests use only fakes and deterministic ports. They cover:

- every allowed and rejected lifecycle transition;
- stop precedence and pause/resume behavior;
- one-cycle-at-a-time enforcement;
- exact coordinator call order;
- failure translation and cleanup;
- no next cycle after stop;
- no duplicated CPI attachment or save;
- deterministic IDs and durations;
- masked sensitive values in state, history, errors and logs;
- canonical classification projections.

### 13.3 Port and facade contract tests

Contract tests verify:

- no application port exposes forbidden framework types;
- adapters translate technical failures;
- compatibility facades preserve current inputs and outputs;
- IPC mappers preserve serialized contracts;
- history repository compatibility is unchanged;
- logical report references preserve current persisted-path behavior at the adapter boundary;
- scripts compile against the same production result contracts.

### 13.4 Architecture tests

Automated checks must reject application imports from:

- `electron`;
- `playwright`;
- `better-sqlite3`;
- Node filesystem/path APIs;
- `src/main`;
- `src/preload`;
- `src/renderer`;
- `src/shared`;
- concrete `src/automation` or `src/infrastructure` modules.

They also verify that only the production composition root constructs the concrete continuous
agent graph.

### 13.5 Stage verification

Stage 5 requires:

- targeted tests after every extraction slice;
- Node, renderer and structural typechecks;
- the new scripts typecheck;
- ESLint;
- Prettier;
- the complete unit and integration suite;
- the complete production build;
- honest coverage with no unjustified regression;
- at least the parent-specification thresholds for `domain` and `application`;
- `git diff --check`;
- privacy scans for unmasked CPF and captured external data;
- architecture dependency scans;
- review of all remaining temporary layer edges;
- manual Windows validation by the user.

External non-destructive checks may be proposed separately. Any check that saves, confirms,
attaches or mutates real CPI/DeskData data requires explicit authorization at that moment.

## 14. Documentation

Stage 5 updates or creates:

- an application-core architecture document;
- a use-case and port responsibility map;
- the lifecycle transition table;
- the temporary compatibility-facade inventory;
- the architecture test's temporary-edge rationale;
- the Stage 5 progress/evidence ledger;
- the roadmap only if verified evidence changes its wording.

Documentation must describe the final implemented result, not an idealized future Stage 6
state.

## 15. Out of scope

Stage 5 does not:

- move all concrete adapters from `src/automation` to `src/infrastructure`;
- redesign CPI, DeskData, browser or PDF adapter internals;
- centralize every selector or polling policy;
- change the database schema, canonical database path or migration strategy;
- change browser-profile paths, cookies or sessions;
- change renderer components, CSS, text or layout;
- change IPC channels or public payloads;
- activate new retries, timeouts or parallel execution;
- add support for macOS or Linux;
- generate the final Windows installer;
- run a real destructive external workflow without separate authorization;
- commit, merge or push.

These items remain assigned to their existing roadmap stages.

## 16. Acceptance criteria

Stage 5 is complete only when:

1. agent lifecycle, continuous execution, individual cycle, preparation and history are owned
   by `src/application`;
2. application use cases run in tests with fakes and no Electron, Playwright or SQLite;
3. application ports are semantic and contain no technical browser, database or filesystem
   types;
4. a single lifecycle state machine and execution context replace competing mutable control
   state;
5. pause and stop pass characterization tests for the existing safe behavior;
6. the CPI → DeskData → CPI call order is unchanged;
7. history rows, notifications, duration and sanitization remain compatible;
8. IPC and renderer behavior remain unchanged;
9. the canonical classification contract fixes the supervised-script mismatch without
   changing the main application classification;
10. operational scripts pass their dedicated typecheck;
11. no new sensitive value appears in logs, errors, state, events, tests or artifacts;
12. core-related temporary architecture edges are removed or justified as Stage 6 adapter
    dependencies;
13. all Stage 5 automated gates pass;
14. the user manually validates the application on Windows;
15. the result is documented without a commit or push.
