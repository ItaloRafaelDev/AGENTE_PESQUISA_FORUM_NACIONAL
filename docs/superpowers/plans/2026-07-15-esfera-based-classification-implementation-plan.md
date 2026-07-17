# Esfera-Based DeskData Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace text-keyword classification with deterministic classification based exclusively on the structured `Esfera` field collected from every DeskData process card and page.

**Architecture:** Domain code normalizes and classifies only `sphereRaw`. A DeskData extractor reads the field labeled `Esfera`, a collector expands cards and traverses pagination through a narrow port, and the continuous workflow consumes the completed classification before downloading/attaching the PDF and saving the CPI result. Collection-integrity failures propagate as blocking E1 errors; missing or unknown sphere values in successfully read cards remain non-criminal.

**Tech Stack:** TypeScript 5.9, Playwright 1.61, Electron 39, Vitest 4, pnpm, existing continuous research runtime and CPI/DeskData controllers.

## Global Constraints

- Only the value of the DeskData field labeled `Esfera` may determine criminality.
- `Vara`, `Assunto`, `Tipo`, `Classe`, `Tribunal`, `Comarca`, `Órgão`, `Status`, generic card text, page headers, and PDF text must never affect classification.
- `Criminal`, values containing the isolated word `criminal`, and exact normalized value `penal` are criminal spheres.
- `Especial Criminal`, `Juizado Especial Criminal`, `Criminal Militar`, and mixed values such as `Civil/Criminal` are criminal.
- Missing, empty, null, or unknown sphere values are non-criminal when the card was otherwise read successfully.
- A valid empty Processos section produces `HA_INFORMACOES`.
- Any criminal sphere in any process or page produces `SIM_CONSTA_RESTRICAO`.
- Process status never changes the result.
- Every process card and every available page must be read before the result is saved.
- A collection-integrity failure produces `ERRO_E1`, does not save a result, keeps the browser open, and prevents the next research.
- The PDF remains required for download, validation, history, and CPI attachment, but not classification.
- The old keyword/PDF classifier must not remain as a production fallback.
- No real CPF, full name, credential, token, cookie, portal response, or real report may be added to fixtures or tests.
- Run tests through `pnpm test`; do not invoke Vitest directly with the local Node runtime.
- No Git add, commit, branch, merge, reset, rebase, push, or pull command is part of this plan.
- The unrelated README installation work remains paused while this plan is implemented.

---

## File Map

### Domain

- Create: `src/domain/research/deskdata-process-record.ts`
  - Shared process-record and classification contracts.
- Create: `src/domain/research/normalize-process-sphere.ts`
  - Pure normalization and criminal-sphere predicate.
- Modify: `src/domain/research/classify-deskdata-result.ts`
  - Replace text inference with `DeskDataProcessRecord[]` classification.
- Modify: `tests/unit/domain/research/classify-deskdata-result.test.ts`
  - Full decision matrix.
- Create: `tests/unit/domain/research/normalize-process-sphere.test.ts`
  - Normalization and token-boundary matrix.

### DeskData extraction and collection

- Create: `src/automation/deskdata/deskdata-process-collection-error.ts`
  - Typed blocking collection error with safe codes.
- Create: `src/automation/deskdata/deskdata-sphere-extractor.ts`
  - Extracts only the field whose normalized label is `esfera`.
- Create: `tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts`
  - Synthetic field snapshots proving secondary fields are ignored.
- Create: `src/automation/deskdata/deskdata-process-page-port.ts`
  - Narrow interface used by the collector.
- Create: `src/automation/deskdata/deskdata-process-collector.ts`
  - Expansion, pagination, deduplication, count validation, and loop protection.
- Create: `tests/unit/automation/deskdata/deskdata-process-collector.test.ts`
  - Fake-port tests for all collection outcomes.
- Create: `src/automation/deskdata/playwright-deskdata-process-page-adapter.ts`
  - Real Playwright adapter for the DeskData page.
- Create: `tests/unit/automation/deskdata/playwright-deskdata-process-page-adapter.test.ts`
  - Synthetic DOM tests using Playwright `page.setContent` through the project test runtime.
- Modify: `scripts/inspect-deskdata-process-result.ts`
  - Add safe structured output containing process count, page count, and normalized spheres only.

### Workflow integration

- Create: `src/workflow/research/deskdata-process-classification-service.ts`
  - Coordinates collector and domain classifier.
- Create: `tests/unit/workflow/research/deskdata-process-classification-service.test.ts`
  - Service boundary and error propagation tests.
- Modify: the single production workflow source that currently calls `classifyDeskDataResult`.
  - Its exact path is discovered and recorded by Task 0 before editing; the plan fails if there is zero or more than one production call site.
- Modify: the corresponding workflow test file found beside or under `tests/unit/workflow`.
  - Adds CPI mapping, PDF preservation, and E1 blocking tests.

### Documentation

- Modify: `docs/superpowers/specs/2026-07-15-esfera-based-classification-design.md`
  - Mark implementation checkpoints as completed only after evidence exists.
- Create: `docs/superpowers/evidence/esfera-classification-homologation.md`
  - Anonymized checklist and command evidence; no real personal data.

---

### Task 0: Establish a Reproducible Baseline and Exact Integration Manifest

**Files:**

- Create: `docs/superpowers/evidence/esfera-classification-baseline.txt`
- Create: `docs/superpowers/evidence/esfera-integration-manifest.json`
- Preserve: `tests/unit/documentation/readme-installation-guard.test.ts`
- Preserve: `tests/unit/scripts/setup-windows-guard.test.ts`

**Interfaces:**

- Consumes: current repository tree and exact symbol occurrences.
- Produces: one exact production classifier call site and one exact related test path.

