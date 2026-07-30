# Stage 1 Baseline and Regression Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an honest quality baseline and protect the public, data, PDF and renderer
behavior that later refactoring must preserve.

**Architecture:** This stage changes no architectural boundaries. It strengthens tests around
existing entry points and records an honest Vitest 4 coverage scope before files are moved.
The only production behavior change is correcting confirmed mojibake in three PDF error
messages.

**Tech Stack:** TypeScript 5.9, Electron 39, React 19, Vitest 4.1, Testing Library,
better-sqlite3 12, pdf-parse 2.4 and pnpm 10.

## Global Constraints

- Preserve the functional and visual behavior currently exposed to users.
- Preserve the SQLite database, history, PDF paths, Chromium profile and authenticated sessions.
- Support Windows as the only official target platform.
- Do not perform destructive writes in CPI Central or DeskData.
- Correct a bug only after a failing regression test demonstrates it.
- Do not introduce a new complete CPF literal in tests, fixtures, logs or documentation.
- Do not create an intermediate Git commit.
- The single final commit is forbidden until the user manually tests the application and
  explicitly states that the result is correct.
- Do not rename or move production modules during this stage.
- Do not fix the pre-existing repository-wide formatting backlog in this stage.
- Every new or modified file must itself pass Prettier and ESLint.

## Baseline facts

The following commands were run before this plan was written:

```powershell
pnpm test
pnpm run build
pnpm run test:coverage
pnpm exec tsx scripts/run-vitest-electron.ts run --coverage `
  "--coverage.include=src/**/*.{ts,tsx}" `
  "--coverage.exclude=src/**/*.d.ts"
```

Verified results:

- 80 test files passed;
- 388 tests passed;
- production build passed;
- imported-files-only coverage reported 85.12% statements;
- honest all-source coverage reported 79.40% statements, 72.69% branches, 79.52%
  functions and 79.55% lines;
- `src/main`, `src/preload`, `DeskDataPdfTextExtractor` and
  `DeskDataPdfProcessReader` contain the largest unprotected boundaries.

---

### Task 1: Make coverage account for every production module

**Files:**

- Modify: `vitest.config.ts`
- Create: `docs/architecture/refactoring-baseline.md`

**Interfaces:**

- Consumes: Vitest `test.coverage` configuration.
- Produces: an explicit `coverage.include` contract for `src/**/*.{ts,tsx}` and a permanent
  baseline record for later stages.

- [ ] **Step 1: Reproduce the misleading default coverage**

Run:

```powershell
pnpm run test:coverage
```

Expected: PASS with 80 files and 388 tests, reporting 85.12% statements because never-imported
files are absent.

- [ ] **Step 2: Add the explicit all-source coverage scope**

Change the coverage block in `vitest.config.ts` to:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'html'],
  reportsDirectory: 'coverage',
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.d.ts']
}
```

Do not add thresholds in Stage 1. Thresholds for `domain` and `application` become enforceable
after Stage 3 creates those final boundaries.

- [ ] **Step 3: Verify that untouched modules appear**

Run:

```powershell
pnpm run test:coverage
```

Expected: PASS and a report containing zero-coverage rows for:

```text
main/index.ts
main/main-application-runtime.ts
preload/index.ts
automation/deskdata/deskdata-pdf-process-reader.ts
```

Expected initial total before the later tasks in this plan: 79.40% statements, 72.69%
branches, 79.52% functions and 79.55% lines.

- [ ] **Step 4: Write the baseline document**

Create `docs/architecture/refactoring-baseline.md` with:

```markdown
# Refactoring baseline

Baseline date: 2026-07-27

## Runtime contract

- The application starts only after an explicit user action.
- A running research cycle completes before pause or stop.
- The Chromium persistent profile remains under `%APPDATA%/AgenteCPI/browser-profile`.
- Research history remains in `app.getPath('userData')/agente-cpi.sqlite`.
- Only masked CPF values may cross IPC or reach SQLite.

## Automated verification

- Test files: 80
- Tests: 388
- Typecheck: passing
- Production build: passing
- Format check: failing before refactoring in 18 files
- ESLint: zero errors and 552 pre-existing CRLF warnings

## Honest coverage

Vitest is configured to include `src/**/*.{ts,tsx}` and exclude declarations.

