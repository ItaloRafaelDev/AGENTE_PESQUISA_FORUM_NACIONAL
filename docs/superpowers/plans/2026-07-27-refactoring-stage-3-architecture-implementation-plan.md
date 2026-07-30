# Stage 3 Progressive Architecture Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish enforceable source dependency rules, create the first stable application
contracts, and remove current dependency inversions without changing Windows behavior or moving
the complete automation implementation ahead of later stages.

**Architecture:** A TypeScript-AST scanner verifies the production source graph without adding a
dependency. Internal stage and history models move behind `application` contracts, SQLite
implements an application-owned port, and `main` maps internal history records to independent IPC
DTOs. The only temporary legacy edge is an exact ten-import allowlist from
`src/main/main-application-runtime.ts` to `src/automation/**`.

**Tech Stack:** TypeScript 5.9, TypeScript Compiler API, Vitest 4, Node.js 24, Electron 39,
React 19, `better-sqlite3` 12, Zod 4 and pnpm.

## Global Constraints

- Preserve the exact functional and visual Windows behavior approved after Stage 2.
- Keep CPI → DeskData → CPI order, classification rules, public states, IPC channels and payloads.
- Preserve `app.getPath('userData')/agente-cpi.sqlite`, existing history, PDF paths, downloaded
  PDFs, Chromium profile, cookies and sessions.
- Do not change SQLite schema, migrations, queries, indexes or runtime paths in Stage 3.
- Do not centralize configuration or remove Drizzle; those changes remain Stage 4 work.
- Do not move the complete agent lifecycle or external adapters; those changes remain Stages 5
  and 6 work.
- Do not change preload security, renderer DOM, CSS, text, interactions or external selectors.
- Do not add an architecture-analysis dependency; use the installed TypeScript compiler API.
- New tests, fixtures, documentation and error messages must not contain a complete CPF.
- External platform checks remain read-only; do not save, attach, confirm or mutate real research.
- No task may run `git add`, create a commit, merge, push or open a pull request.
- The final project commit remains forbidden until every stage and final manual test are approved.
- Do not create the Stage 4 plan until Stage 3 passes automated gates and manual Windows review.

## References

- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Vitest writing tests](https://main.vitest.dev/guide/learn/writing-tests)
- [Vitest coverage](https://main.vitest.dev/guide/coverage)

---

### Task 1: Build the TypeScript source import graph

**Files:**

- Create: `tests/support/architecture/source-import-graph.ts`
- Create: `tests/unit/architecture/source-import-graph.test.ts`

**Interfaces:**

- Consumes:
  - a source root containing `.ts`, `.tsx` and `.d.ts` files;
  - relative imports plus the existing `@/` and `@renderer/` source aliases.
- Produces:
  - `SourceLayer`;
  - `SourceDependency`;
  - `collectSourceDependencies(sourceRoot: string): SourceDependency[]`.

- [ ] **Step 1: Write the failing scanner tests**

Create `tests/unit/architecture/source-import-graph.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { collectSourceDependencies } from '../../support/architecture/source-import-graph'

const temporaryDirectories: string[] = []

function createSourceRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-architecture-'))

  temporaryDirectories.push(directory)

  return join(directory, 'src')
}

function writeSource(sourceRoot: string, relativePath: string, source: string): void {
  const filePath = join(sourceRoot, relativePath)

  mkdirSync(dirname(filePath), {
    recursive: true
  })

  writeFileSync(filePath, source, 'utf8')
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()

    if (directory) {
      rmSync(directory, {
        recursive: true,
        force: true
      })
    }
  }
})

describe('collectSourceDependencies', () => {
  it('lê imports estáticos, imports de tipo e reexports', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'domain/value.ts', 'export type Value = string')
    writeSource(
      sourceRoot,
      'application/use-value.ts',
      [
        "import type { Value } from '../domain/value'",
        "export type { Value as PublicValue } from '../domain/value'"
      ].join('\n')
    )

    expect(collectSourceDependencies(sourceRoot)).toEqual([
      {
        sourceFile: 'application/use-value.ts',
        sourceLayer: 'application',
        moduleSpecifier: '../domain/value',
        kind: 'internal',
        targetFile: 'domain/value.ts',
        targetLayer: 'domain'
      },
      {
        sourceFile: 'application/use-value.ts',
        sourceLayer: 'application',
        moduleSpecifier: '../domain/value',
        kind: 'internal',
        targetFile: 'domain/value.ts',
        targetLayer: 'domain'
      }
    ])
  })

  it('lê import types e imports dinâmicos', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'domain/value.ts', 'export interface Value { id: string }')
    writeSource(
      sourceRoot,
      'application/load-value.ts',
      [
        "type LazyValue = import('../domain/value').Value",
        'export async function loadValue(): Promise<unknown> {',
        "  return import('../domain/value')",
        '}',
        'export type { LazyValue }'
      ].join('\n')
    )

    const dependencies = collectSourceDependencies(sourceRoot)

    expect(dependencies).toHaveLength(2)
    expect(dependencies.every((dependency) => dependency.targetFile === 'domain/value.ts')).toBe(
      true
    )
  })

  it('resolve os aliases internos existentes e arquivos index', () => {
    const sourceRoot = createSourceRoot()

    writeSource(sourceRoot, 'shared/types/index.ts', 'export type Contract = string')
    writeSource(sourceRoot, 'renderer/src/hooks/use-value.ts', 'export const value = 1')
    writeSource(
      sourceRoot,
      'main/index.ts',
      [
        "import type { Contract } from '@/shared/types'",
        "import { value } from '@renderer/hooks/use-value'",
        'export type { Contract }',
        'export { value }'
      ].join('\n')
    )

    expect(
      collectSourceDependencies(sourceRoot).map((dependency) => dependency.targetFile)
    ).toEqual(['shared/types/index.ts', 'renderer/src/hooks/use-value.ts'])
  })

  it('distingue pacote externo de import interno não resolvido', () => {
    const sourceRoot = createSourceRoot()

    writeSource(
      sourceRoot,
      'shared/index.ts',
      ["import { z } from 'zod'", "import './missing'", 'export { z }'].join('\n')
    )

    expect(collectSourceDependencies(sourceRoot)).toEqual([
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: './missing',
        kind: 'internal',
        targetFile: null,
        targetLayer: null
      },
      {
        sourceFile: 'shared/index.ts',
        sourceLayer: 'shared',
        moduleSpecifier: 'zod',
        kind: 'external',
        targetFile: null,
        targetLayer: null
      }
    ])
  })
})
```

- [ ] **Step 2: Run the scanner tests and verify RED**

Run:

```powershell
pnpm test -- tests/unit/architecture/source-import-graph.test.ts
```

Expected: the test file fails because
`tests/support/architecture/source-import-graph.ts` does not exist.

- [ ] **Step 3: Implement the AST-based import graph**

Create `tests/support/architecture/source-import-graph.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import ts from 'typescript'

export const SOURCE_LAYERS = [
  'application',
  'automation',
  'domain',
  'infrastructure',
  'main',
  'preload',
  'renderer',
  'shared'
] as const

export type SourceLayer = (typeof SOURCE_LAYERS)[number] | 'unknown'

export interface SourceDependency {
  sourceFile: string
  sourceLayer: SourceLayer
  moduleSpecifier: string
  kind: 'internal' | 'external'
  targetFile: string | null
  targetLayer: SourceLayer | null
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, {
    withFileTypes: true
  })
    .flatMap((entry) => {
      const entryPath = resolve(directory, entry.name)

      if (entry.isDirectory()) {
        return listSourceFiles(entryPath)
      }

      return /\.tsx?$/.test(entry.name) ? [entryPath] : []
    })
    .sort()
}

function classifyLayer(relativeFilePath: string): SourceLayer {
  const [topLevelDirectory] = normalizePath(relativeFilePath).split('/')

  return SOURCE_LAYERS.find((layer) => layer === topLevelDirectory) ?? 'unknown'
}

function collectModuleSpecifiers(filePath: string): string[] {
  const sourceText = readFileSync(filePath, 'utf8')
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )
  const moduleSpecifiers: string[] = []

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      moduleSpecifiers.push(node.moduleSpecifier.text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      moduleSpecifiers.push(node.arguments[0].text)
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      moduleSpecifiers.push(node.argument.literal.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return moduleSpecifiers
}

function resolveInternalBase(
  sourceRoot: string,
  sourceFile: string,
  moduleSpecifier: string
): string | null {
  if (moduleSpecifier.startsWith('./') || moduleSpecifier.startsWith('../')) {
    return resolve(dirname(sourceFile), moduleSpecifier)
  }

  if (moduleSpecifier.startsWith('@/')) {
    return resolve(sourceRoot, moduleSpecifier.slice(2))
  }

  if (moduleSpecifier.startsWith('@renderer/')) {
    return resolve(sourceRoot, 'renderer/src', moduleSpecifier.slice('@renderer/'.length))
  }

  return null
}

function resolveInternalFile(sourceFiles: ReadonlySet<string>, basePath: string): string | null {
  const candidates =
    extname(basePath).length > 0
      ? [basePath]
      : [
          basePath,
          `${basePath}.ts`,
          `${basePath}.tsx`,
          resolve(basePath, 'index.ts'),
          resolve(basePath, 'index.tsx')
        ]

  return candidates.find((candidate) => sourceFiles.has(resolve(candidate))) ?? null
}

export function collectSourceDependencies(sourceRoot: string): SourceDependency[] {
  const absoluteSourceRoot = resolve(sourceRoot)
  const sourceFiles = listSourceFiles(absoluteSourceRoot)
  const sourceFileSet = new Set(sourceFiles.map((filePath) => resolve(filePath)))

  return sourceFiles
    .flatMap((sourceFile) => {
      const relativeSourceFile = normalizePath(relative(absoluteSourceRoot, sourceFile))
      const sourceLayer = classifyLayer(relativeSourceFile)

      return collectModuleSpecifiers(sourceFile).map((moduleSpecifier): SourceDependency => {
        const internalBase = resolveInternalBase(absoluteSourceRoot, sourceFile, moduleSpecifier)

        if (!internalBase) {
          return {
            sourceFile: relativeSourceFile,
            sourceLayer,
            moduleSpecifier,
            kind: 'external',
            targetFile: null,
            targetLayer: null
          }
        }

        const resolvedTarget = resolveInternalFile(sourceFileSet, internalBase)
        const targetFile = resolvedTarget
          ? normalizePath(relative(absoluteSourceRoot, resolvedTarget))
          : null

        return {
          sourceFile: relativeSourceFile,
          sourceLayer,
          moduleSpecifier,
          kind: 'internal',
          targetFile,
          targetLayer: targetFile ? classifyLayer(targetFile) : null
        }
      })
    })
    .sort(
      (left, right) =>
        left.sourceFile.localeCompare(right.sourceFile) ||
        left.moduleSpecifier.localeCompare(right.moduleSpecifier)
    )
}
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
pnpm test -- tests/unit/architecture/source-import-graph.test.ts
pnpm exec prettier --check `
  tests/support/architecture/source-import-graph.ts `
  tests/unit/architecture/source-import-graph.test.ts
pnpm exec eslint `
  tests/support/architecture/source-import-graph.ts `
  tests/unit/architecture/source-import-graph.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: four scanner tests pass; formatting, lint, Node typecheck and diff check pass.

- [ ] **Step 5: Record the working-tree checkpoint**

Run:

```powershell
git diff -- `
  tests/support/architecture/source-import-graph.ts `
  tests/unit/architecture/source-import-graph.test.ts
git status --short
git diff --cached --name-only
```

Expected: only Task 1 files plus earlier approved work are present; staging output is empty.
Do not commit.

---

### Task 2: Establish the application-owned continuous research stage

**Files:**

- Create: `src/application/agent/continuous-research-stage.ts`
- Modify: `src/automation/flow/continuous-research-stage.ts`
- Modify: `src/shared/types/agent-runtime-api.ts`
- Create: `tests/unit/application/agent/continuous-research-stage.test.ts`
- Delete: `tests/unit/automation/flow/continuous-research-stage.test.ts`

**Interfaces:**

- Produces:
  - `CONTINUOUS_RESEARCH_STAGES`;
  - `ContinuousResearchStage`;
  - `ContinuousResearchStageError`;
  - an independent shared `ContinuousResearchStage` DTO union.
- Preserves:
  - the legacy automation import path as a re-export;
  - the exact error class identity, name, message, stage and cause.

- [ ] **Step 1: Write the application-stage contract**

Create `tests/unit/application/agent/continuous-research-stage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CONTINUOUS_RESEARCH_STAGES as APPLICATION_STAGES,
  ContinuousResearchStageError
} from '@/application/agent/continuous-research-stage'
import {
  CONTINUOUS_RESEARCH_STAGES as LEGACY_STAGES,
  ContinuousResearchStageError as LegacyContinuousResearchStageError
} from '@/automation/flow/continuous-research-stage'
import { CONTINUOUS_RESEARCH_STAGES as PUBLIC_STAGES } from '@/shared/types/agent-runtime-api'

describe('ContinuousResearchStage', () => {
  it('preserva os valores internos e públicos na mesma ordem', () => {
    expect(APPLICATION_STAGES).toEqual([
      'WAITING_QUEUE',
      'OPENING_CPI_RESEARCH',
      'READING_CPI_IDENTITY',
      'PREPARING_DESKDATA',
      'SUBMITTING_DESKDATA',
      'WAITING_DESKDATA_RESULT',
      'CLASSIFYING_RESULT',
      'DOWNLOADING_PDF',
      'PREPARING_CPI_RESULT',
      'ATTACHING_PDF',
      'SAVING_CPI',
      'PREPARING_NEXT_SEARCH',
      'RETURNING_TO_QUEUE'
    ])
    expect(PUBLIC_STAGES).toEqual(APPLICATION_STAGES)
    expect(LEGACY_STAGES).toBe(APPLICATION_STAGES)
  })

  it('preserva a etapa e a referência exata da causa', () => {
    const cause = new Error('Falha controlada ao baixar PDF')
    const error = new ContinuousResearchStageError('DOWNLOADING_PDF', cause)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContinuousResearchStageError')
    expect(error.stage).toBe('DOWNLOADING_PDF')
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Falha controlada ao baixar PDF')
  })

  it('converte causa não Error na mensagem atual', () => {
    const error = new ContinuousResearchStageError('SAVING_CPI', 'Falha desconhecida')

    expect(error.stage).toBe('SAVING_CPI')
    expect(error.cause).toBe('Falha desconhecida')
    expect(error.message).toBe('Falha desconhecida')
  })

  it('mantém o caminho legado apontando para a mesma classe', () => {
    expect(LegacyContinuousResearchStageError).toBe(ContinuousResearchStageError)

    const error = new LegacyContinuousResearchStageError(
      'PREPARING_NEXT_SEARCH',
      new Error('Falha controlada')
    )

    expect(error).toBeInstanceOf(ContinuousResearchStageError)
  })
})
```

- [ ] **Step 2: Run the application-stage test and verify RED**

Run:

```powershell
pnpm test -- tests/unit/application/agent/continuous-research-stage.test.ts
```

Expected: failure because `src/application/agent/continuous-research-stage.ts` and the public
stage value list do not exist.

- [ ] **Step 3: Create the application stage**

Create `src/application/agent/continuous-research-stage.ts`:

```ts
export const CONTINUOUS_RESEARCH_STAGES = [
  'WAITING_QUEUE',
  'OPENING_CPI_RESEARCH',
  'READING_CPI_IDENTITY',
  'PREPARING_DESKDATA',
  'SUBMITTING_DESKDATA',
  'WAITING_DESKDATA_RESULT',
  'CLASSIFYING_RESULT',
  'DOWNLOADING_PDF',
  'PREPARING_CPI_RESULT',
  'ATTACHING_PDF',
  'SAVING_CPI',
  'PREPARING_NEXT_SEARCH',
  'RETURNING_TO_QUEUE'
] as const

export type ContinuousResearchStage = (typeof CONTINUOUS_RESEARCH_STAGES)[number]

export class ContinuousResearchStageError extends Error {
  constructor(
    readonly stage: ContinuousResearchStage,
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause))

    this.name = 'ContinuousResearchStageError'
  }
}
```

- [ ] **Step 4: Turn the old module into a compatibility re-export**

Replace `src/automation/flow/continuous-research-stage.ts` with:

```ts
export {
  CONTINUOUS_RESEARCH_STAGES,
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '../../application/agent/continuous-research-stage'
```

- [ ] **Step 5: Make the shared stage contract independent**

Remove the import from `automation` at the top of `src/shared/types/agent-runtime-api.ts`.
Insert before `AGENT_PUBLIC_STATUSES`:

```ts
export const CONTINUOUS_RESEARCH_STAGES = [
  'WAITING_QUEUE',
  'OPENING_CPI_RESEARCH',
  'READING_CPI_IDENTITY',
  'PREPARING_DESKDATA',
  'SUBMITTING_DESKDATA',
  'WAITING_DESKDATA_RESULT',
  'CLASSIFYING_RESULT',
  'DOWNLOADING_PDF',
  'PREPARING_CPI_RESULT',
  'ATTACHING_PDF',
  'SAVING_CPI',
  'PREPARING_NEXT_SEARCH',
  'RETURNING_TO_QUEUE'
] as const

export type ContinuousResearchStage = (typeof CONTINUOUS_RESEARCH_STAGES)[number]
```

Do not change public statuses, state fields, channel names or API methods.

- [ ] **Step 6: Remove the superseded test file**

Delete:

```text
tests/unit/automation/flow/continuous-research-stage.test.ts
```

The new application test contains the two original behavior tests plus value-parity and legacy
identity coverage.

- [ ] **Step 7: Run focused verification**

Run:

```powershell
pnpm test -- `
  tests/unit/application/agent/continuous-research-stage.test.ts `
  tests/unit/automation/flow/continuous-safety-guard.test.ts `
  tests/unit/automation/flow/single-research-cycle-hooks.test.ts `
  tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts
pnpm run typecheck
pnpm run format:check
pnpm run lint
git diff --check
```

Expected: all selected tests and quality gates pass; legacy imports remain valid.

- [ ] **Step 8: Record the working-tree checkpoint**

Run:

```powershell
git diff -- `
  src/application/agent/continuous-research-stage.ts `
  src/automation/flow/continuous-research-stage.ts `
  src/shared/types/agent-runtime-api.ts `
  tests/unit/application/agent/continuous-research-stage.test.ts `
  tests/unit/automation/flow/continuous-research-stage.test.ts
git diff --cached --name-only
```

Expected: the change is type ownership plus compatibility re-export only; staging is empty.
Do not commit.

---

### Task 3: Invert the research-history persistence dependency

**Files:**

- Create: `src/application/history/research-history-model.ts`
- Create: `src/application/ports/research-history-repository-port.ts`
- Modify: `src/automation/history/research-history-service.ts`
- Modify: `src/infrastructure/database/research-history-repository.ts`
- Modify: `src/shared/types/history-api.ts`
- Create: `tests/unit/application/history/research-history-contract.test.ts`
- Modify: `tests/unit/infrastructure/database/research-history-repository.test.ts`

**Interfaces:**

- Produces:
  - application-owned history statuses, records, pagination and persistence inputs;
  - `ResearchHistoryEvent` and `ResearchHistoryEventListener`;
  - `ResearchHistoryRepositoryPort`.
- Preserves:
  - every SQLite query, schema, index and validation;
  - the service class and its public method signatures;
  - independent serialized history DTOs in `shared`.

- [ ] **Step 1: Write the application-history contract**

Create `tests/unit/application/history/research-history-contract.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import { RESEARCH_CLASSIFICATIONS as DOMAIN_CLASSIFICATIONS } from '@/domain/research/research-classification'
import {
  RESEARCH_HISTORY_STATUSES as APPLICATION_HISTORY_STATUSES,
  type ResearchHistoryRecord as ApplicationResearchHistoryRecord
} from '@/application/history/research-history-model'
import type { ResearchHistoryRepositoryPort } from '@/application/ports/research-history-repository-port'
import { ResearchHistoryRepository } from '@/infrastructure/database/research-history-repository'
import {
  RESEARCH_CLASSIFICATIONS as PUBLIC_CLASSIFICATIONS,
  RESEARCH_HISTORY_STATUSES as PUBLIC_HISTORY_STATUSES,
  type ResearchHistoryRecord as PublicResearchHistoryRecord
} from '@/shared/types/history-api'

describe('research history architecture contracts', () => {
  it('mantém classificações internas e públicas compatíveis', () => {
    expect(PUBLIC_CLASSIFICATIONS).toEqual(DOMAIN_CLASSIFICATIONS)
  })

  it('mantém status internos e públicos compatíveis', () => {
    expect(PUBLIC_HISTORY_STATUSES).toEqual(APPLICATION_HISTORY_STATUSES)
  })

  it('mantém porta, SQLite e DTO estruturalmente compatíveis', () => {
    expectTypeOf<ResearchHistoryRepository>().toMatchTypeOf<ResearchHistoryRepositoryPort>()
    expectTypeOf<ApplicationResearchHistoryRecord>().toMatchTypeOf<PublicResearchHistoryRecord>()
    expectTypeOf<PublicResearchHistoryRecord>().toMatchTypeOf<ApplicationResearchHistoryRecord>()
  })
})
```

- [ ] **Step 2: Run the history contract and verify RED**

Run:

```powershell
pnpm test -- tests/unit/application/history/research-history-contract.test.ts
```

Expected: failure because the application history model, port and independent shared
classification list do not exist.

- [ ] **Step 3: Create the application history model**

Create `src/application/history/research-history-model.ts`:

```ts
import type { ResearchClassification } from '../../domain/research/research-classification'

export const RESEARCH_HISTORY_STATUSES = [
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'ERRO_E1',
  'INTERROMPIDO'
] as const

export type ResearchHistoryStatus = (typeof RESEARCH_HISTORY_STATUSES)[number]

export interface ResearchHistoryRecord {
  id: string
  maskedCpf: string
  classification: ResearchClassification | null
  cpiResult: string | null
  status: ResearchHistoryStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  pdfPath: string | null
  errorStage: string | null
  errorMessage: string | null
  createdAt: string
}

export interface ResearchHistoryListInput {
  page: number
  pageSize: number
}

export interface ResearchHistoryPage {
  items: ResearchHistoryRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface CreateResearchHistoryInput {
  id: string
  maskedCpf: string
  status: ResearchHistoryStatus
  startedAt: string
  createdAt: string
}

export interface CompleteResearchHistoryInput {
  id: string
  maskedCpf: string
  classification: ResearchClassification
  cpiResult: string
  finishedAt: string
  durationMs: number
  pdfPath: string
}

export interface FailResearchHistoryInput {
  id: string
  maskedCpf: string
  finishedAt: string
  durationMs: number
  errorStage: string
  errorMessage: string
}

export type ResearchHistoryEvent =
  | {
      type: 'CREATED'
      record: ResearchHistoryRecord
    }
  | {
      type: 'UPDATED'
      record: ResearchHistoryRecord
    }
  | {
      type: 'CLEARED'
    }

export type ResearchHistoryEventListener = (event: ResearchHistoryEvent) => void
```

- [ ] **Step 4: Create the application-owned repository port**

Create `src/application/ports/research-history-repository-port.ts`:

```ts
import type {
  CompleteResearchHistoryInput,
  CreateResearchHistoryInput,
  FailResearchHistoryInput,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '../history/research-history-model'

export interface ResearchHistoryRepositoryPort {
  create(input: CreateResearchHistoryInput): ResearchHistoryRecord

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord

  complete(input: CompleteResearchHistoryInput): ResearchHistoryRecord

  fail(input: FailResearchHistoryInput): ResearchHistoryRecord

  list(input: ResearchHistoryListInput): ResearchHistoryPage

  clear(): void
}
```

- [ ] **Step 5: Make the shared history contract independent**

Remove the domain import from `src/shared/types/history-api.ts`.
Insert before `RESEARCH_HISTORY_STATUSES`:

```ts
export const RESEARCH_CLASSIFICATIONS = [
  'CONSTA_RESTRICAO',
  'HA_INFORMACOES',
  'NADA_CONSTA',
  'INDEFINIDO'
] as const

export type ResearchClassification = (typeof RESEARCH_CLASSIFICATIONS)[number]
```

Keep every existing status, record field, channel and `HistoryApi` method unchanged.

- [ ] **Step 6: Invert the history service dependency**

In `src/automation/history/research-history-service.ts`:

1. replace shared history model imports with imports from
   `../../application/history/research-history-model`;
2. import `ResearchHistoryRepositoryPort` from
   `../../application/ports/research-history-repository-port`;
3. delete the local `ResearchHistoryRepositoryPort`, `ResearchHistoryEvent` and
   `ResearchHistoryEventListener` declarations;
4. delete all imports from the concrete infrastructure repository;
5. preserve compatibility for current type consumers with:

```ts
export type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener
} from '../../application/history/research-history-model'
```

Do not alter service methods, sanitization, event cloning, active-cycle checks or messages.

- [ ] **Step 7: Make SQLite implement the application port**

In `src/infrastructure/database/research-history-repository.ts`:

1. import all history input/output types from
   `../../application/history/research-history-model`;
2. import `ResearchHistoryRepositoryPort` from
   `../../application/ports/research-history-repository-port`;
3. remove the local exported `CreateResearchHistoryInput`,
   `CompleteResearchHistoryInput` and `FailResearchHistoryInput` declarations;
4. declare:

```ts
export class ResearchHistoryRepository implements ResearchHistoryRepositoryPort {
```

Do not change `DATABASE_SCHEMA`, SQL statements, validation or lifecycle methods.

- [ ] **Step 8: Update repository test type imports**

In `tests/unit/infrastructure/database/research-history-repository.test.ts`, import:

```ts
import type {
  CompleteResearchHistoryInput,
  CreateResearchHistoryInput
} from '@/application/history/research-history-model'
import { ResearchHistoryRepository } from '@/infrastructure/database/research-history-repository'
```

Remove the two type imports from the infrastructure module. Do not alter fixtures or assertions.

- [ ] **Step 9: Run focused verification**

Run:

```powershell
pnpm test -- `
  tests/unit/application/history/research-history-contract.test.ts `
  tests/unit/automation/history/research-history-service.test.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/main/ipc/register-history-ipc-handlers.test.ts `
  tests/unit/renderer/research-history-panel.test.tsx
pnpm run typecheck
pnpm run format:check
pnpm run lint
git diff --check
```

Expected: application contracts, legacy database compatibility, service behavior, IPC and
renderer history behavior all pass.

- [ ] **Step 10: Verify dependency removal and persistence scope**

Run:

```powershell
rg -n "infrastructure/database/research-history-repository" `
  src/automation/history/research-history-service.ts
rg -n "../../(domain|automation|application|infrastructure)" `
  src/shared
git diff -- src/infrastructure/database/research-history-repository.ts
git diff --cached --name-only
```

Expected:

- both `rg` commands return no matches;
- SQLite diff contains import/interface ownership changes only;
- staging is empty.

Do not commit.

---

### Task 4: Map application history models at the IPC boundary

**Files:**

- Create: `src/main/mappers/research-history-ipc-mapper.ts`
- Modify: `src/main/ipc/register-history-ipc-handlers.ts`
- Create: `tests/unit/main/mappers/research-history-ipc-mapper.test.ts`
- Modify: `tests/unit/main/ipc/register-history-ipc-handlers.test.ts`

**Interfaces:**

- Consumes:
  - `application/history` records and pages.
- Produces:
  - `mapResearchHistoryRecordToDto`;
  - `mapResearchHistoryPageToDto`;
  - shared serializable history DTOs.
- Preserves:
  - history IPC channel names;
  - input validation;
  - list pagination and event payload values.

- [ ] **Step 1: Write the mapper contract**

Create `tests/unit/main/mappers/research-history-ipc-mapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type {
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '@/application/history/research-history-model'
import {
  mapResearchHistoryPageToDto,
  mapResearchHistoryRecordToDto
} from '@/main/mappers/research-history-ipc-mapper'

const record: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-44',
  classification: 'HA_INFORMACOES',
  cpiResult: 'Há Informações',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:00.000Z',
  durationMs: 60_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

describe('research history IPC mapper', () => {
  it('copia explicitamente todos os campos públicos', () => {
    const dto = mapResearchHistoryRecordToDto(record)

    expect(dto).toEqual(record)
    expect(dto).not.toBe(record)
  })

  it('copia a página e cada item sem compartilhar referências', () => {
    const page: ResearchHistoryPage = {
      items: [record],
      page: 1,
      pageSize: 50,
      total: 1,
      totalPages: 1
    }

    const dto = mapResearchHistoryPageToDto(page)

    expect(dto).toEqual(page)
    expect(dto).not.toBe(page)
    expect(dto.items).not.toBe(page.items)
    expect(dto.items[0]).not.toBe(record)
  })

  it('preserva campos nulos de registro interrompido', () => {
    expect(
      mapResearchHistoryRecordToDto({
        ...record,
        classification: null,
        cpiResult: null,
        status: 'INTERROMPIDO',
        durationMs: null,
        pdfPath: null
      })
    ).toMatchObject({
      classification: null,
      cpiResult: null,
      status: 'INTERROMPIDO',
      durationMs: null,
      pdfPath: null
    })
  })
})
```

- [ ] **Step 2: Run the mapper test and verify RED**

Run:

```powershell
pnpm test -- tests/unit/main/mappers/research-history-ipc-mapper.test.ts
```

Expected: failure because `research-history-ipc-mapper.ts` does not exist.

- [ ] **Step 3: Implement the pure mapper**

Create `src/main/mappers/research-history-ipc-mapper.ts`:

```ts
import type {
  ResearchHistoryPage as ApplicationResearchHistoryPage,
  ResearchHistoryRecord as ApplicationResearchHistoryRecord
} from '../../application/history/research-history-model'
import type {
  ResearchHistoryPage as ResearchHistoryPageDto,
  ResearchHistoryRecord as ResearchHistoryRecordDto
} from '../../shared/types/history-api'

export function mapResearchHistoryRecordToDto(
  record: ApplicationResearchHistoryRecord
): ResearchHistoryRecordDto {
  return {
    id: record.id,
    maskedCpf: record.maskedCpf,
    classification: record.classification,
    cpiResult: record.cpiResult,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs,
    pdfPath: record.pdfPath,
    errorStage: record.errorStage,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt
  }
}

export function mapResearchHistoryPageToDto(
  page: ApplicationResearchHistoryPage
): ResearchHistoryPageDto {
  return {
    items: page.items.map(mapResearchHistoryRecordToDto),
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    totalPages: page.totalPages
  }
}
```

- [ ] **Step 4: Use application types and mapping in history IPC**

In `src/main/ipc/register-history-ipc-handlers.ts`:

1. replace the `automation/history` type import with:

```ts
import type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener,
  ResearchHistoryListInput,
  ResearchHistoryPage
} from '../../application/history/research-history-model'
```

2. keep only `HISTORY_IPC_CHANNELS` imported from `shared`;
3. import:

```ts
import {
  mapResearchHistoryPageToDto,
  mapResearchHistoryRecordToDto
} from '../mappers/research-history-ipc-mapper'
```

4. map created and updated event records:

```ts
sender.send(HISTORY_IPC_CHANNELS.recordCreated, mapResearchHistoryRecordToDto(event.record))
```

```ts
sender.send(HISTORY_IPC_CHANNELS.recordUpdated, mapResearchHistoryRecordToDto(event.record))
```

5. map list output:

```ts
return mapResearchHistoryPageToDto(historyService.list(input))
```

Keep Zod validation, clear behavior, disposal and channels unchanged.

- [ ] **Step 5: Update IPC tests to exercise the application boundary**

In `tests/unit/main/ipc/register-history-ipc-handlers.test.ts`:

- import `ResearchHistoryEvent`, `ResearchHistoryPage` and `ResearchHistoryRecord` from
  `@/application/history/research-history-model`;
- keep only `HISTORY_IPC_CHANNELS` imported from `@/shared/types/history-api`;
- after the list result equality assertion, assert that the returned page is not the same object;
- after the event assertions, assert that created and updated payloads are not the same record
  reference.

Use:

```ts
const result = await ipcMain.invoke(HISTORY_IPC_CHANNELS.list, {
  page: 1,
  pageSize: 50
})

expect(result).toEqual(page)
expect(result).not.toBe(page)
```

and:

```ts
expect(sender.events[0]?.payload).not.toBe(record)
expect(sender.events[1]?.payload).not.toBe(record)
```

- [ ] **Step 6: Run focused verification**

Run:

```powershell
pnpm test -- `
  tests/unit/main/mappers/research-history-ipc-mapper.test.ts `
  tests/unit/main/ipc/register-history-ipc-handlers.test.ts `
  tests/unit/automation/history/research-history-service.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts `
  tests/unit/renderer/research-history-panel.test.tsx
pnpm run typecheck
pnpm run format:check
pnpm run lint
git diff --check
```

Expected: mapper, IPC, service, preload and renderer history contracts pass with unchanged values.

- [ ] **Step 7: Verify the main-process boundary**

Run:

```powershell
rg -n "automation/" src/main
git diff -- src/main/ipc/register-history-ipc-handlers.ts
git diff -- src/main/mappers/research-history-ipc-mapper.ts
git diff --cached --name-only
```

Expected:

- only `src/main/main-application-runtime.ts` imports `automation`;
- mapper copies fields explicitly;
- staging is empty.

Do not commit.

---

### Task 5: Enforce the complete progressive architecture contract

**Files:**

- Create: `tests/architecture/layer-dependency-contract.test.ts`
- Create: `docs/architecture/dependency-boundaries.md`
- Review: every Stage 3 file changed in Tasks 1–4

**Interfaces:**

- Consumes:
  - `collectSourceDependencies`;
  - the complete production source graph.
- Produces:
  - permanent layer-direction tests;
  - an exact ten-edge `main → automation` allowlist;
  - permanent architecture documentation and Stage 3 verification evidence.

- [ ] **Step 1: Create the contract with an intentionally empty exception**

Create `tests/architecture/layer-dependency-contract.test.ts` using the complete code in Step 3,
but initially define:

```ts
const ALLOWED_MAIN_AUTOMATION_EDGES = new Set<string>()
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
pnpm test -- tests/architecture/layer-dependency-contract.test.ts
```

Expected:

- the direction test fails with the ten current imports from
  `main/main-application-runtime.ts` to `automation`;
- no additional shared, application, infrastructure or main violation appears;
- if another violation appears, fix the responsible earlier task instead of adding an exception.

- [ ] **Step 3: Freeze the exact approved exception and complete the contract**

Use this complete `tests/architecture/layer-dependency-contract.test.ts`:

```ts
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectSourceDependencies,
  type SourceDependency,
  type SourceLayer
} from '../support/architecture/source-import-graph'