- [ ] **Step 1: Record the current baseline without running a portal action**

Run:

```powershell
Set-Location "E:\agente-cpi"

$evidenceDirectory = ".\docs\superpowers\evidence"
New-Item -ItemType Directory -Path $evidenceDirectory -Force | Out-Null

@(
  "CapturedAt=$(Get-Date -Format o)"
  "Node=$(node --version)"
  "Pnpm=$(pnpm --version)"
  "Project=$((Get-Location).Path)"
  ""
  "Relevant files:"
  Get-ChildItem .\src,.\tests,.\scripts -Recurse -File |
    Where-Object {
      $_.Name -match 'deskdata|classif|continuous|cycle|runner|workflow'
    } |
    ForEach-Object { $_.FullName }
) | Set-Content `
  -LiteralPath "$evidenceDirectory\esfera-classification-baseline.txt" `
  -Encoding utf8
```

Expected: evidence file exists and no browser opens.

- [ ] **Step 2: Discover the exact production call site**

Run:

```powershell
$productionMatches = Get-ChildItem .\src -Recurse -File -Filter *.ts |
  Select-String -Pattern 'classifyDeskDataResult\s*\(' |
  Where-Object {
    $_.Path -notmatch '\.test\.ts$'
  }

if ($productionMatches.Count -ne 1) {
  $productionMatches | Format-Table Path,LineNumber,Line -AutoSize
  throw "Esperado exatamente um call site de produção para classifyDeskDataResult; encontrados: $($productionMatches.Count)."
}

$productionPath = $productionMatches[0].Path

$testCandidates = Get-ChildItem .\tests -Recurse -File -Filter *.test.ts |
  Select-String -Pattern 'classifyDeskDataResult|SIM_CONSTA_RESTRICAO|HA_INFORMACOES' |
  Select-Object -ExpandProperty Path -Unique

$manifest = [ordered]@{
  productionClassifierCallSite = $productionPath
  productionClassifierLine = $productionMatches[0].LineNumber
  candidateWorkflowTests = @($testCandidates)
}

$manifest |
  ConvertTo-Json -Depth 5 |
  Set-Content `
    -LiteralPath ".\docs\superpowers\evidence\esfera-integration-manifest.json" `
    -Encoding utf8

Get-Content ".\docs\superpowers\evidence\esfera-integration-manifest.json"
```

Expected: JSON contains exactly one `productionClassifierCallSite`.

- [ ] **Step 3: Confirm the unrelated README RED tests are the only known baseline blocker**

Run:

```powershell
pnpm test -- `
  tests/unit/documentation/readme-installation-guard.test.ts `
  tests/unit/scripts/setup-windows-guard.test.ts
```

Expected: these two suites remain RED because the separate README implementation is paused.

Do not delete, skip, or weaken those tests. During Tasks 1–6, use focused classification test commands. The final global `validate` gate is executed only after the user decides whether to resume the README task or explicitly accepts that unrelated blocker as deferred.

---

### Task 1: Replace Text Inference with Sphere-Only Domain Classification

**Files:**

- Create: `src/domain/research/deskdata-process-record.ts`
- Create: `src/domain/research/normalize-process-sphere.ts`
- Modify: `src/domain/research/classify-deskdata-result.ts`
- Create: `tests/unit/domain/research/normalize-process-sphere.test.ts`
- Modify: `tests/unit/domain/research/classify-deskdata-result.test.ts`

**Interfaces:**

- Produces:
  - `DeskDataProcessRecord`
  - `DeskDataClassification`
  - `normalizeProcessSphere(value: string | null | undefined): string`
  - `isCriminalSphere(value: string | null | undefined): boolean`
  - `classifyDeskDataResult(processes: readonly DeskDataProcessRecord[]): DeskDataClassification`

- [ ] **Step 1: Write normalization tests in RED**

Create `tests/unit/domain/research/normalize-process-sphere.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isCriminalSphere,
  normalizeProcessSphere
} from '../../../../src/domain/research/normalize-process-sphere'

describe('normalizeProcessSphere', () => {
  it.each([
    ['  ESPECIAL   CRIMINAL  ', 'especial criminal'],
    ['Criminal/Penal', 'criminal penal'],
    ['CÍVEL E CRIMINAL', 'civel e criminal'],
    ['Criminal & Civil', 'criminal civil'],
    ['Criminal-Militar', 'criminal militar'],
    ['\n Juizado Especial Criminal \n', 'juizado especial criminal'],
    [null, ''],
    [undefined, '']
  ])('normaliza %j para %j', (input, expected) => {
    expect(normalizeProcessSphere(input)).toBe(expected)
  })
})

describe('isCriminalSphere', () => {
  it.each([
    'Criminal',
    'Penal',
    'Criminal Militar',
    'Criminal/Penal',
    'Especial Criminal',
    'Juizado Especial Criminal',
    'Civil/Criminal',
    'Cível e Criminal',
    'Criminal e Civil'
  ])('reconhece %s como criminal', (sphere) => {
    expect(isCriminalSphere(sphere)).toBe(true)
  })

  it.each([
    'Civil',
    'Cível',
    'Trabalhista',
    'Eleitoral',
    'Administrativa',
    'penalidade administrativa',
    'criminalidade estatística',
    '',
    null,
    undefined
  ])('não reconhece %j como criminal', (sphere) => {
    expect(isCriminalSphere(sphere)).toBe(false)
  })
})
```

- [ ] **Step 2: Replace classifier tests with the approved matrix in RED**