| Metric     | Baseline |
| ---------- | -------: |
| Statements |   79.40% |
| Branches   |   72.69% |
| Functions  |   79.52% |
| Lines      |   79.55% |

The baseline is a regression floor, not the final quality target.
```

- [ ] **Step 5: Validate the task**

Run:

```powershell
pnpm exec prettier --check vitest.config.ts docs/architecture/refactoring-baseline.md
pnpm run typecheck:node
pnpm run test:coverage
```

Expected: all commands pass.

- [ ] **Step 6: Record the checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

Expected: only the approved specification, roadmap, Stage 1 plan, `vitest.config.ts` and the
baseline document are new or modified.

---

### Task 2: Characterize PDF reader orchestration

**Files:**

- Create: `tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts`
- Test: `src/automation/deskdata/deskdata-pdf-process-reader.ts`

**Interfaces:**

- Consumes:
  - `DeskDataPdfTextExtractionPort.extract(filePath): Promise<DeskDataPdfTextSnapshot>`
  - `DeskDataPdfProcessParsingPort.parse(snapshot): DeskDataProcessRecord[]`
- Produces: a regression contract that extraction runs once, its exact snapshot reaches the
  parser and either dependency error is propagated unchanged.

- [ ] **Step 1: Write the orchestration tests**

Create the test:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataPdfProcessReader,
  type DeskDataPdfProcessParsingPort,
  type DeskDataPdfTextExtractionPort
} from '@/automation/deskdata/deskdata-pdf-process-reader'
import type { DeskDataPdfTextSnapshot } from '@/automation/deskdata/deskdata-pdf-text-snapshot'

const snapshot: DeskDataPdfTextSnapshot = {
  totalPages: 1,
  pages: [
    {
      pageNumber: 1,
      text: 'Numero 0000000-00.2026.0.00.0000\nEsfera Criminal'
    }
  ],
  text: 'Numero 0000000-00.2026.0.00.0000\nEsfera Criminal'
}

describe('DeskDataPdfProcessReader', () => {
  it('encaminha o snapshot extraído ao parser sem alterar os dados', async () => {
    const records = [
      {
        processKey: '0000000-00.2026.0.00.0000',
        processNumber: '0000000-00.2026.0.00.0000',
        sphereRaw: 'Criminal',
        sourcePage: 1
      }
    ]
    const extractor: DeskDataPdfTextExtractionPort = {
      extract: vi.fn().mockResolvedValue(snapshot)
    }
    const parser: DeskDataPdfProcessParsingPort = {
      parse: vi.fn().mockReturnValue(records)
    }
    const reader = new DeskDataPdfProcessReader(extractor, parser)

    await expect(reader.read('E:\\PDF-AGENTE-CPI\\resultado.pdf')).resolves.toEqual(records)
    expect(extractor.extract).toHaveBeenCalledOnce()
    expect(extractor.extract).toHaveBeenCalledWith('E:\\PDF-AGENTE-CPI\\resultado.pdf')
    expect(parser.parse).toHaveBeenCalledOnce()
    expect(parser.parse).toHaveBeenCalledWith(snapshot)
  })

  it('propaga a falha do extrator sem executar o parser', async () => {
    const extractionError = new Error('Falha de extração')
    const extractor: DeskDataPdfTextExtractionPort = {
      extract: vi.fn().mockRejectedValue(extractionError)
    }
    const parser: DeskDataPdfProcessParsingPort = {
      parse: vi.fn()
    }
    const reader = new DeskDataPdfProcessReader(extractor, parser)

    await expect(reader.read('E:\\PDF-AGENTE-CPI\\resultado.pdf')).rejects.toBe(extractionError)
    expect(parser.parse).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the new tests**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts
```

Expected: 2 tests pass without production changes.

- [ ] **Step 3: Validate formatting and types**

Run:

```powershell
pnpm exec prettier --check tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts
pnpm run typecheck:node
```

Expected: both commands pass.

- [ ] **Step 4: Record the checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

Expected: the new reader test is present and no unrelated production file changed.

---

### Task 3: Characterize PDF extraction and fix corrupted Portuguese messages

**Files:**

- Create: `tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts`
- Modify: `src/automation/deskdata/deskdata-pdf-text-extractor.ts:48-77`

**Interfaces:**

