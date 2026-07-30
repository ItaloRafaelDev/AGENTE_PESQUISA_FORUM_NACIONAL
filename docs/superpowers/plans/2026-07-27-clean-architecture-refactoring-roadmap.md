# Agente CPI Clean Architecture Refactoring Roadmap

**Specification:** `docs/superpowers/specs/2026-07-27-clean-architecture-refactoring-design.md`

**Delivery model:** incremental implementation with verification checkpoints. One final
commit is allowed only after manual testing and explicit user approval.

## Verified baseline

- Branch: `refactor/limpeza-segura`
- Source: 82 TypeScript/TSX files and 5,937 lines
- Tests: 80 files and 388 passing tests
- Build: passing
- Typecheck: passing
- Format check: failing in 18 files
- ESLint: no errors and 552 line-ending warnings
- Honest coverage with every production TypeScript file included:
  - statements: 79.40%
  - branches: 72.69%
  - functions: 79.52%
  - lines: 79.55%

The previous 85.12% statement result counted only modules imported by the tests. Vitest 4
requires an explicit `coverage.include` pattern to account for untouched production files.

## Plan sequence

| Stage | Plan                               | Depends on             | Completion evidence                                         |
| ----- | ---------------------------------- | ---------------------- | ----------------------------------------------------------- |
| 1     | Baseline and regression protection | Approved specification | Honest coverage, compatibility tests, verified bug baseline |
| 2     | Repository hygiene                 | Stage 1                | Green format/lint pipeline, obsolete-file inventory         |
| 3     | Architecture boundaries            | Stage 2                | Dependency rules and layer contract tests                   |
| 4     | Configuration and persistence      | Stage 3                | Single config source, SQLite migration compatibility        |
| 5     | Application core                   | Stage 4                | Use cases independent from Electron/Playwright/SQLite       |
| 6     | External adapters                  | Stage 5                | CPI, DeskData, browser and PDF adapters behind ports        |
| 7     | Electron security                  | Stage 6                | Restricted preload, validated IPC and navigation            |
| 8     | Renderer refactoring               | Stage 7                | Smaller hooks/components with unchanged UI behavior         |
| 9     | Distribution and documentation     | Stage 8                | Windows installer, operational README and smoke test        |
| 10    | Final delivery                     | Stage 9                | Full validation, single commit and main-branch push         |

## Stage plans

Plans are written immediately before their stage so that each one uses evidence produced by
the previous stage.

1. `docs/superpowers/plans/2026-07-27-refactoring-stage-1-baseline-implementation-plan.md`
2. `docs/superpowers/plans/2026-07-27-refactoring-stage-2-hygiene-implementation-plan.md`
3. `docs/superpowers/plans/2026-07-27-refactoring-stage-3-architecture-implementation-plan.md`
4. `docs/superpowers/plans/2026-07-27-refactoring-stage-4-data-config-implementation-plan.md`
5. `docs/superpowers/plans/2026-07-27-refactoring-stage-5-application-implementation-plan.md`
6. `docs/superpowers/plans/2026-07-27-refactoring-stage-6-adapters-implementation-plan.md`
7. `docs/superpowers/plans/2026-07-27-refactoring-stage-7-electron-implementation-plan.md`
8. `docs/superpowers/plans/2026-07-27-refactoring-stage-8-renderer-implementation-plan.md`
9. `docs/superpowers/plans/2026-07-27-refactoring-stage-9-distribution-implementation-plan.md`
10. `docs/superpowers/plans/2026-07-27-refactoring-stage-10-delivery-implementation-plan.md`

Only the current stage plan must exist before implementation. Later filenames reserve the
agreed sequence; they do not authorize speculative implementation.

## Global checkpoints

Every stage ends with:

1. targeted tests for all changed behavior;
2. Node and renderer typecheck;
3. the full test suite;
4. coverage comparison against the honest baseline;
5. `git diff --check`;
6. manual diff review for scope, privacy and compatibility;
7. an explicit stage result before the next plan is written.

Formatting and lint failures already present in the baseline remain documented until Stage 2.
No new warning or failure may be introduced in Stage 1.

## Git rule

No stage creates a commit. The final delivery stage:

1. verifies the configured remote and actual primary branch;
2. reruns every quality gate;
3. reviews the complete diff;
4. hands the application to the user for manual testing;
5. waits for the user to state explicitly that the result is correct;
6. creates one commit only after that approval;
7. integrates it into the primary branch without force;
8. pushes the primary branch.