Create or replace `tests/unit/domain/research/classify-deskdata-result.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyDeskDataResult } from '../../../../src/domain/research/classify-deskdata-result'
import type { DeskDataProcessRecord } from '../../../../src/domain/research/deskdata-process-record'

function process(
  sphereRaw: string | null,
  overrides: Partial<DeskDataProcessRecord> = {}
): DeskDataProcessRecord {
  return {
    processKey: overrides.processKey ?? `key-${Math.random()}`,
    processNumber: overrides.processNumber ?? null,
    sphereRaw,
    sourcePage: overrides.sourcePage ?? 1
  }
}

describe('classifyDeskDataResult', () => {
  it('retorna Há Informações sem processos', () => {
    expect(classifyDeskDataResult([])).toEqual({
      result: 'HA_INFORMACOES',
      reason: 'NO_CRIMINAL_SPHERE',
      totalProcesses: 0,
      normalizedSpheres: []
    })
  })

  it.each([
    'Civil',
    'Cível',
    'Trabalhista',
    'Eleitoral',
    'Administrativa',
    'Valor desconhecido',
    '',
    null
  ])('retorna Há Informações para Esfera %j', (sphere) => {
    expect(classifyDeskDataResult([process(sphere)]).result).toBe('HA_INFORMACOES')
  })

  it.each([
    'Criminal',
    'Penal',
    'Criminal Militar',
    'Especial Criminal',
    'Juizado Especial Criminal',
    'Civil/Criminal',
    'Cível e Criminal',
    'Criminal e Civil'
  ])('retorna restrição para Esfera %s', (sphere) => {
    expect(classifyDeskDataResult([process(sphere)])).toMatchObject({
      result: 'SIM_CONSTA_RESTRICAO',
      reason: 'CRIMINAL_SPHERE_FOUND',
      totalProcesses: 1
    })
  })

  it('faz prevalecer uma Esfera criminal em qualquer página', () => {
    const result = classifyDeskDataResult([
      process('Civil', { processKey: '1', sourcePage: 1 }),
      process('Trabalhista', { processKey: '2', sourcePage: 1 }),
      process('Especial Criminal', { processKey: '3', sourcePage: 3 })
    ])

    expect(result.result).toBe('SIM_CONSTA_RESTRICAO')
    expect(result.normalizedSpheres).toEqual(['civil', 'trabalhista', 'especial criminal'])
  })
})
```

Replace `Math.random()` before final GREEN with deterministic keys if the project lint rule rejects it; the production code never uses this helper.

- [ ] **Step 3: Run domain tests and verify RED**

Run:

```powershell
pnpm test -- `
  tests/unit/domain/research/normalize-process-sphere.test.ts `
  tests/unit/domain/research/classify-deskdata-result.test.ts
```

Expected: FAIL because the new contracts/functions do not exist or the old classifier accepts text rather than process records.

- [ ] **Step 4: Add domain contracts**

Create `src/domain/research/deskdata-process-record.ts`:

```ts
export interface DeskDataProcessRecord {
  processKey: string
  processNumber: string | null
  sphereRaw: string | null
  sourcePage: number
}

export type DeskDataResult = 'SIM_CONSTA_RESTRICAO' | 'HA_INFORMACOES'

export type DeskDataClassificationReason = 'CRIMINAL_SPHERE_FOUND' | 'NO_CRIMINAL_SPHERE'

export interface DeskDataClassification {
  result: DeskDataResult
  reason: DeskDataClassificationReason
  totalProcesses: number
  normalizedSpheres: string[]
}
```

- [ ] **Step 5: Implement normalization and predicate**

Create `src/domain/research/normalize-process-sphere.ts`:

```ts
export function normalizeProcessSphere(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCriminalSphere(value: string | null | undefined): boolean {
  const normalized = normalizeProcessSphere(value)

  if (normalized === 'penal') {
    return true
  }

  return /(?:^|\s)criminal(?:\s|$)/.test(normalized)
}
```

- [ ] **Step 6: Implement sphere-only classifier**

Replace `src/domain/research/classify-deskdata-result.ts` with:

```ts
import type { DeskDataClassification, DeskDataProcessRecord } from './deskdata-process-record'
import { isCriminalSphere, normalizeProcessSphere } from './normalize-process-sphere'

export function classifyDeskDataResult(
  processes: readonly DeskDataProcessRecord[]
): DeskDataClassification {
  const normalizedSpheres = processes
    .map((process) => normalizeProcessSphere(process.sphereRaw))
    .filter(Boolean)

  const criminalFound = processes.some((process) => isCriminalSphere(process.sphereRaw))

  return {
    result: criminalFound ? 'SIM_CONSTA_RESTRICAO' : 'HA_INFORMACOES',
    reason: criminalFound ? 'CRIMINAL_SPHERE_FOUND' : 'NO_CRIMINAL_SPHERE',
    totalProcesses: processes.length,
    normalizedSpheres
  }
}
```

- [ ] **Step 7: Run GREEN gates for Task 1**

Run:

```powershell
pnpm test -- `
  tests/unit/domain/research/normalize-process-sphere.test.ts `
  tests/unit/domain/research/classify-deskdata-result.test.ts

pnpm run typecheck
```

Expected: focused tests and typecheck pass. Existing production call site may fail typecheck until Task 5; when that occurs, record the exact error in the baseline evidence and continue only with focused tests until the integration task updates the caller.

---

### Task 2: Implement Strict Esfera Extraction from Structured Fields

**Files:**

- Create: `src/automation/deskdata/deskdata-process-collection-error.ts`
- Create: `src/automation/deskdata/deskdata-sphere-extractor.ts`
- Create: `tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts`

**Interfaces:**

- Produces:
  - `DeskDataProcessCollectionError`
  - `DeskDataFieldSnapshot`
  - `extractSphereFromFields(fields): string | null`