- Consumes: `DeskDataPdfTextExtractor.extract(filePath): Promise<DeskDataPdfTextSnapshot>`.
- Produces:
  - ordered page snapshots;
  - stable error codes `PDF_TEXT_EMPTY`, `PDF_PAGE_COUNT_MISMATCH` and
    `PDF_TEXT_EXTRACTION_FAILED`;
  - correctly encoded Portuguese error messages;
  - guaranteed parser destruction after construction.

- [ ] **Step 1: Write module mocks and the successful extraction test**

Create:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
  setWorker: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile
}))

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    static setWorker = mocks.setWorker

    getText = mocks.getText

    destroy = mocks.destroy
  }
}))

vi.mock('pdf-parse/worker', () => ({
  CanvasFactory: class {},
  getData: () => new Uint8Array()
}))

import {
  DeskDataPdfTextExtractionError,
  DeskDataPdfTextExtractor
} from '@/automation/deskdata/deskdata-pdf-text-extractor'

beforeEach(() => {
  mocks.readFile.mockReset()
  mocks.getText.mockReset()
  mocks.destroy.mockReset()
  mocks.readFile.mockResolvedValue(Buffer.from('pdf'))
  mocks.destroy.mockResolvedValue(undefined)
})

describe('DeskDataPdfTextExtractor', () => {
  it('ordena páginas e compõe o texto integral', async () => {
    mocks.getText.mockResolvedValue({
      total: 2,
      pages: [
        { num: 2, text: 'segunda página' },
        { num: 1, text: 'primeira página' }
      ]
    })

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\resultado.pdf')).resolves.toEqual({
      totalPages: 2,
      pages: [
        { pageNumber: 1, text: 'primeira página' },
        { pageNumber: 2, text: 'segunda página' }
      ],
      text: 'primeira página\nsegunda página'
    })
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Add the failing encoding regression test**

Append inside the `describe` block:

```ts
it('rejeita PDF sem texto com mensagem legível em português', async () => {
  mocks.getText.mockResolvedValue({
    total: 1,
    pages: [{ num: 1, text: '   ' }]
  })

  const extractor = new DeskDataPdfTextExtractor()

  await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\vazio.pdf')).rejects.toMatchObject({
    name: 'DeskDataPdfTextExtractionError',
    code: 'PDF_TEXT_EMPTY',
    message: 'O PDF da DeskData não possui texto extraível.'
  } satisfies Partial<DeskDataPdfTextExtractionError>)
  expect(mocks.destroy).toHaveBeenCalledOnce()
})
```

- [ ] **Step 3: Run the regression test and verify the bug**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
```

Expected: the successful extraction test passes and the empty-text test fails because the
current message contains `nÃ£o` and `extraÃ­vel`.

- [ ] **Step 4: Correct only the three corrupted messages**

Use these exact strings in `deskdata-pdf-text-extractor.ts`:

```ts
'O PDF da DeskData não possui texto extraível.'
'A extração do PDF da DeskData não retornou todas as páginas.'
'Não foi possível extrair o texto do PDF da DeskData.'
```

Do not change error codes or control flow.

- [ ] **Step 5: Add mismatch and wrapped-error tests**

Append:

```ts
it('rejeita quantidade incompleta de páginas e sempre destrói o parser', async () => {
  mocks.getText.mockResolvedValue({
    total: 2,
    pages: [{ num: 1, text: 'única página' }]
  })

  const extractor = new DeskDataPdfTextExtractor()

  await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\incompleto.pdf')).rejects.toMatchObject({
    code: 'PDF_PAGE_COUNT_MISMATCH',
    message: 'A extração do PDF da DeskData não retornou todas as páginas.'
  })
  expect(mocks.destroy).toHaveBeenCalledOnce()
})

it('converte falha técnica preservando a causa', async () => {
  const cause = new Error('arquivo ilegível')
  mocks.readFile.mockRejectedValue(cause)

  const extractor = new DeskDataPdfTextExtractor()

  await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\falha.pdf')).rejects.toMatchObject({
    code: 'PDF_TEXT_EXTRACTION_FAILED',
    message: 'Não foi possível extrair o texto do PDF da DeskData.',
    cause
  })
  expect(mocks.destroy).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Run the focused test**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 7: Validate the task**

Run:

```powershell
pnpm exec prettier --check `
  src/automation/deskdata/deskdata-pdf-text-extractor.ts `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all commands pass and the production diff contains only the three string repairs.

---

### Task 4: Replace source-text preload checks with a behavioral IPC contract

**Files:**

- Modify: `tests/unit/preload/continuous-agent-preload-api.test.ts`
- Test: `src/preload/index.ts`

**Interfaces:**

- Consumes: `contextBridge.exposeInMainWorld`, `ipcRenderer.invoke`, `ipcRenderer.on` and
  `ipcRenderer.removeListener`.
- Produces: a regression contract for every method currently exposed under `window.agent`.

- [ ] **Step 1: Replace source inspection with Electron mocks**

Replace the existing test setup with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_RUNTIME_IPC_CHANNELS,
  createInitialAgentPublicState
} from '@/shared/types/agent-runtime-api'
import { BROWSER_IPC_CHANNELS } from '@/shared/types/browser-api'
import { HISTORY_IPC_CHANNELS } from '@/shared/types/history-api'
import { PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'
import { SESSION_IPC_CHANNELS } from '@/shared/types/session-api'
import type { AgentApi } from '@/shared/types/agent-api'

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electron.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener
  }
}))

vi.mock('@electron-toolkit/preload', () => ({
  electronAPI: {}
}))

async function loadAgentApi(): Promise<AgentApi> {
  Object.defineProperty(process, 'contextIsolated', {
    configurable: true,
    value: true
  })

  vi.resetModules()
  await import('@/preload/index')

  const call = electron.exposeInMainWorld.mock.calls.find(([name]) => name === 'agent')

  if (!call) {
    throw new Error('API agent não exposta pelo preload')
  }

  return call[1] as AgentApi
}

beforeEach(() => {
  electron.exposeInMainWorld.mockReset()
  electron.invoke.mockReset()
  electron.on.mockReset()
  electron.removeListener.mockReset()
  electron.invoke.mockResolvedValue(undefined)
})
```

- [ ] **Step 2: Test every command channel**

Add:

```ts
describe('preload agent API', () => {
  it('mapeia comandos tipados para os canais IPC aprovados', async () => {
    const api = await loadAgentApi()

    await api.browser.start()
    await api.browser.stop()
    await api.browser.getStatus()
    await api.control.getState()
    await api.control.start()
    await api.control.pause()
    await api.control.resume()
    await api.control.stop()
    await api.control.loginCompleted()
    await api.sessions.getStatus()
    await api.history.list({ page: 1, pageSize: 50 })
    await api.history.clear()
    await api.pdf.open('E:\\PDF-AGENTE-CPI\\resultado.pdf')
    await api.pdf.reveal('E:\\PDF-AGENTE-CPI\\resultado.pdf')

    expect(electron.invoke.mock.calls).toEqual([
      [BROWSER_IPC_CHANNELS.start],
      [BROWSER_IPC_CHANNELS.stop],
      [BROWSER_IPC_CHANNELS.status],
      [AGENT_RUNTIME_IPC_CHANNELS.getState],
      [AGENT_RUNTIME_IPC_CHANNELS.start],
      [AGENT_RUNTIME_IPC_CHANNELS.pause],
      [AGENT_RUNTIME_IPC_CHANNELS.resume],
      [AGENT_RUNTIME_IPC_CHANNELS.stop],
      [AGENT_RUNTIME_IPC_CHANNELS.loginCompleted],
      [SESSION_IPC_CHANNELS.status],
      [HISTORY_IPC_CHANNELS.list, { page: 1, pageSize: 50 }],
      [HISTORY_IPC_CHANNELS.clear],
      [PDF_IPC_CHANNELS.open, 'E:\\PDF-AGENTE-CPI\\resultado.pdf'],
      [PDF_IPC_CHANNELS.reveal, 'E:\\PDF-AGENTE-CPI\\resultado.pdf']
    ])
  })
```

- [ ] **Step 3: Test subscription payload and cleanup**

Append:

```ts
it('encaminha estado recebido e remove exatamente o listener registrado', async () => {
  const api = await loadAgentApi()
  const listener = vi.fn()
  const unsubscribe = api.control.onStateChanged(listener)
  const handler = electron.on.mock.calls[0]?.[1] as
    ((event: unknown, payload: unknown) => void) | undefined

  expect(electron.on).toHaveBeenCalledWith(
    AGENT_RUNTIME_IPC_CHANNELS.stateChanged,
    expect.any(Function)
  )

  handler?.({}, createInitialAgentPublicState())
  expect(listener).toHaveBeenCalledWith(createInitialAgentPublicState())

  unsubscribe()
  expect(electron.removeListener).toHaveBeenCalledWith(
    AGENT_RUNTIME_IPC_CHANNELS.stateChanged,
    handler
  )
})
```

