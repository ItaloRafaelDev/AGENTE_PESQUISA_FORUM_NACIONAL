# Dependency boundaries

Validation date: 2026-07-28

## Enforced direction

| Source           | Allowed internal targets                          |
| ---------------- | ------------------------------------------------- |
| `domain`         | `domain`                                          |
| `application`    | `application`, `domain`                           |
| `infrastructure` | `infrastructure`, `application`, `domain`         |
| `shared`         | `shared`                                          |
| `renderer`       | `renderer`, `shared`                              |
| `preload`        | `preload`, `shared`                               |
| `main`           | `main`, `application`, `infrastructure`, `shared` |
| `automation`     | `automation`, `application`, `domain`, `shared`   |

External dependencies are enforced by package identity and Node built-in identity:

| Source           | Allowed Node built-ins | Allowed external packages                          |
| ---------------- | ---------------------- | -------------------------------------------------- |
| `domain`         | none                   | none                                               |
| `application`    | none                   | none                                               |
| `shared`         | none                   | none                                               |
| `infrastructure` | yes                    | `better-sqlite3`, `pdf-parse`, `playwright`, `zod` |
| `automation`     | yes                    | `pdf-parse`, `playwright`                          |
| `main`           | yes                    | `@electron-toolkit/utils`, `electron`, `zod`       |
| `preload`        | none                   | `@electron-toolkit/preload`, `electron`            |
| `renderer`       | none                   | `react`, `react-dom`                               |

Package subpaths inherit only their exact package permission. Other packages from the same scope
are not allowed.

Node built-ins are checked through their official module identity. Prefix-only modules such as
`node:sqlite`, `node:test` and `node:sea` are allowed in Node-owning layers, while the unrelated
bare package names `sqlite`, `test` and `sea` remain external and forbidden.

The transitional automation dependency on `zod` was removed in Stage 4. Platform URL validation
now belongs to the infrastructure configuration boundary, and automation receives the parsed
structural values through composition.

## Temporary composition exception

Only `src/main/main-application-runtime.ts` may import `src/automation/**`.
The architecture contract freezes the ten exact imports approved in the Stage 3 design.

No new `main → automation` import is permitted. Stages 5 and 6 remove this exception while moving
the application core and external adapters.

## Public contracts

`shared` owns serializable IPC DTOs and imports no internal runtime layer.
Internal application/domain values and public values are intentionally independent and protected
by parity tests.

## Verification

`tests/architecture/layer-dependency-contract.test.ts` parses production TypeScript through the
TypeScript compiler API and fails on unresolved internal imports, forbidden layer directions,
forbidden external dependencies or changes to the temporary allowlist.

Aliases come from the shared `source-aliases.ts` configuration used by the test and application
bundlers. TypeScript and JavaScript module paths use TypeScript bundler resolution, including
JavaScript specifiers backed by TypeScript implementations. Existing CSS, JSON and queried assets
are resolved and classified by layer without being scanned as source code. Missing internal code
or asset paths remain violations.

Structural history compatibility runs through Vitest type tests during `pnpm run validate`;
runtime tests are not used as a substitute for TypeScript checking.

## Stage 3 cumulative-review status

- Architecture contract: passing.
- Approved automation external policy: Node built-ins, `playwright`, `pdf-parse` and exact `zod`.
- Temporary composition edges: exactly 10.
- Full runtime suite: 90 files and 433 tests passing.
- Type contract suite: 1 file and 1 test passing with no type errors.
- Global ESLint: zero errors and zero warnings.
- Windows production build: passing.
- Coverage: 83.81% statements, 74.83% branches, 88.38% functions and 84.02% lines.
- SQLite schema, persisted paths, renderer and preload behavior: unchanged.
- Manual Windows validation: approved by the user on 2026-07-28.
- No commit created.

## Stage 4 configuration closure

- Platform URLs and active queue/browser timing values are parsed once by the main composition
  root and injected into automation.
- Automation no longer imports `zod`; URL validation remains in infrastructure configuration.
- Temporary `main → automation` composition remains frozen at exactly 10 edges.