const sourceRoot = resolve('src')
const dependencies = collectSourceDependencies(sourceRoot)

const ALLOWED_INTERNAL_TARGETS: Record<SourceLayer, readonly SourceLayer[]> = {
  application: ['application', 'domain'],
  automation: ['automation', 'application', 'domain', 'shared'],
  domain: ['domain'],
  infrastructure: ['infrastructure', 'application', 'domain'],
  main: ['main', 'application', 'infrastructure', 'shared'],
  preload: ['preload', 'shared'],
  renderer: ['renderer', 'shared'],
  shared: ['shared'],
  unknown: []
}

const EXPECTED_MAIN_AUTOMATION_EDGES = [
  'main/main-application-runtime.ts->automation/browser/browser-manager.ts',
  'main/main-application-runtime.ts->automation/browser/browser-workspace-service.ts',
  'main/main-application-runtime.ts->automation/browser/platform-page-manager.ts',
  'main/main-application-runtime.ts->automation/browser/playwright-browser-launcher.ts',
  'main/main-application-runtime.ts->automation/cpi/cpi-queue-filter-controller.ts',
  'main/main-application-runtime.ts->automation/flow/continuous-research-runner.ts',
  'main/main-application-runtime.ts->automation/history/research-history-service.ts',
  'main/main-application-runtime.ts->automation/session/platform-session-service.ts',
  'main/main-application-runtime.ts->automation/workflow/agent-public-state-store.ts',
  'main/main-application-runtime.ts->automation/workflow/continuous-agent-runtime-service.ts'
] as const