- [ ] **Step 4: Test context-isolation fail-closed behavior**

Append:

```ts
it('recusa inicialização fora de context isolation', async () => {
  Object.defineProperty(process, 'contextIsolated', {
    configurable: true,
    value: false
  })
  vi.resetModules()

  await expect(import('@/preload/index')).rejects.toThrow(
    'O Agente CPI exige contextIsolation habilitado.'
  )
})
```

Close the `describe` block after the test.

- [ ] **Step 5: Run the behavioral preload tests**

Run:

```powershell
pnpm test -- tests/unit/preload/continuous-agent-preload-api.test.ts
```

Expected: 3 tests pass without production changes.

- [ ] **Step 6: Validate the task**

Run:

```powershell
pnpm exec prettier --check tests/unit/preload/continuous-agent-preload-api.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all commands pass.

---

### Task 5: Complete the serializable public contract baseline

**Files:**

- Modify: `tests/unit/shared/types/dashboard-agent-contracts.test.ts`
- Test:
  - `src/shared/types/browser-api.ts`
  - `src/shared/types/session-api.ts`
  - `src/shared/types/pdf-api.ts`

**Interfaces:**

- Consumes: exported readonly status lists and IPC channel maps.
- Produces: exact compatibility tests for browser, session and PDF values before modules move.

- [ ] **Step 1: Import the missing public constants**

Add:

```ts
import { BROWSER_IPC_CHANNELS, BROWSER_MANAGER_STATES } from '@/shared/types/browser-api'
import { PDF_ACTION_STATUSES, PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'
import { PLATFORM_SESSION_STATES, SESSION_IPC_CHANNELS } from '@/shared/types/session-api'
```

Remove the old standalone `PDF_IPC_CHANNELS` import to avoid duplication.

- [ ] **Step 2: Add browser and session contract tests**

Append inside the existing `describe`:

```ts
it('preserva estados e canais públicos do navegador', () => {
  expect(BROWSER_MANAGER_STATES).toEqual(['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'])
  expect(BROWSER_IPC_CHANNELS).toEqual({
    start: 'browser:start',
    stop: 'browser:stop',
    status: 'browser:status'
  })
})

it('preserva estados e canal público das sessões', () => {
  expect(PLATFORM_SESSION_STATES).toEqual(['AUTHENTICATED', 'WAITING_LOGIN', 'INDETERMINATE'])
  expect(SESSION_IPC_CHANNELS).toEqual({
    status: 'sessions:status'
  })
})
```

- [ ] **Step 3: Extend the PDF test with result statuses**

Change the existing PDF assertion to include:

```ts
expect(PDF_ACTION_STATUSES).toEqual(['OPENED', 'REVEALED', 'NOT_FOUND'])
```

Keep the existing channel assertion unchanged.

- [ ] **Step 4: Run and validate**

Run:

```powershell
pnpm test -- tests/unit/shared/types/dashboard-agent-contracts.test.ts
pnpm exec prettier --check tests/unit/shared/types/dashboard-agent-contracts.test.ts
pnpm run typecheck:node
```

Expected: 7 tests pass and all validation commands pass.

- [ ] **Step 5: Record the checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

Expected: no production contract changed.

---

### Task 6: Add a reusable legacy SQLite compatibility fixture

**Files:**

- Create: `tests/fixtures/database/create-legacy-research-history-database.ts`
- Modify: `tests/unit/infrastructure/database/research-history-repository.test.ts`

**Interfaces:**

- Consumes: the schema that exists before versioned migrations.
- Produces:
  - `createLegacyResearchHistoryDatabase(filePath: string): void`
  - a reusable database fixture for Stage 4 migration tests.

- [ ] **Step 1: Create the legacy database fixture**

Create:

```ts
import Database from 'better-sqlite3'

export function createLegacyResearchHistoryDatabase(filePath: string): void {
  const database = new Database(filePath)

  try {
    database.exec(`
      CREATE TABLE research_history (
        id TEXT PRIMARY KEY,
        masked_cpf TEXT NOT NULL,
        classification TEXT,
        cpi_result TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER,
        pdf_path TEXT,
        error_stage TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_research_history_started_at
      ON research_history(started_at DESC);

      CREATE INDEX idx_research_history_status
      ON research_history(status);

      CREATE INDEX idx_research_history_classification
      ON research_history(classification);
    `)

    database
      .prepare(
        `
        INSERT INTO research_history (
          id,
          masked_cpf,
          classification,
          cpi_result,
          status,
          started_at,
          finished_at,
          duration_ms,
          pdf_path,
          error_stage,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)
      `
      )
      .run(
        'legacy-record-1',
        '***.***.***-44',
        'CONSTA_RESTRICAO',
        'Sim, Consta Restrições',
        'CONCLUIDO',
        '2026-07-14T10:00:00.000Z',
        '2026-07-14T10:01:30.000Z',
        90_000,
        'E:\\PDF-AGENTE-CPI\\legado.pdf',
        '2026-07-14T10:00:00.000Z'
      )
  } finally {
    database.close()
  }
}
```

- [ ] **Step 2: Add the compatibility test**

Import the helper:

```ts
import { createLegacyResearchHistoryDatabase } from '../../../fixtures/database/create-legacy-research-history-database'
```

Append inside the repository `describe`:

```ts
it('abre banco legado sem perder histórico ou caminhos de PDF', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agente-cpi-legacy-history-'))
  temporaryDirectories.push(directory)

  const databasePath = join(directory, 'agente-cpi.sqlite')
  createLegacyResearchHistoryDatabase(databasePath)

  const repository = ResearchHistoryRepository.open(databasePath)
  repositories.push(repository)

  const page = repository.list({
    page: 1,
    pageSize: 50
  })

  expect(page.total).toBe(1)
  expect(page.items[0]).toEqual({
    id: 'legacy-record-1',
    maskedCpf: '***.***.***-44',
    classification: 'CONSTA_RESTRICAO',
    cpiResult: 'Sim, Consta Restrições',
    status: 'CONCLUIDO',
    startedAt: '2026-07-14T10:00:00.000Z',
    finishedAt: '2026-07-14T10:01:30.000Z',
    durationMs: 90_000,
    pdfPath: 'E:\\PDF-AGENTE-CPI\\legado.pdf',
    errorStage: null,
    errorMessage: null,
    createdAt: '2026-07-14T10:00:00.000Z'
  })
})
```

- [ ] **Step 3: Run the compatibility test**

Run:

```powershell
pnpm test -- tests/unit/infrastructure/database/research-history-repository.test.ts
```

Expected: 11 repository tests pass.

- [ ] **Step 4: Validate fixture privacy**

Run:

```powershell
rg -n "\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b" `
  tests/fixtures/database `
  tests/unit/infrastructure/database