- [ ] **Step 1: Write extractor tests in RED**

Create `tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractSphereFromFields } from '../../../../src/automation/deskdata/deskdata-sphere-extractor'
import { DeskDataProcessCollectionError } from '../../../../src/automation/deskdata/deskdata-process-collection-error'

describe('extractSphereFromFields', () => {
  it('extrai somente o campo Esfera', () => {
    expect(
      extractSphereFromFields([
        { label: 'Vara', value: 'Juizado Especial Cível e Criminal' },
        { label: 'Esfera', value: 'Civil' },
        { label: 'Assunto', value: 'Matéria criminal citada no título' }
      ])
    ).toBe('Civil')
  })

  it.each([
    [{ label: 'ESFERA', value: 'Especial Criminal' }],
    [{ label: '  Esféra  ', value: 'Penal' }]
  ])('normaliza o rótulo sem alterar o valor', (fields) => {
    expect(extractSphereFromFields(fields)).toBe(fields[0].value)
  })

  it('retorna null quando o campo está ausente', () => {
    expect(extractSphereFromFields([{ label: 'Vara', value: 'Criminal' }])).toBeNull()
  })

  it('retorna null quando o valor está vazio', () => {
    expect(extractSphereFromFields([{ label: 'Esfera', value: '   ' }])).toBeNull()
  })

  it('rejeita valores conflitantes de Esfera no mesmo cartão', () => {
    expect(() =>
      extractSphereFromFields([
        { label: 'Esfera', value: 'Civil' },
        { label: 'Esfera', value: 'Criminal' }
      ])
    ).toThrowError(DeskDataProcessCollectionError)
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts
```

Expected: FAIL because extractor/error files do not exist.

- [ ] **Step 3: Add typed collection error**

Create `src/automation/deskdata/deskdata-process-collection-error.ts`:

```ts
export type DeskDataProcessCollectionErrorCode =
  | 'PROCESS_SECTION_NOT_FOUND'
  | 'PROCESS_SECTION_NOT_READY'
  | 'PROCESS_CARD_EXPANSION_FAILED'
  | 'PROCESS_CARD_STRUCTURE_INVALID'
  | 'PROCESS_PAGINATION_STALLED'
  | 'PROCESS_PAGINATION_LOOP'
  | 'PROCESS_COUNT_MISMATCH'
  | 'PROCESS_COLLECTION_INCOMPLETE'

export class DeskDataProcessCollectionError extends Error {
  constructor(
    readonly code: DeskDataProcessCollectionErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DeskDataProcessCollectionError'
  }
}
```

- [ ] **Step 4: Implement strict field extraction**

Create `src/automation/deskdata/deskdata-sphere-extractor.ts`:

```ts
import { normalizeProcessSphere } from '../../domain/research/normalize-process-sphere'
import { DeskDataProcessCollectionError } from './deskdata-process-collection-error'

export interface DeskDataFieldSnapshot {
  label: string
  value: string | null
}

export function extractSphereFromFields(fields: readonly DeskDataFieldSnapshot[]): string | null {
  const sphereValues = fields
    .filter((field) => normalizeProcessSphere(field.label) === 'esfera')
    .map((field) => field.value?.trim() ?? '')
    .filter(Boolean)

  const distinctValues = [
    ...new Map(sphereValues.map((value) => [normalizeProcessSphere(value), value])).values()
  ]

  if (distinctValues.length > 1) {
    throw new DeskDataProcessCollectionError(
      'PROCESS_CARD_STRUCTURE_INVALID',
      'O cartão contém valores conflitantes para o campo Esfera.'
    )
  }

  return distinctValues[0] ?? null
}
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts
```

Expected: all extractor tests pass.

---

### Task 3: Implement Complete Collection, Deduplication, and Pagination Guards

**Files:**

- Create: `src/automation/deskdata/deskdata-process-page-port.ts`
- Create: `src/automation/deskdata/deskdata-process-collector.ts`
- Create: `tests/unit/automation/deskdata/deskdata-process-collector.test.ts`

**Interfaces:**

- Consumes: `DeskDataProcessPagePort` snapshots.
- Produces: `DeskDataProcessCollector.collect(): Promise<DeskDataProcessRecord[]>`.

- [ ] **Step 1: Define the page-port contract**

Create `src/automation/deskdata/deskdata-process-page-port.ts`:

```ts
import type { DeskDataFieldSnapshot } from './deskdata-sphere-extractor'

export interface DeskDataProcessCardSnapshot {
  processKey: string
  processNumber: string | null
  fields: DeskDataFieldSnapshot[]
}

export interface DeskDataProcessPageSnapshot {
  pageNumber: number
  pageSignature: string
  expectedProcessCount: number | null
  totalPages: number | null
  empty: boolean
  cards: DeskDataProcessCardSnapshot[]
  hasNextPage: boolean
}

export interface DeskDataProcessPagePort {
  waitUntilReady(): Promise<void>
  expandAllCards(): Promise<void>
  readCurrentPage(): Promise<DeskDataProcessPageSnapshot>
  goToNextPage(previousSignature: string): Promise<void>
}
```

- [ ] **Step 2: Write collector tests in RED**

Create `tests/unit/automation/deskdata/deskdata-process-collector.test.ts` with a deterministic fake port covering:

```ts
import { describe, expect, it } from 'vitest'
import { DeskDataProcessCollector } from '../../../../src/automation/deskdata/deskdata-process-collector'
import type {
  DeskDataProcessPagePort,
  DeskDataProcessPageSnapshot
} from '../../../../src/automation/deskdata/deskdata-process-page-port'
import { DeskDataProcessCollectionError } from '../../../../src/automation/deskdata/deskdata-process-collection-error'

class FakePagePort implements DeskDataProcessPagePort {
  private index = 0

  constructor(
    private readonly pages: DeskDataProcessPageSnapshot[],
    private readonly failExpansion = false
  ) {}

  async waitUntilReady(): Promise<void> {}

  async expandAllCards(): Promise<void> {
    if (this.failExpansion) {
      throw new DeskDataProcessCollectionError(
        'PROCESS_CARD_EXPANSION_FAILED',
        'Falha sintética de expansão.'
      )
    }
  }

  async readCurrentPage(): Promise<DeskDataProcessPageSnapshot> {
    return this.pages[this.index]
  }

  async goToNextPage(): Promise<void> {
    this.index = Math.min(this.index + 1, this.pages.length - 1)
  }
}

function page(overrides: Partial<DeskDataProcessPageSnapshot>): DeskDataProcessPageSnapshot {
  return {
    pageNumber: 1,
    pageSignature: 'page-1',
    expectedProcessCount: null,
    totalPages: 1,
    empty: false,
    cards: [],
    hasNextPage: false,
    ...overrides
  }
}

describe('DeskDataProcessCollector', () => {
  it('retorna lista vazia para ausência explícita de processos', async () => {
    const collector = new DeskDataProcessCollector(new FakePagePort([page({ empty: true })]))

    await expect(collector.collect()).resolves.toEqual([])
  })

  it('coleta e deduplica processos em todas as páginas', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          pageSignature: 'page-1',
          totalPages: 2,
          hasNextPage: true,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: '0000001-00.2024.0.00.0001',
              fields: [{ label: 'Esfera', value: 'Civil' }]
            }
          ]
        }),
        page({
          pageNumber: 2,
          pageSignature: 'page-2',
          totalPages: 2,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: '0000001-00.2024.0.00.0001',
              fields: [{ label: 'Esfera', value: 'Civil' }]
            },
            {
              processKey: 'proc-2',
              processNumber: '0000002-00.2024.0.00.0002',
              fields: [{ label: 'Esfera', value: 'Especial Criminal' }]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).resolves.toEqual([
      {
        processKey: 'proc-1',
        processNumber: '0000001-00.2024.0.00.0001',
        sphereRaw: 'Civil',
        sourcePage: 1
      },
      {
        processKey: 'proc-2',
        processNumber: '0000002-00.2024.0.00.0002',
        sphereRaw: 'Especial Criminal',
        sourcePage: 2
      }
    ])
  })

  it('falha quando a assinatura da página se repete', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({ pageSignature: 'same', hasNextPage: true }),
        page({ pageNumber: 2, pageSignature: 'same' })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_PAGINATION_LOOP'
    })
  })

  it('falha quando a quantidade final diverge', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          expectedProcessCount: 2,
          cards: [
            {
              processKey: 'only-one',
              processNumber: null,
              fields: [{ label: 'Esfera', value: 'Civil' }]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_COUNT_MISMATCH'
    })
  })
})
```

- [ ] **Step 3: Verify RED**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-process-collector.test.ts
```

Expected: FAIL because collector does not exist.

- [ ] **Step 4: Implement collector**

Create `src/automation/deskdata/deskdata-process-collector.ts`:

```ts
import type { DeskDataProcessRecord } from '../../domain/research/deskdata-process-record'
import { DeskDataProcessCollectionError } from './deskdata-process-collection-error'
import type { DeskDataProcessPagePort } from './deskdata-process-page-port'
import { extractSphereFromFields } from './deskdata-sphere-extractor'

export class DeskDataProcessCollector {
  constructor(
    private readonly pagePort: DeskDataProcessPagePort,
    private readonly maximumPages = 100
  ) {}

  async collect(): Promise<DeskDataProcessRecord[]> {
    await this.pagePort.waitUntilReady()

    const records = new Map<string, DeskDataProcessRecord>()
    const visitedSignatures = new Set<string>()
    let expectedProcessCount: number | null = null

    for (let iteration = 0; iteration < this.maximumPages; iteration += 1) {
      await this.pagePort.expandAllCards()
      const snapshot = await this.pagePort.readCurrentPage()

      if (visitedSignatures.has(snapshot.pageSignature)) {
        throw new DeskDataProcessCollectionError(
          'PROCESS_PAGINATION_LOOP',
          'A paginação da seção Processos repetiu uma página já visitada.'
        )
      }

      visitedSignatures.add(snapshot.pageSignature)
      expectedProcessCount ??= snapshot.expectedProcessCount

      if (snapshot.empty) {
        if (records.size > 0 || snapshot.cards.length > 0) {
          throw new DeskDataProcessCollectionError(
            'PROCESS_COLLECTION_INCOMPLETE',
            'A seção Processos informou ausência e registros simultaneamente.'
          )
        }

        return []
      }

      for (const card of snapshot.cards) {
        if (!card.processKey.trim()) {
          throw new DeskDataProcessCollectionError(
            'PROCESS_CARD_STRUCTURE_INVALID',
            'Um cartão de processo não possui chave técnica.'
          )
        }

        if (!records.has(card.processKey)) {
          records.set(card.processKey, {
            processKey: card.processKey,
            processNumber: card.processNumber,
            sphereRaw: extractSphereFromFields(card.fields),
            sourcePage: snapshot.pageNumber
          })
        }
      }

      if (!snapshot.hasNextPage) {
        const result = [...records.values()]

        if (expectedProcessCount !== null && expectedProcessCount !== result.length) {
          throw new DeskDataProcessCollectionError(
            'PROCESS_COUNT_MISMATCH',
            `Quantidade esperada: ${expectedProcessCount}; coletada: ${result.length}.`
          )
        }

        return result
      }

      await this.pagePort.goToNextPage(snapshot.pageSignature)
    }

    throw new DeskDataProcessCollectionError(
      'PROCESS_COLLECTION_INCOMPLETE',
      `A coleta excedeu o limite seguro de ${this.maximumPages} páginas.`
    )
  }
}
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/deskdata/deskdata-process-collector.test.ts `
  tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts
```