const ALLOWED_MAIN_AUTOMATION_EDGES = new Set<string>(EXPECTED_MAIN_AUTOMATION_EDGES)
const LAYERS_WITHOUT_EXTERNAL_RUNTIME_DEPENDENCIES = new Set<SourceLayer>([
  'application',
  'domain',
  'shared'
])

function edgeKey(dependency: SourceDependency): string {
  return `${dependency.sourceFile}->${dependency.targetFile ?? dependency.moduleSpecifier}`
}

function formatViolation(dependency: SourceDependency, rule: string): string {
  const target = dependency.targetFile ?? dependency.moduleSpecifier
  const targetLayer = dependency.targetLayer ?? 'external/unresolved'

  return `${dependency.sourceFile} -> ${target} -> ${targetLayer} -> ${rule}`
}

describe('progressive architecture boundaries', () => {
  it('resolve imports internos e reconhece todas as camadas de produção', () => {
    const violations = dependencies
      .filter(
        (dependency) =>
          dependency.sourceLayer === 'unknown' ||
          (dependency.kind === 'internal' && dependency.targetFile === null)
      )
      .map((dependency) =>
        formatViolation(dependency, 'source layer and internal imports must resolve')
      )
      .sort()

    expect(violations).toEqual([])
  })

  it('respeita a direção aprovada e mantém o núcleo sem pacotes externos', () => {
    const violations = dependencies
      .filter((dependency) => {
        if (dependency.kind === 'external') {
          return LAYERS_WITHOUT_EXTERNAL_RUNTIME_DEPENDENCIES.has(dependency.sourceLayer)
        }

        if (!dependency.targetLayer) {
          return true
        }

        if (ALLOWED_INTERNAL_TARGETS[dependency.sourceLayer].includes(dependency.targetLayer)) {
          return false
        }

        return !(
          dependency.sourceLayer === 'main' &&
          dependency.targetLayer === 'automation' &&
          ALLOWED_MAIN_AUTOMATION_EDGES.has(edgeKey(dependency))
        )
      })
      .map((dependency) => formatViolation(dependency, 'forbidden dependency direction'))
      .sort()

    expect(violations).toEqual([])
  })

  it('congela exatamente as dez arestas temporárias de composição', () => {
    const actualEdges = dependencies
      .filter(
        (dependency) => dependency.sourceLayer === 'main' && dependency.targetLayer === 'automation'
      )
      .map(edgeKey)
      .sort()

    expect(actualEdges).toEqual([...EXPECTED_MAIN_AUTOMATION_EDGES].sort())
  })
})
```

- [ ] **Step 4: Run the architecture contract and verify GREEN**

Run:

```powershell
pnpm test -- `
  tests/unit/architecture/source-import-graph.test.ts `
  tests/architecture/layer-dependency-contract.test.ts