```

Expected: no match containing a complete CPF. Masked values such as `***.***.***-44` are
allowed and do not match the pattern.

- [ ] **Step 5: Validate formatting and types**

Run:

```powershell
pnpm exec prettier --check `
  tests/fixtures/database/create-legacy-research-history-database.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all commands pass.

---

### Task 7: Protect dashboard command behavior before component splitting

**Files:**

- Modify: `tests/unit/renderer/agent-dashboard.test.tsx`
- Test: `src/renderer/src/components/AgentDashboard.tsx`

**Interfaces:**

- Consumes: button labels and `window.agent` command methods.
- Produces: regression tests for browser open/close and agent pause/resume/stop behavior.

- [ ] **Step 1: Add a state helper for each actionable status**

Add below the session fixture:

```ts
function agentState(status: AgentPublicState['status']): AgentPublicState {
  return {
    ...createInitialAgentPublicState(),
    status
  }
}
```

- [ ] **Step 2: Test browser open and close commands**

Append:

```tsx
it('abre e fecha o navegador somente pelos botões correspondentes', async () => {
  const user = userEvent.setup()
  const view = render(<AgentDashboard />)

  await screen.findByTestId('agent-state')
  await user.click(screen.getByRole('button', { name: 'Abrir navegador' }))
  expect(browserStart).toHaveBeenCalledOnce()

  view.unmount()
  browserGetStatus.mockResolvedValue(browserRunning)
  render(<AgentDashboard />)

  await screen.findByTestId('agent-state')
  await user.click(screen.getByRole('button', { name: 'Fechar navegador' }))
  expect(browserStop).toHaveBeenCalledOnce()
})
```

- [ ] **Step 3: Test pause, resume and stop commands**

Append:

```tsx
it.each([
  {
    status: 'OCIOSO' as const,
    button: 'Pausar',
    command: agentPause
  },
  {
    status: 'PAUSADO' as const,
    button: 'Continuar',
    command: agentResume
  },
  {
    status: 'EXECUTANDO' as const,
    button: 'Parar',
    command: agentStop
  }
])('executa $button quando o agente está $status', async ({ status, button, command }) => {
  agentGetState.mockResolvedValue(agentState(status))
  const user = userEvent.setup()

  render(<AgentDashboard />)
  await screen.findByTestId('agent-state')
  await user.click(screen.getByRole('button', { name: button }))

  expect(command).toHaveBeenCalledOnce()
})
```

- [ ] **Step 4: Test login confirmation**

Extend the existing login test:

```tsx
const user = userEvent.setup()
const button = await screen.findByRole('button', {
  name: 'Login concluído — continuar'
})