Expected: focused tests pass.

---

### Task 4: Implement the Playwright DeskData Page Adapter and Safe Inspection

**Files:**

- Create: `src/automation/deskdata/playwright-deskdata-process-page-adapter.ts`
- Create: `tests/unit/automation/deskdata/playwright-deskdata-process-page-adapter.test.ts`
- Modify: `scripts/inspect-deskdata-process-result.ts`

**Interfaces:**

- Implements: `DeskDataProcessPagePort`.
- Uses semantic labels and the Processos section; no classification logic.

- [ ] **Step 1: Add synthetic DOM tests in RED**

The test must use synthetic HTML only and cover:

```html
<section aria-labelledby="processos-title">
  <h2 id="processos-title">Processos</h2>
  <article data-process-card="1">
    <button aria-expanded="false">Processo 1</button>
    <div hidden>
      <dl>
        <dt>Vara</dt>
        <dd>Juizado Especial Cível e Criminal</dd>
        <dt>Esfera</dt>
        <dd>Civil</dd>
        <dt>Status</dt>
        <dd>Arquivado</dd>
      </dl>
    </div>
  </article>
</section>
```

Required assertions:

- adapter finds the Processos section;
- `expandAllCards` changes `aria-expanded` to true and reveals the content;
- `readCurrentPage` returns one card;
- fields contain `Esfera = Civil`;
- Vara containing “Criminal” is preserved only as a field and never classified by the adapter;
- an explicit `Não foram encontrados processos` state returns `empty: true`;
- a missing Processos section throws `PROCESS_SECTION_NOT_FOUND`;
- a Next button that does not change the signature throws `PROCESS_PAGINATION_STALLED`.

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/playwright-deskdata-process-page-adapter.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement adapter with semantic isolation**

Create `src/automation/deskdata/playwright-deskdata-process-page-adapter.ts` with these exact public methods:

```ts
export class PlaywrightDeskDataProcessPageAdapter implements DeskDataProcessPagePort {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs = 15_000
  ) {}

  waitUntilReady(): Promise<void>
  expandAllCards(): Promise<void>
  readCurrentPage(): Promise<DeskDataProcessPageSnapshot>
  goToNextPage(previousSignature: string): Promise<void>
}
```

Implementation rules:

1. Locate a visible heading or text node exactly matching `Processos`.
2. Resolve the smallest visible ancestor that contains either:
   - an explicit no-process message; or
   - at least one exact `Esfera` field label; or
   - at least one process card/accordion trigger.
3. Expand only triggers inside that resolved section and only when `aria-expanded="false"` or the associated panel is hidden.
4. Read field pairs from `dt/dd`, table rows, or label/value sibling blocks.
5. Construct `processKey` in priority order:
   - normalized process number;
   - stable `id`/`data-*` identifier;
   - SHA-safe deterministic string signature of sanitized structural fields.
6. Detect explicit empty messages with a bounded expression equivalent to:

```ts
;/(não|nao|nenhum|nenhuma|sem).{0,60}(processo|processos|registro)/i
```

7. Detect pagination only inside or directly associated with the Processos section.
8. Use accessible names `Próximo`, `Proxima`, `Next`, or `>` and ignore disabled controls.
9. After clicking Next, wait until `pageSignature` differs from the previous signature.
10. Never search the full page for the word `criminal`.
11. Never return CPF, names, or full card text in errors.

Because the exact DeskData DOM is external and can change, keep all structural selector arrays at the top of this adapter file and fail closed with `DeskDataProcessCollectionError` when semantic isolation is ambiguous.

- [ ] **Step 4: Extend the existing inspection script safely**

Modify `scripts/inspect-deskdata-process-result.ts` after its existing DeskData page/session validation:

```ts
const processPage = new PlaywrightDeskDataProcessPageAdapter(deskDataPage)
const processes = await new DeskDataProcessCollector(processPage).collect()
const classification = classifyDeskDataResult(processes)

console.log(
  JSON.stringify(
    {
      processCount: processes.length,
      normalizedSpheres: classification.normalizedSpheres,
      result: classification.result,
      reason: classification.reason
    },
    null,
    2
  )
)
```

Do not print process numbers, card text, CPF, or name.

- [ ] **Step 5: Run adapter and regression tests**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/deskdata/playwright-deskdata-process-page-adapter.test.ts `
  tests/unit/automation/deskdata/deskdata-process-collector.test.ts `
  tests/unit/automation/deskdata/deskdata-process-dom-capture.test.ts `
  tests/unit/automation/deskdata/deskdata-process-result-inspector.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Perform one authenticated inspection without saving CPI**

Run the existing inspection command only after manual login:

```powershell
pnpm run deskdata:inspect-result
```

Expected output contains only:

```json
{
  "processCount": 1,
  "normalizedSpheres": ["civil"],
  "result": "HA_INFORMACOES",
  "reason": "NO_CRIMINAL_SPHERE"
}
```

The actual count/sphere may differ. No CPI result is saved by this inspection command.

Stop immediately when the adapter cannot isolate Processos or pagination safely. Do not guess a selector from unrelated page content.

---

### Task 5: Integrate Sphere Collection into the Continuous Workflow and E1 Boundary

**Files:**

- Create: `src/workflow/research/deskdata-process-classification-service.ts`
- Create: `tests/unit/workflow/research/deskdata-process-classification-service.test.ts`
- Modify: exact `productionClassifierCallSite` from `docs/superpowers/evidence/esfera-integration-manifest.json`
- Modify: exact related workflow test selected from `candidateWorkflowTests` in the manifest

**Interfaces:**

- Produces: `DeskDataProcessClassificationService.classify(page: Page): Promise<DeskDataClassification>`.
- Workflow receives completed classification before PDF/CPI save.

- [ ] **Step 1: Write service tests in RED**

Create `tests/unit/workflow/research/deskdata-process-classification-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DeskDataProcessClassificationService } from '../../../../src/workflow/research/deskdata-process-classification-service'
import type { DeskDataProcessCollector } from '../../../../src/automation/deskdata/deskdata-process-collector'
import { DeskDataProcessCollectionError } from '../../../../src/automation/deskdata/deskdata-process-collection-error'