```

Expected: two files and seven architecture tests pass.

- [ ] **Step 5: Write the permanent boundary documentation**

Create `docs/architecture/dependency-boundaries.md`:

```markdown
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

`domain`, `application` and `shared` do not import external runtime packages.

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
```

- [ ] **Step 6: Run all Stage 3 targeted tests**

Run:

```powershell
pnpm test -- `
  tests/unit/architecture/source-import-graph.test.ts `
  tests/unit/application/agent/continuous-research-stage.test.ts `
  tests/unit/application/history/research-history-contract.test.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/automation/history/research-history-service.test.ts `
  tests/unit/main/mappers/research-history-ipc-mapper.test.ts `
  tests/unit/main/ipc/register-history-ipc-handlers.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts `
  tests/architecture/layer-dependency-contract.test.ts `
  tests/unit/main/main-continuous-composition-guard.test.ts
```

Expected: ten files and 59 tests pass.

- [ ] **Step 7: Run the global zero-warning gate**

Run:

```powershell
pnpm run validate
```

Expected:

- Node and renderer typechecks pass;
- ESLint has zero errors and zero warnings;
- repository-wide Prettier check passes;
- exactly 89 test files and 422 tests pass.

If totals differ, explain the exact cause and record observed totals rather than hiding the
difference.