expect(button).toBeEnabled()
await user.click(button)
expect(loginCompleted).toHaveBeenCalledOnce()
```

- [ ] **Step 5: Run the renderer tests**

Run:

```powershell
pnpm test -- tests/unit/renderer/agent-dashboard.test.tsx
```

Expected: all dashboard tests pass with no production change.

- [ ] **Step 6: Validate the task**

Run:

```powershell
pnpm exec prettier --check tests/unit/renderer/agent-dashboard.test.tsx
pnpm run typecheck:web
git diff --check
```

Expected: all commands pass.

---

### Task 8: Protect the session IPC boundary

**Files:**

- Create: `tests/unit/main/ipc/register-session-ipc-handlers.test.ts`
- Test: `src/main/ipc/register-session-ipc-handlers.ts`

**Interfaces:**

- Consumes:
  - `SessionIpcMainRegistrar.handle(channel, listener): void`
  - `SessionReadService.getSnapshot(): Promise<PlatformSessionsSnapshot>`
- Produces: exact registration and delegation behavior for `sessions:status`.

- [ ] **Step 1: Write the IPC contract test**

Create:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  registerSessionIpcHandlers,
  type SessionIpcMainRegistrar,
  type SessionReadService
} from '@/main/ipc/register-session-ipc-handlers'
import { SESSION_IPC_CHANNELS } from '@/shared/types/session-api'

describe('registerSessionIpcHandlers', () => {
  it('substitui o handler anterior e delega a leitura da sessão', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain: SessionIpcMainRegistrar = {
      removeHandler: vi.fn((channel) => {
        handlers.delete(channel)
      }),
      handle: vi.fn((channel, listener) => {
        handlers.set(channel, listener)
      })
    }
    const snapshot = {
      cpi: {
        state: 'AUTHENTICATED' as const,
        url: 'https://adm.cpicentral.com.br/fila'
      },
      deskData: {
        state: 'AUTHENTICATED' as const,
        url: 'https://app.deskdata.com.br/pessoas/'
      },
      allAuthenticated: true,
      checkedAt: '2026-07-27T20:00:00.000Z'
    }
    const sessionService: SessionReadService = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot)
    }

    registerSessionIpcHandlers(ipcMain, sessionService)

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(SESSION_IPC_CHANNELS.status)
    expect(ipcMain.handle).toHaveBeenCalledWith(SESSION_IPC_CHANNELS.status, expect.any(Function))

    const handler = handlers.get(SESSION_IPC_CHANNELS.status)
    await expect(handler?.({})).resolves.toEqual(snapshot)
    expect(sessionService.getSnapshot).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
pnpm test -- tests/unit/main/ipc/register-session-ipc-handlers.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Validate the task**

Run:

```powershell
pnpm exec prettier --check tests/unit/main/ipc/register-session-ipc-handlers.test.ts
pnpm run typecheck:node
git diff --check
```

Expected: all commands pass.

---

### Task 9: Execute the Stage 1 verification gate

**Files:**

- Modify: `docs/architecture/refactoring-baseline.md`
- Review: every file changed in Tasks 1–8

**Interfaces:**

- Consumes: the complete Stage 1 diff and all project validation scripts.
- Produces: a verified Stage 1 checkpoint and exact post-protection coverage values for the
  Stage 2 plan.

- [ ] **Step 1: Run all targeted tests together**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/renderer/agent-dashboard.test.tsx `
  tests/unit/main/ipc/register-session-ipc-handlers.test.ts