function collectorReturning(
  value: Awaited<ReturnType<DeskDataProcessCollector['collect']>>
): Pick<DeskDataProcessCollector, 'collect'> {
  return {
    collect: async () => value
  }
}

describe('DeskDataProcessClassificationService', () => {
  it('classifica usando somente Esfera', async () => {
    const service = new DeskDataProcessClassificationService(
      collectorReturning([
        {
          processKey: '1',
          processNumber: null,
          sphereRaw: 'Civil',
          sourcePage: 1
        },
        {
          processKey: '2',
          processNumber: null,
          sphereRaw: 'Especial Criminal',
          sourcePage: 2
        }
      ])
    )

    await expect(service.classify()).resolves.toMatchObject({
      result: 'SIM_CONSTA_RESTRICAO',
      totalProcesses: 2
    })
  })

  it('propaga erro de coleta sem produzir classificação', async () => {
    const service = new DeskDataProcessClassificationService({
      collect: async () => {
        throw new DeskDataProcessCollectionError('PROCESS_PAGINATION_STALLED', 'Falha sintética.')
      }
    })

    await expect(service.classify()).rejects.toMatchObject({
      code: 'PROCESS_PAGINATION_STALLED'
    })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
pnpm test -- tests/unit/workflow/research/deskdata-process-classification-service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service**

Create `src/workflow/research/deskdata-process-classification-service.ts`:

```ts
import type { DeskDataProcessCollector } from '../../automation/deskdata/deskdata-process-collector'
import { classifyDeskDataResult } from '../../domain/research/classify-deskdata-result'
import type { DeskDataClassification } from '../../domain/research/deskdata-process-record'

export class DeskDataProcessClassificationService {
  constructor(private readonly collector: Pick<DeskDataProcessCollector, 'collect'>) {}

  async classify(): Promise<DeskDataClassification> {
    const processes = await this.collector.collect()
    return classifyDeskDataResult(processes)
  }
}
```

- [ ] **Step 4: Update the exact production caller**

Read the manifest:

```powershell
$manifest = Get-Content `
  ".\docs\superpowers\evidence\esfera-integration-manifest.json" `
  -Raw |
  ConvertFrom-Json

$flowFile = $manifest.productionClassifierCallSite
Get-Content -LiteralPath $flowFile
```

In that file:

1. Remove the production call that passes page text, inspection text, PDF text, or keyword-derived fields to `classifyDeskDataResult`.
2. After DeskData result loading succeeds and before PDF/CPI save, instantiate:

```ts
const processPageAdapter = new PlaywrightDeskDataProcessPageAdapter(deskDataPage)
const processCollector = new DeskDataProcessCollector(processPageAdapter)
const classificationService = new DeskDataProcessClassificationService(processCollector)
const classification = await classificationService.classify()
```

3. Pass `classification.result` to the existing CPI result mapper.
4. Keep the existing PDF download, validation, upload, attachment, and save sequence.
5. Log only:

```ts
{
  processCount: classification.totalProcesses,
  normalizedSpheres: classification.normalizedSpheres,
  result: classification.result,
  reason: classification.reason
}
```

6. In the existing top-level cycle error boundary, map `DeskDataProcessCollectionError` to the current E1 blocking path. Do not catch it and convert it to `HA_INFORMACOES`.
7. Ensure no CPI field is selected or saved before `classificationService.classify()` resolves.

- [ ] **Step 5: Add workflow integration assertions**

In the exact related test file selected from the manifest, add tests proving:

- `Civil` maps to **Há Informações**;
- `Especial Criminal` maps to **Sim, Consta Restrições**;
- one criminal sphere on page 2 prevails;
- collection error does not call CPI result selection;
- collection error does not call CPI save;
- collection error does not start the next research;
- PDF download and attachment still occur after successful classification;
- status and Vara data never enter the classifier input.

Use synthetic records only.

- [ ] **Step 6: Run integration GREEN gates**

Run:

```powershell
pnpm test -- `
  tests/unit/workflow/research/deskdata-process-classification-service.test.ts `
  tests/unit/domain/research/classify-deskdata-result.test.ts `
  tests/unit/automation/deskdata/deskdata-process-collector.test.ts

pnpm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 7: Prove the old production fallback is gone**

Run:

```powershell
$matches = Get-ChildItem .\src -Recurse -File -Filter *.ts |
  Select-String -Pattern 'classifyDeskDataResult\s*\('

$matches | Format-Table Path,LineNumber,Line -AutoSize
```

Expected:

- one definition in `src/domain/research/classify-deskdata-result.ts`;
- one call through `DeskDataProcessClassificationService`;
- no production call passing raw text/PDF text.

Also search for obsolete keyword patterns in the production classifier path:

```powershell
Get-ChildItem .\src -Recurse -File -Filter *.ts |
  Select-String -Pattern 'RELEVANT_TEXT_PATTERN|ProcessNatureClassifier|criminal.*bodyText|criminal.*pdf' |
  Format-Table Path,LineNumber,Line -AutoSize
```

Review every match. Inspector-only keyword collection may remain for diagnostics, but the continuous workflow must not use it for classification.

---

### Task 6: Complete Regression Tests, Evidence, and Real Homologation Checklist

**Files:**

- Create: `docs/superpowers/evidence/esfera-classification-homologation.md`
- Modify: `docs/superpowers/specs/2026-07-15-esfera-based-classification-design.md`

**Interfaces:**

- Produces: anonymized evidence that all approved outcomes and E1 behavior were verified.

- [ ] **Step 1: Run all classification-related tests**

Run:

```powershell
pnpm test -- `
  tests/unit/domain/research/normalize-process-sphere.test.ts `
  tests/unit/domain/research/classify-deskdata-result.test.ts `
  tests/unit/automation/deskdata/deskdata-sphere-extractor.test.ts `
  tests/unit/automation/deskdata/deskdata-process-collector.test.ts `
  tests/unit/automation/deskdata/playwright-deskdata-process-page-adapter.test.ts `
  tests/unit/workflow/research/deskdata-process-classification-service.test.ts
```

Expected: all focused suites pass.

- [ ] **Step 2: Run static quality gates that are not blocked by the paused README RED tests**

Run:

```powershell
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run build
```

Expected: all four commands pass.

- [ ] **Step 3: Decide the global validation gate explicitly**

Run:

```powershell
pnpm run validate
```

Expected outcomes:

- PASS when the README installation task has already been completed; or
- FAIL only in the two previously recorded README RED guard suites.

Any other failure blocks homologation and must be corrected before proceeding.

Do not delete or skip unrelated tests merely to make `validate` green.

- [ ] **Step 4: Create anonymized homologation evidence**

Create `docs/superpowers/evidence/esfera-classification-homologation.md`:

```markdown
# Homologação — Classificação por Esfera

## Automated gates

- [ ] Domain normalization tests passed.
- [ ] Domain classification tests passed.
- [ ] Sphere extraction tests passed.
- [ ] Pagination/collection tests passed.
- [ ] Playwright adapter synthetic DOM tests passed.
- [ ] Workflow integration tests passed.
- [ ] Typecheck passed.
- [ ] Lint passed.
- [ ] Format check passed.
- [ ] Build passed.
- [ ] Global validate passed, or the only deferred failures are the documented README RED guards.

## Authenticated real scenarios

Record only research ID masked or synthetic scenario labels. Do not record CPF or full name.

- [ ] Valid Processos section with no records → Há Informações.
- [ ] Only Civil → Há Informações.
- [ ] Only non-criminal unknown value → Há Informações.
- [ ] Criminal → Sim, Consta Restrições.
- [ ] Especial Criminal → Sim, Consta Restrições.
- [ ] Civil + Criminal → Sim, Consta Restrições.
- [ ] Vara contains “Criminal”, Esfera Civil → Há Informações.
- [ ] Criminal process archived/closed → Sim, Consta Restrições.
- [ ] More than one page fully traversed.
- [ ] Controlled pagination failure → ERRO_E1.
- [ ] ERRO_E1 leaves browser open.
- [ ] ERRO_E1 does not save CPI result.
- [ ] ERRO_E1 does not start the next research.
- [ ] Successful classification still downloads and attaches PDF.

## Sign-off

- Operator: recorded outside the repository.
- Date/time: recorded without personal candidate data.
- Result: APPROVED only when every applicable checkbox is complete.
```

- [ ] **Step 5: Homologate through the dashboard sequentially**

For each real scenario:

1. Start the agent manually.
2. Complete manual login when requested.
3. Process exactly one controlled research.
4. Observe normalized sphere/result in safe logs.
5. Confirm CPI result before allowing the next cycle.
6. Confirm PDF attachment.
7. Stop the agent between scenarios when controlled isolation is required.
8. Mark the anonymized checklist.

For the controlled E1 test, use a synthetic or non-costly page-adapter test when possible. Do not deliberately consume an additional paid query merely to break pagination.

- [ ] **Step 6: Final acceptance review**

The feature is accepted only when:

```text
Only Esfera determines criminality
All cards/pages are read
Any criminal sphere prevails
Missing/unknown sphere is non-criminal
Status is ignored
Collection failure becomes E1
E1 does not save or continue
PDF remains downloaded and attached
Focused tests, typecheck, lint, format, and build pass
Real scenarios are checked without recording personal data
```

---

## Execution Order Checklist

- [ ] Task 0 — Baseline and exact integration manifest.
- [ ] Task 1 — Domain normalization and sphere-only classification.
- [ ] Task 2 — Strict Esfera field extractor.
- [ ] Task 3 — Complete collector, deduplication, and pagination guards.
- [ ] Task 4 — Playwright adapter and safe authenticated inspection.
- [ ] Task 5 — Continuous workflow integration and E1 boundary.
- [ ] Task 6 — Regression gates and real homologation.

## Stop Conditions

Stop immediately and request review when:

- the manifest finds zero or multiple production classifier call sites;
- the real Processos section cannot be isolated semantically;
- a card structure cannot distinguish labels from values;
- pagination advances without a detectable content change;
- a focused test fails repeatedly after the minimal implementation;
- typecheck reveals a second undocumented classification path;
- a real test would require exposing personal data or consuming an unnecessary paid query;
- any E1 path still selects or saves a CPI result;
- PDF attachment regresses.