- [ ] **Step 8: Run the Windows production build**

Run:

```powershell
pnpm run build
```

Expected: main, preload and renderer production bundles build successfully.

- [ ] **Step 9: Measure honest all-source coverage**

Run:

```powershell
pnpm run test:coverage
```

Expected:

- 89 files and 422 tests pass;
- every production TypeScript/TSX module remains included;
- coverage does not fall below the Stage 2 checkpoint:
  - statements: 83.75%;
  - branches: 74.83%;
  - functions: 88.33%;
  - lines: 83.97%.

Record exact totals and per-layer application/domain results in the Stage 3 report.

- [ ] **Step 10: Verify privacy, persistence and exact scope**

Run:

```powershell
rg -n "\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b" `
  src/application `
  src/main/mappers `
  tests/architecture `
  tests/support/architecture `
  tests/unit/application `
  tests/unit/main/mappers `
  docs/architecture/dependency-boundaries.md
rg -n "../../(domain|automation|application|infrastructure|main|preload|renderer)" src/shared
Test-Path -LiteralPath 'drizzle.config.ts'
Test-Path -LiteralPath 'docs/superpowers/evidence'
Test-Path -LiteralPath 'artifacts/deskdata-inspection'
Test-Path -LiteralPath 'build/icon.ico'
Test-Path -LiteralPath 'build/icon.png'
git diff -- src/infrastructure/database/research-history-repository.ts
git diff -- src/renderer
git diff -- src/preload
git diff --check
git diff --name-status
git diff --cached --name-only
git log -1 --format=%H
```

Expected:

- no complete CPF in Stage 3 files;
- no forbidden shared import;
- Drizzle, evidence, operational samples and Windows icons remain;
- repository diff contains no SQL, schema, index, query or validation change;
- no Stage 3 renderer or preload change;
- no whitespace error;
- staging is empty;
- HEAD remains `91902e7378ee94f90f714a8079b682477f4b0528`.

- [ ] **Step 11: Write the Stage 3 completion result**

Append to `docs/architecture/dependency-boundaries.md` using the exact observed values:

```markdown
## Stage 3 result

- Architecture contract: passing.
- Temporary composition edges: exactly 10.
- Full suite: 89 files and 422 tests passing.
- Global ESLint: zero errors and zero warnings.
- Windows production build: passing.
- SQLite schema, persisted paths, renderer and preload: unchanged.
- Stage 2 manually approved behavior: preserved.
- No commit created.
```

Create:

```text
.superpowers/sdd/2026-07-28-refactoring-stage-3-architecture-implementation-plan/task-5-report.md
```

The report must contain targeted/global test totals, coverage totals, dependency rule results,
the ten exception edges, changed-file inventory, privacy/persistence evidence, HEAD and staging
state.

- [ ] **Step 12: Stop for Stage 3 review and manual Windows validation**

Report:

- architecture rules now enforced;
- dependency inversions removed;
- exact temporary exception;
- every new application contract;
- test, typecheck, lint, format, build and coverage results;
- SQLite, PDF, profile, session, preload and renderer preservation;
- no commit or Stage 4 plan.

Do not proceed until the user manually tests the Windows application and explicitly approves
Stage 3.