```

Expected: every listed test file passes.

- [ ] **Step 2: Run both typechecks**

Run:

```powershell
pnpm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run the complete test suite**

Run:

```powershell
pnpm test
```

Expected: 83 test files and 401 tests pass. The count is composed of three new test files,
four new PDF extractor tests, two PDF reader tests, one legacy-database test, four dashboard
command cases, two public-contract cases and one session IPC test, with the preload source
tests replaced by three behavioral tests.

- [ ] **Step 4: Measure honest post-protection coverage**

Run:

```powershell
pnpm run test:coverage
```

Expected:

- exit code 0;
- every production TypeScript/TSX module remains listed;
- statements, branches, functions and lines are not below 79.40%, 72.69%, 79.52% and 79.55%;
- PDF reader and extractor are no longer at zero effective coverage.

- [ ] **Step 5: Append post-protection results to the baseline**

Append this section using the exact totals printed in Step 4:

```markdown
## Stage 1 result

The all-source coverage command passed after regression protection.
The exact post-protection totals are recorded in the Stage 1 completion report.
No baseline metric regressed.
```

Do not copy the full per-file coverage table into the repository.

- [ ] **Step 6: Run build and changed-file quality checks**

Run:

```powershell
pnpm run build
pnpm exec prettier --check `
  vitest.config.ts `
  docs/architecture/refactoring-baseline.md `
  docs/superpowers/specs/2026-07-27-clean-architecture-refactoring-design.md `
  docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md `
  docs/superpowers/plans/2026-07-27-refactoring-stage-1-baseline-implementation-plan.md `
  src/automation/deskdata/deskdata-pdf-text-extractor.ts `
  tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts `
  tests/fixtures/database/create-legacy-research-history-database.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/renderer/agent-dashboard.test.tsx `
  tests/unit/main/ipc/register-session-ipc-handlers.test.ts
pnpm exec eslint `
  vitest.config.ts `
  src/automation/deskdata/deskdata-pdf-text-extractor.ts `
  tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts `
  tests/fixtures/database/create-legacy-research-history-database.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/renderer/agent-dashboard.test.tsx `
  tests/unit/main/ipc/register-session-ipc-handlers.test.ts `
  --cache --cache-location "$env:TEMP\agente-cpi-stage-1-eslint.cache"
```

Expected: build passes; every changed file passes Prettier; ESLint reports zero errors and
zero warnings for the listed TypeScript files.

- [ ] **Step 7: Review privacy and scope**

Run:

```powershell
rg -n "\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b" `
  src/automation/deskdata/deskdata-pdf-text-extractor.ts `
  tests/unit/automation/deskdata/deskdata-pdf-process-reader.test.ts `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts `
  tests/unit/shared/types/dashboard-agent-contracts.test.ts `
  tests/fixtures/database/create-legacy-research-history-database.ts `
  tests/unit/infrastructure/database/research-history-repository.test.ts `
  tests/unit/renderer/agent-dashboard.test.tsx `
  tests/unit/main/ipc/register-session-ipc-handlers.test.ts `
  docs/architecture `
  docs/superpowers/specs/2026-07-27-clean-architecture-refactoring-design.md `
  docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md `
  docs/superpowers/plans/2026-07-27-refactoring-stage-1-baseline-implementation-plan.md
git diff --check
git diff --name-status
git status --short
```

Expected:

- no complete CPF in production, tests or new documentation;
- no whitespace errors;
- no production module moved or renamed;
- only the three confirmed PDF message corrections alter runtime behavior;
- no commit exists for the Stage 1 work.

- [ ] **Step 8: Stop for Stage 1 review**

Report:

- tests and build results;
- before/after honest coverage totals;
- the confirmed encoding bug and its regression test;
- all added compatibility boundaries;
- exact changed-file list;
- known formatting/lint backlog intentionally deferred to Stage 2.

Do not begin Stage 2 and do not create its plan until the Stage 1 result is accepted.
