# Agente CPI UML AS-IS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 18 traceable PlantUML diagrams for the current Agente CPI runtime, render them to SVG and PNG, and produce a visually verified consolidated PDF without changing production behavior.

**Architecture:** A typed TypeScript manifest is the single source of metadata for all diagrams and their code references. A validator enforces source count, syntax, privacy, AS-IS scope, and traceability. PlantUML renders the diagrams; Playwright generates page PDFs from deterministic HTML; `pdf-lib` merges portrait and landscape pages into the final report. A PowerShell orchestrator performs dependency checks, rendering, report generation, and artifact verification.

**Tech Stack:** TypeScript 5.9, Node.js 22, pnpm, Vitest 4, PlantUML, Java, Graphviz, Playwright 1.61, `pdf-lib` 1.17.1, PowerShell, existing Electron project tooling.

## Global Constraints

- Document only the AS-IS code present in the current repository snapshot.
- Do not include the future minor search by Name + Date of Birth.
- Do not change runtime behavior in `src/**`.
- Do not include CPF, full name, date of birth, credentials, cookies, tokens, or session content.
- Use exact class, interface, type, state, IPC channel, table, and method names from the code.
- Clearly separate runtime-reachable modules from auxiliary modules.
- Produce exactly 18 numbered `.puml` sources.
- Produce exactly 18 SVG and 18 PNG diagram files.
- Produce `docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf`.
- Do not commit PlantUML binaries or font files.
- Run tests through `pnpm test`; do not invoke Vitest directly.
- Run `pnpm run validate` before completion.
- Render the final PDF to images and inspect every page before claiming completion.
- Use ASCII hyphens in generated report copy to avoid PDF renderer glyph failures.
- Every task ends with a focused verification and a commit.

---

## File Map

### Project configuration

- Modify: `package.json`
  - Add UML validation, report, build, and artifact verification commands.
  - Add `pdf-lib@1.17.1` as a development dependency.
- Modify: `.prettierignore`
  - Ignore generated UML artifacts and PlantUML source files from generic Prettier parsing.

### UML metadata and validation

- Create: `scripts/uml-as-is/uml-manifest.ts`
  - Defines the 18 diagrams, titles, groups, orientations, descriptions, and source files.
- Create: `scripts/uml-as-is/validate-uml-sources.ts`
  - Validates the manifest and PlantUML source set.
- Create: `scripts/uml-as-is/verify-uml-artifacts.ts`
  - Validates generated SVG, PNG, and PDF artifacts.
- Create: `tests/unit/scripts/uml-as-is-manifest.test.ts`
  - Validates the manifest and referenced project files.
- Create: `tests/unit/scripts/uml-as-is-validator.test.ts`
  - Tests missing files, malformed UML, privacy violations, and AS-IS violations.
- Create: `tests/unit/scripts/uml-as-is-artifacts.test.ts`
  - Tests artifact count and file-size validation.

### PlantUML sources

- Create: `docs/uml/as-is/_theme.puml`
- Create: `docs/uml/as-is/01-contexto.puml`
- Create: `docs/uml/as-is/02-casos-de-uso.puml`
- Create: `docs/uml/as-is/03-atividade-ciclo-completo.puml`
- Create: `docs/uml/as-is/04-estados-operacionais.puml`
- Create: `docs/uml/as-is/05-implantacao.puml`
- Create: `docs/uml/as-is/06-pacotes.puml`
- Create: `docs/uml/as-is/07-componentes.puml`
- Create: `docs/uml/as-is/08-classes-nucleo.puml`
- Create: `docs/uml/as-is/09-classes-browser-sessoes.puml`
- Create: `docs/uml/as-is/10-classes-cpi.puml`
- Create: `docs/uml/as-is/11-classes-deskdata.puml`
- Create: `docs/uml/as-is/12-sequencia-consulta-nova.puml`
- Create: `docs/uml/as-is/13-sequencia-consulta-semelhante.puml`
- Create: `docs/uml/as-is/14-sequencia-controle-operacional.puml`
- Create: `docs/uml/as-is/15-estados-etapas-ciclo.puml`
- Create: `docs/uml/as-is/16-modelo-historico.puml`
- Create: `docs/uml/as-is/17-classificacao.puml`
- Create: `docs/uml/as-is/18-tratamento-falhas.puml`

### Documentation and report generation

- Create: `docs/uml/as-is/README.md`
  - Explains scope, build, dependencies, diagrams, and AS-IS limits.
- Create: `scripts/uml-as-is/uml-report.ts`
  - Produces deterministic HTML pages for cover, explanatory sections, diagrams, and traceability.
- Create: `scripts/uml-as-is/generate-uml-report.ts`
  - Renders page PDFs with Playwright and merges them using `pdf-lib`.
- Create: `tests/unit/scripts/uml-as-is-report.test.ts`
  - Tests report ordering, page orientation, escaping, traceability, and privacy.
- Create: `docs/uml/as-is/build-uml.ps1`
  - Orchestrates validation, PlantUML rendering, report generation, and artifact checks.
- Create: `tests/unit/scripts/uml-as-is-build-script.test.ts`
  - Guards dependency checks, output cleanup, exact file counts, and nonzero failure behavior.

### Generated deliverables

- Create at build time: `docs/uml/as-is/generated/svg/*.svg`
- Create at build time: `docs/uml/as-is/generated/png/*.png`
- Create at build time: `docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf`

---

### Task 1: Create the Typed UML Manifest and Validation Contract

**Files:**

- Create: `scripts/uml-as-is/uml-manifest.ts`
- Create: `tests/unit/scripts/uml-as-is-manifest.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces:
  - `UmlDiagramId`
  - `UmlDiagramGroup`
  - `UmlPageOrientation`
  - `UmlDiagramDefinition`
  - `UML_AS_IS_DIAGRAMS`
  - `getUmlDiagramById(id: UmlDiagramId): UmlDiagramDefinition`

- [ ] **Step 1: Add the failing manifest test**

Create `tests/unit/scripts/uml-as-is-manifest.test.ts`:

```ts
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { UML_AS_IS_DIAGRAMS, getUmlDiagramById } from '../../../scripts/uml-as-is/uml-manifest'

describe('UML_AS_IS_DIAGRAMS', () => {
  it('defines exactly 18 unique numbered diagrams', () => {
    expect(UML_AS_IS_DIAGRAMS).toHaveLength(18)
    expect(new Set(UML_AS_IS_DIAGRAMS.map((diagram) => diagram.id)).size).toBe(18)
    expect(new Set(UML_AS_IS_DIAGRAMS.map((diagram) => diagram.fileName)).size).toBe(18)
    expect(UML_AS_IS_DIAGRAMS.map((diagram) => diagram.id)).toEqual(
      Array.from({ length: 18 }, (_, index) => String(index + 1).padStart(2, '0'))
    )
  })

  it('keeps executive diagrams before technical diagrams', () => {
    expect(UML_AS_IS_DIAGRAMS.slice(0, 5).every((item) => item.group === 'EXECUTIVE')).toBe(true)
    expect(UML_AS_IS_DIAGRAMS.slice(5).every((item) => item.group === 'TECHNICAL')).toBe(true)
  })

  it('references only existing source files', async () => {
    for (const diagram of UML_AS_IS_DIAGRAMS) {
      for (const sourceFile of diagram.sourceFiles) {
        await expect(access(resolve(sourceFile))).resolves.toBeUndefined()
      }
    }
  })

  it('resolves an existing diagram by id', () => {
    expect(getUmlDiagramById('13').fileName).toBe('13-sequencia-consulta-semelhante.puml')
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-manifest.test.ts
```

Expected: FAIL because `scripts/uml-as-is/uml-manifest.ts` does not exist.

- [ ] **Step 3: Create the manifest types and all 18 definitions**

Create `scripts/uml-as-is/uml-manifest.ts` with this public shape:

```ts
export type UmlDiagramId =
  | '01'
  | '02'
  | '03'
  | '04'
  | '05'
  | '06'
  | '07'
  | '08'
  | '09'
  | '10'
  | '11'
  | '12'
  | '13'
  | '14'
  | '15'
  | '16'
  | '17'
  | '18'

export type UmlDiagramGroup = 'EXECUTIVE' | 'TECHNICAL'
export type UmlPageOrientation = 'PORTRAIT' | 'LANDSCAPE'

export interface UmlDiagramDefinition {
  id: UmlDiagramId
  fileName: `${UmlDiagramId}-${string}.puml`
  title: string
  group: UmlDiagramGroup
  orientation: UmlPageOrientation
  purpose: string
  sourceFiles: readonly string[]
}
```

Define all entries in order:

```ts
export const UML_AS_IS_DIAGRAMS = [
  {
    id: '01',
    fileName: '01-contexto.puml',
    title: 'Contexto do sistema',
    group: 'EXECUTIVE',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra o operador, o Agente CPI e os sistemas externos.',
    sourceFiles: [
      'src/main/index.ts',
      'src/infrastructure/filesystem/runtime-paths.ts',
      'src/infrastructure/database/research-history-repository.ts'
    ]
  },
  {
    id: '02',
    fileName: '02-casos-de-uso.puml',
    title: 'Casos de uso',
    group: 'EXECUTIVE',
    orientation: 'LANDSCAPE',
    purpose: 'Resume as ações operacionais disponíveis ao operador.',
    sourceFiles: [
      'src/renderer/src/components/AgentDashboard.tsx',
      'src/renderer/src/components/ResearchHistoryPanel.tsx',
      'src/shared/types/agent-runtime-api.ts'
    ]
  },
  {
    id: '03',
    fileName: '03-atividade-ciclo-completo.puml',
    title: 'Atividade do ciclo completo',
    group: 'EXECUTIVE',
    orientation: 'LANDSCAPE',
    purpose: 'Apresenta o fluxo operacional CPI, DeskData, PDF e retorno à fila.',
    sourceFiles: [
      'src/automation/flow/continuous-research-runner.ts',
      'src/automation/flow/single-research-cycle.ts',
      'src/automation/flow/full-research-preparation-workflow.ts'
    ]
  },
  {
    id: '04',
    fileName: '04-estados-operacionais.puml',
    title: 'Estados operacionais do agente',
    group: 'EXECUTIVE',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta estados públicos, comandos e transições do runtime.',
    sourceFiles: [
      'src/shared/types/agent-runtime-api.ts',
      'src/automation/workflow/continuous-agent-runtime-service.ts',
      'src/automation/workflow/agent-public-state-store.ts'
    ]
  },
  {
    id: '05',
    fileName: '05-implantacao.puml',
    title: 'Implantação',
    group: 'EXECUTIVE',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra processos Electron, Chromium, armazenamento e sistemas externos.',
    sourceFiles: [
      'src/main/index.ts',
      'src/automation/browser/playwright-browser-launcher.ts',
      'src/infrastructure/filesystem/runtime-paths.ts'
    ]
  },
  {
    id: '06',
    fileName: '06-pacotes.puml',
    title: 'Pacotes',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra a organização dos módulos e dependências principais.',
    sourceFiles: ['src/main/index.ts']
  },
  {
    id: '07',
    fileName: '07-componentes.puml',
    title: 'Componentes e IPC',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra Renderer, Preload, Main, runtime e contratos IPC.',
    sourceFiles: [
      'src/preload/index.ts',
      'src/main/index.ts',
      'src/shared/types/agent-runtime-api.ts',
      'src/shared/types/history-api.ts'
    ]
  },
  {
    id: '08',
    fileName: '08-classes-nucleo.puml',
    title: 'Classes do núcleo operacional',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta runtime, runner, ciclo e workflow de preparação.',
    sourceFiles: [
      'src/automation/workflow/continuous-agent-runtime-service.ts',
      'src/automation/flow/continuous-research-runner.ts',
      'src/automation/flow/single-research-cycle.ts',
      'src/automation/flow/full-research-preparation-workflow.ts'
    ]
  },
  {
    id: '09',
    fileName: '09-classes-browser-sessoes.puml',
    title: 'Classes de navegador e sessões',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta contexto persistente, páginas e detecção de sessão.',
    sourceFiles: [
      'src/automation/browser/browser-manager.ts',
      'src/automation/browser/browser-workspace-service.ts',
      'src/automation/browser/platform-page-manager.ts',
      'src/automation/session/platform-session-service.ts'
    ]
  },
  {
    id: '10',
    fileName: '10-classes-cpi.puml',
    title: 'Classes CPI',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta fila, pesquisa, resultado, PDF e confirmação na CPI.',
    sourceFiles: [
      'src/automation/cpi/cpi-queue-monitor.ts',
      'src/automation/cpi/cpi-first-research-opener.ts',
      'src/automation/cpi/cpi-research-identity-reader.ts',
      'src/automation/cpi/cpi-research-confirmed-save-controller.ts'
    ]
  },
  {
    id: '11',
    fileName: '11-classes-deskdata.puml',
    title: 'Classes DeskData',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta formulário, conjuntos, resultado, PDF e parser.',
    sourceFiles: [
      'src/automation/deskdata/deskdata-cpf-form-controller.ts',
      'src/automation/deskdata/deskdata-dataset-controller.ts',
      'src/automation/deskdata/deskdata-search-result-page-resolver.ts',
      'src/automation/deskdata/deskdata-pdf-process-reader.ts'
    ]
  },
  {
    id: '12',
    fileName: '12-sequencia-consulta-nova.puml',
    title: 'Sequência da consulta nova',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra a execução de uma pesquisa inédita por CPF.',
    sourceFiles: [
      'src/automation/flow/single-research-cycle.ts',
      'src/automation/flow/full-research-preparation-workflow.ts',
      'src/automation/history/research-history-service.ts'
    ]
  },
  {
    id: '13',
    fileName: '13-sequencia-consulta-semelhante.puml',
    title: 'Sequência da consulta semelhante',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra a correspondência segura e o reaproveitamento do PDF.',
    sourceFiles: [
      'src/automation/deskdata/deskdata-search-result-page-resolver.ts',
      'src/automation/deskdata/deskdata-pdf-download-controller.ts',
      'src/automation/deskdata/deskdata-next-search-controller.ts'
    ]
  },
  {
    id: '14',
    fileName: '14-sequencia-controle-operacional.puml',
    title: 'Sequência do controle operacional',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra iniciar, login, pausar, continuar, parar e encerrar.',
    sourceFiles: [
      'src/automation/workflow/continuous-agent-runtime-service.ts',
      'src/main/ipc/register-continuous-agent-ipc-handlers.ts',
      'src/renderer/src/components/AgentDashboard.tsx'
    ]
  },
  {
    id: '15',
    fileName: '15-estados-etapas-ciclo.puml',
    title: 'Estados das etapas do ciclo',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Documenta as 13 etapas e suas transições de erro.',
    sourceFiles: [
      'src/automation/flow/continuous-research-stage.ts',
      'src/automation/flow/single-research-cycle.ts',
      'src/automation/flow/full-research-preparation-workflow.ts'
    ]
  },
  {
    id: '16',
    fileName: '16-modelo-historico.puml',
    title: 'Modelo do histórico',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra registro, serviço, repositório, IPC e painel.',
    sourceFiles: [
      'src/shared/types/history-api.ts',
      'src/automation/history/research-history-service.ts',
      'src/infrastructure/database/research-history-repository.ts',
      'src/renderer/src/components/ResearchHistoryPanel.tsx'
    ]
  },
  {
    id: '17',
    fileName: '17-classificacao.puml',
    title: 'Classificação por Esfera',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra o caminho do PDF até o resultado CPI.',
    sourceFiles: [
      'src/automation/deskdata/deskdata-pdf-process-reader.ts',
      'src/automation/deskdata/deskdata-pdf-process-parser.ts',
      'src/domain/research/classify-deskdata-spheres.ts',
      'src/automation/cpi/cpi-research-result-mapper.ts'
    ]
  },
  {
    id: '18',
    fileName: '18-tratamento-falhas.puml',
    title: 'Tratamento de falhas',
    group: 'TECHNICAL',
    orientation: 'LANDSCAPE',
    purpose: 'Mostra E1, histórico, estado público, pausa e parada.',
    sourceFiles: [
      'src/automation/flow/continuous-research-stage.ts',
      'src/automation/workflow/continuous-agent-runtime-service.ts',
      'src/automation/logging/safe-research-logger.ts',
      'src/automation/history/research-history-service.ts'
    ]
  }
] as const satisfies readonly UmlDiagramDefinition[]
```

Add:

```ts
export function getUmlDiagramById(id: UmlDiagramId): UmlDiagramDefinition {
  const diagram = UML_AS_IS_DIAGRAMS.find((item) => item.id === id)

  if (!diagram) {
    throw new Error(`Diagrama UML desconhecido: ${id}`)
  }

  return diagram
}
```

- [ ] **Step 4: Add the focused package command**

Modify `package.json` scripts:

```json
"uml:manifest:test": "tsx scripts/run-vitest-electron.ts run tests/unit/scripts/uml-as-is-manifest.test.ts"
```

- [ ] **Step 5: Run the test and confirm GREEN**

Run:

```powershell
pnpm run uml:manifest:test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml scripts/uml-as-is/uml-manifest.ts tests/unit/scripts/uml-as-is-manifest.test.ts
git commit -m "docs: add typed UML AS-IS manifest"
```

---

### Task 2: Implement Source Validation and Privacy Guards

**Files:**

- Create: `scripts/uml-as-is/validate-uml-sources.ts`
- Create: `tests/unit/scripts/uml-as-is-validator.test.ts`
- Modify: `package.json`
- Modify: `.prettierignore`

**Interfaces:**

- Consumes: `UML_AS_IS_DIAGRAMS`.
- Produces:
  - `validateUmlSources(options: ValidateUmlSourcesOptions): Promise<UmlValidationSummary>`
  - CLI option `--ids=01,02,03`.

- [ ] **Step 1: Write RED tests for syntax and privacy**

Create tests that build a temporary `docs/uml/as-is` directory and assert:

```ts
await expect(validateUmlSources({ projectRoot, ids: ['01'] })).rejects.toThrow(
  'Arquivo UML ausente'
)

await expect(validateUmlSources({ projectRoot, ids: ['01'] })).rejects.toThrow(
  'deve iniciar com @startuml'
)

await expect(validateUmlSources({ projectRoot, ids: ['01'] })).rejects.toThrow(
  'CPF completo proibido'
)

await expect(validateUmlSources({ projectRoot, ids: ['01'] })).rejects.toThrow(
  'conteúdo TO-BE proibido'
)
```

Use these prohibited patterns:

```ts
const FORBIDDEN_PATTERNS = [
  {
    label: 'CPF completo proibido',
    pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/
  },
  {
    label: 'marcador de pendência proibido',
    pattern: /\b(?:TO(?:DO)|TB(?:D))\b/i
  },
  {
    label: 'conteúdo TO-BE proibido',
    pattern:
      /MINOR_NAME_BIRTHDATE|input#fullname|input#birthdate|nome\s*\+\s*(?:data de )?nascimento/i
  }
] as const
```

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-validator.test.ts
```

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the validator**

The validator must:

1. resolve selected diagram IDs or all 18;
2. confirm manifest uniqueness;
3. confirm every `sourceFiles` path exists;
4. confirm each `.puml` exists;
5. strip UTF-8 BOM before inspection;
6. require first nonblank line to be `@startuml`;
7. require final nonblank line to be `@enduml`;
8. reject forbidden patterns;
9. require an include of `_theme.puml`;
10. reject duplicate `@startuml` blocks;
11. return:

```ts
export interface UmlValidationSummary {
  diagramCount: number
  sourceReferenceCount: number
  validatedFiles: readonly string[]
}
```

CLI behavior:

```text
pnpm run uml:validate
pnpm run uml:validate -- --ids=01,02,03
```

Success output:

```text
UML_AS_IS_SOURCES_VALID
diagramCount=18
sourceReferenceCount=<number>
```

- [ ] **Step 4: Add scripts and ignore rules**

Modify `package.json`:

```json
"uml:validate": "tsx scripts/uml-as-is/validate-uml-sources.ts"
```

Append to `.prettierignore`:

```text
docs/uml/as-is/*.puml
docs/uml/as-is/generated/**
```

- [ ] **Step 5: Run tests**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-validator.test.ts tests/unit/scripts/uml-as-is-manifest.test.ts
```

Expected: PASS for validator unit scenarios; current full-source validation remains RED until diagram files are created.

- [ ] **Step 6: Commit**

```powershell
git add package.json .prettierignore scripts/uml-as-is/validate-uml-sources.ts tests/unit/scripts/uml-as-is-validator.test.ts
git commit -m "docs: validate UML sources and privacy"
```

---

### Task 3: Create the Shared Theme and Five Executive Diagrams

**Files:**

- Create: `docs/uml/as-is/_theme.puml`
- Create: `docs/uml/as-is/01-contexto.puml`
- Create: `docs/uml/as-is/02-casos-de-uso.puml`
- Create: `docs/uml/as-is/03-atividade-ciclo-completo.puml`
- Create: `docs/uml/as-is/04-estados-operacionais.puml`
- Create: `docs/uml/as-is/05-implantacao.puml`

**Interfaces:**

- Every diagram includes `_theme.puml`.
- Runtime elements use `$runtime`.
- Auxiliary elements use `$auxiliary`.
- External elements use `$external`.

- [ ] **Step 1: Confirm the executive group is RED**

```powershell
pnpm run uml:validate -- --ids=01,02,03,04,05
```

Expected: FAIL with missing source files.

- [ ] **Step 2: Create `_theme.puml`**

The theme must define:

```plantuml
skinparam backgroundColor #F7F9FC
skinparam defaultFontName Arial
skinparam defaultFontSize 12
skinparam shadowing false
skinparam roundcorner 8
skinparam ArrowColor #355070
skinparam ArrowThickness 1
skinparam packageStyle rectangle
skinparam componentStyle rectangle
skinparam linetype ortho

!define RUNTIME_BG #EAF2FF
!define RUNTIME_BORDER #1D4ED8
!define AUX_BG #F1F5F9
!define AUX_BORDER #64748B
!define EXTERNAL_BG #FFF7E6
!define EXTERNAL_BORDER #B7791F
!define SUCCESS_BG #EAF8EF
!define SUCCESS_BORDER #16803A
!define ERROR_BG #FDECEC
!define ERROR_BORDER #B42318
!define WAIT_BG #FFF8DB
!define WAIT_BORDER #A16207
```

Add consistent stereotypes:

```plantuml
skinparam component<<runtime>> {
  BackgroundColor RUNTIME_BG
  BorderColor RUNTIME_BORDER
}
skinparam component<<auxiliary>> {
  BackgroundColor AUX_BG
  BorderColor AUX_BORDER
}
skinparam component<<external>> {
  BackgroundColor EXTERNAL_BG
  BorderColor EXTERNAL_BORDER
}
```

- [ ] **Step 3: Create `01-contexto.puml`**

Required elements:

```text
Operador
Agente CPI
CPI Central
DeskData
Chromium persistente
SQLite
Diretório de PDFs
```

Required labeled relationships:

```text
Operador -> Agente CPI: iniciar / pausar / continuar / parar
Agente CPI -> CPI Central: fila, pesquisa, resultado, anexo
Agente CPI -> DeskData: consulta CPF, resultado, PDF
Agente CPI -> SQLite: histórico
Agente CPI -> Diretório de PDFs: salvar e abrir
Agente CPI -> Chromium persistente: automação Playwright
```

- [ ] **Step 4: Create `02-casos-de-uso.puml`**

Use actor `Operador` and system boundary `Agente CPI`.

Represent these use cases:

```text
Abrir navegador
Autenticar CPI
Autenticar DeskData
Iniciar agente
Confirmar login
Monitorar fila
Processar pesquisa
Consultar CPF
Reutilizar consulta semelhante
Baixar PDF
Classificar por Esfera
Preencher CPI
Anexar PDF
Confirmar gravação
Pausar
Continuar
Parar
Consultar histórico
Abrir PDF
Revelar PDF na pasta
```

Use `<<include>>` from `Processar pesquisa` to the required operational steps and `<<extend>>` for `Reutilizar consulta semelhante`.

- [ ] **Step 5: Create `03-atividade-ciclo-completo.puml`**

Use partitions:

```text
Operador
Dashboard
Runtime
CPI Central
DeskData
PDF e Classificação
Histórico
```

The decision after submission must have two branches:

```text
Resultado direto
Consulta semelhante
```

Both branches converge before PDF download.

The final path must be:

```text
Confirmar gravação
→ Preparar próxima consulta
→ Retornar à fila
```

- [ ] **Step 6: Create `04-estados-operacionais.puml`**

Use exact states:

```text
PARADO
INICIANDO
AGUARDANDO_LOGIN
EXECUTANDO
PAUSANDO
PAUSADO
PARANDO
OCIOSO
ERRO_E1
```

Use exact command labels:

```text
start
loginCompleted
pause
resume
stop
shutdown
```

Show:

```text
EXECUTANDO -> PAUSANDO: pause durante ciclo
PAUSANDO -> PAUSADO: ciclo atinge ponto seguro
OCIOSO -> PAUSADO: pause durante espera
EXECUTANDO -> PARANDO: stop durante ciclo
OCIOSO -> PARADO: stop durante espera
qualquer estado operacional -> ERRO_E1: falha operacional
```

- [ ] **Step 7: Create `05-implantacao.puml`**

Nodes:

```text
Windows workstation
Electron Main
Electron Renderer
Preload
Chromium persistent context
browser-profile
agente-cpi.sqlite
E:\PDF-AGENTE-CPI
CPI Central
DeskData
```

Annotate:

```text
contextIsolation=true
nodeIntegration=false
sandbox=false
```

Use IPC between Renderer, Preload, and Main; HTTPS from Chromium to CPI and DeskData.

- [ ] **Step 8: Validate the group**

```powershell
pnpm run uml:validate -- --ids=01,02,03,04,05
```

Expected:

```text
UML_AS_IS_SOURCES_VALID
diagramCount=5
```

- [ ] **Step 9: Commit**

```powershell
git add docs/uml/as-is/_theme.puml docs/uml/as-is/0*.puml
git commit -m "docs: add executive UML diagrams"
```

---

### Task 4: Create Package, Component, Core, and Browser Diagrams

**Files:**

- Create: `docs/uml/as-is/06-pacotes.puml`
- Create: `docs/uml/as-is/07-componentes.puml`
- Create: `docs/uml/as-is/08-classes-nucleo.puml`
- Create: `docs/uml/as-is/09-classes-browser-sessoes.puml`

- [ ] **Step 1: Confirm RED**

```powershell
pnpm run uml:validate -- --ids=06,07,08,09
```

Expected: missing files.

- [ ] **Step 2: Create `06-pacotes.puml`**

Show packages:

```text
automation.browser
automation.cpi
automation.deskdata
automation.flow
automation.history
automation.logging
automation.session
automation.workflow
domain.agent
domain.errors
domain.research
infrastructure.config
infrastructure.database
infrastructure.filesystem
main
main.ipc
main.services
preload
renderer
shared.types
shared.utils
scripts
tests
```

Mark runtime-reachable packages in blue and auxiliary packages in gray. Add a note that `src/main/index.ts` is the runtime composition root.

- [ ] **Step 3: Create `07-componentes.puml`**

Show:

```text
AgentDashboard
ResearchHistoryPanel
window.agent
Preload contextBridge
IPC handlers
ContinuousAgentRuntimeService
ContinuousResearchRunner
SingleResearchCycle
CPI automation
DeskData automation
PDF pipeline
ResearchHistoryService
ResearchHistoryRepository
BrowserWorkspaceService
PlatformSessionService
PdfFileService
```

List all real IPC channels in a note beside the boundary:

```text
browser:start
browser:stop
browser:status
agent:get-state
agent:start
agent:pause
agent:resume
agent:stop
agent:login-completed
agent:state-changed
sessions:status
history:list
history:clear
history:record-created
history:record-updated
history:cleared
pdf:open
pdf:reveal
```

- [ ] **Step 4: Create `08-classes-nucleo.puml`**

Runtime area:

```text
ContinuousAgentRuntimeService
AgentPublicStateStore
ContinuousResearchRunner
SingleResearchCycle
FullResearchPreparationWorkflow
ContinuousResearchStageError
SafeResearchLogger
```

Show interfaces declared in each source file. Use implementation arrows only where the code contains `implements`.

Auxiliary area:

```text
AgentController
AgentRuntimeService
CircuitBreaker
PauseController
RetryPolicy
AgentStateMachine
```

Add the note:

```text
Auxiliary modules are present in the repository but are not composed by src/main/index.ts.
```

- [ ] **Step 5: Create `09-classes-browser-sessoes.puml`**

Show:

```text
BrowserManager
PlaywrightBrowserLauncher
BrowserWorkspaceService
PlatformPageManager
PlatformSessionDetector
PlatformSessionService
BrowserLauncher
BrowserRuntimeManager
PlatformPagesInitializer
SessionBrowserRuntime
```

Relationships must match constructor parameters and `implements` declarations.

- [ ] **Step 6: Validate**

```powershell
pnpm run uml:validate -- --ids=06,07,08,09
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add docs/uml/as-is/06-pacotes.puml docs/uml/as-is/07-componentes.puml docs/uml/as-is/08-classes-nucleo.puml docs/uml/as-is/09-classes-browser-sessoes.puml
git commit -m "docs: add architecture UML diagrams"
```

---

### Task 5: Create CPI and DeskData Class Diagrams

**Files:**

- Create: `docs/uml/as-is/10-classes-cpi.puml`
- Create: `docs/uml/as-is/11-classes-deskdata.puml`

- [ ] **Step 1: Confirm RED**

```powershell
pnpm run uml:validate -- --ids=10,11
```

- [ ] **Step 2: Create `10-classes-cpi.puml`**

Runtime group:

```text
CpiQueueFilterController
CpiQueueAvailabilityReader
CpiQueueMonitor
CpiFirstResearchOpener
CpiResearchIdentityReader
CpiResearchResultMapper
CpiResearchResultController
CpiResearchPdfAttachmentController
CpiResearchPdfPreparationWorkflow
CpiResearchResultSaver
CpiResearchConfirmedSaveController
```

Auxiliary group:

```text
CpiActionControlEvaluator
CpiFieldStructureEvaluator
CpiResearchClassificationParser
CpiResearchResultSimulationReporter
CpiResearchSaveConfirmation
```

Document the runtime path:

```text
fila
→ pesquisa
→ identidade
→ resultado
→ PDF
→ confirmação
```

- [ ] **Step 3: Create `11-classes-deskdata.puml`**

Runtime group:

```text
DeskDataNextSearchController
DeskDataCpfFormController
DeskDataDatasetController
DeskDataSearchSubmitController
DeskDataSearchResultPageResolver
DeskDataResultReadyWaiter
DeskDataPdfDownloadController
DeskDataPdfProcessReader
DeskDataPdfTextExtractor
DeskDataPdfProcessParser
```

Include the six dataset IDs in a note:

```text
basic_data
emails_extended
addresses_extended
phones_extended
occupation_data
processes
```

Auxiliary group:

```text
DeskDataInspectionClassifier
DeskDataInspectionPagePreparer
DeskDataInspectionScenarioParser
DeskDataLatestPdfLocator
DeskDataLiveResultCapture
DeskDataPageFinder
DeskDataProcessCollector
DeskDataProcessDomCapture
DeskDataProcessResultAnalyzer
DeskDataProcessResultInspector
DeskDataSafeClassificationReportBuilder
DeskDataSphereExtractor
PlaywrightDeskDataProcessPageAdapter
```

- [ ] **Step 4: Validate**

```powershell
pnpm run uml:validate -- --ids=10,11
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add docs/uml/as-is/10-classes-cpi.puml docs/uml/as-is/11-classes-deskdata.puml
git commit -m "docs: add CPI and DeskData class diagrams"
```

---

### Task 6: Create the Three Sequence Diagrams

**Files:**

- Create: `docs/uml/as-is/12-sequencia-consulta-nova.puml`
- Create: `docs/uml/as-is/13-sequencia-consulta-semelhante.puml`
- Create: `docs/uml/as-is/14-sequencia-controle-operacional.puml`

- [ ] **Step 1: Confirm RED**

```powershell
pnpm run uml:validate -- --ids=12,13,14
```

- [ ] **Step 2: Create `12-sequencia-consulta-nova.puml`**

Participants:

```text
Operador
AgentDashboard
Preload
IPC
ContinuousAgentRuntimeService
ContinuousResearchRunner
CpiQueueMonitor
SingleResearchCycle
CPI
FullResearchPreparationWorkflow
DeskData
PDF Pipeline
ResearchHistoryService
```

Required messages:

```text
start()
run()
waitForResearch()
startCycle()
openFirstResearch()
readIdentity()
prepareForNextSearch()
prepare()
fillCpf()
selectApprovedDatasets()
submitOnce()
resolve()
waitUntilReady()
download()
readProcesses()
classifyDeskDataSpheres()
prepare CPI result
attach PDF
saveAndConfirm()
completeCycle()
returnToQueue()
```

Use masked CPF only.

- [ ] **Step 3: Create `13-sequencia-consulta-semelhante.puml`**

Required alternate block:

```text
alt direct result
  continue on current result page
else similar query page
  read candidate rows
  normalize CPF
  verify six datasets
  sort by date descending
  click Ver
  validate historical tab
end
```

Failure branch:

```text
no exact safe match
→ ContinuousResearchStageError
→ ERRO_E1
```

After PDF processing:

```text
close historical tab only
→ keep main DeskData tab
→ prepare Consultar pessoas
```

- [ ] **Step 4: Create `14-sequencia-controle-operacional.puml`**

Use `newpage` or clearly separated `group` blocks for:

```text
Start authenticated
Start awaiting login
loginCompleted
Pause while idle
Pause during active cycle
Resume
Stop while idle
Stop during active cycle
Shutdown
```

Show:

```text
requestedExit
AbortController
runnerPromise
cycleActive
finishRequestedExit()
shutdown()
```

- [ ] **Step 5: Validate**

```powershell
pnpm run uml:validate -- --ids=12,13,14
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add docs/uml/as-is/12-sequencia-consulta-nova.puml docs/uml/as-is/13-sequencia-consulta-semelhante.puml docs/uml/as-is/14-sequencia-controle-operacional.puml
git commit -m "docs: add operational sequence diagrams"
```

---

### Task 7: Create Cycle, History, Classification, and Failure Diagrams

**Files:**

- Create: `docs/uml/as-is/15-estados-etapas-ciclo.puml`
- Create: `docs/uml/as-is/16-modelo-historico.puml`
- Create: `docs/uml/as-is/17-classificacao.puml`
- Create: `docs/uml/as-is/18-tratamento-falhas.puml`

- [ ] **Step 1: Confirm RED**

```powershell
pnpm run uml:validate -- --ids=15,16,17,18
```

- [ ] **Step 2: Create `15-estados-etapas-ciclo.puml`**

Use the exact 13 states:

```text
WAITING_QUEUE
OPENING_CPI_RESEARCH
READING_CPI_IDENTITY
PREPARING_DESKDATA
SUBMITTING_DESKDATA
WAITING_DESKDATA_RESULT
CLASSIFYING_RESULT
DOWNLOADING_PDF
PREPARING_CPI_RESULT
ATTACHING_PDF
SAVING_CPI
PREPARING_NEXT_SEARCH
RETURNING_TO_QUEUE
```

Add a note that operations inside `FullResearchPreparationWorkflow` may be grouped under the current emitted stage and are not all independently emitted to the dashboard.

- [ ] **Step 3: Create `16-modelo-historico.puml`**

Show:

```text
ResearchHistoryRecord
ResearchHistoryService
ResearchHistoryRepository
ResearchHistoryRepositoryPort
ResearchHistoryEvent
ResearchHistoryPage
ResearchHistoryPanel
History IPC handlers
```

Show table `research_history` with exact columns:

```text
id
masked_cpf
classification
cpi_result
status
started_at
finished_at
duration_ms
pdf_path
error_stage
error_message
created_at
```

Show statuses:

```text
EM_ANDAMENTO
CONCLUIDO
ERRO_E1
INTERROMPIDO
```

- [ ] **Step 4: Create `17-classificacao.puml`**

Runtime pipeline:

```text
DeskDataPdfDownloadController
→ DeskDataPdfProcessReader
→ DeskDataPdfTextExtractor
→ DeskDataPdfProcessParser
→ DeskDataProcessRecord[]
→ classifyDeskDataSpheres
→ normalizeProcessSphere
→ DeskDataClassification
→ mapDeskDataResultToResearchClassification
→ CpiResearchResultMapper
```

Decision rules:

```text
Any criminal sphere
→ SIM_CONSTA_RESTRICAO
→ CONSTA_RESTRICAO
→ Sim, Consta Restrições

No criminal sphere
→ HA_INFORMACOES
→ Há Informações
```

Auxiliary classifiers remain in a separate gray group.

- [ ] **Step 5: Create `18-tratamento-falhas.puml`**

Show:

```text
Original error
→ ContinuousResearchStageError
→ ContinuousAgentRuntimeService.handleOperationalError
→ SafeResearchLogger
→ ResearchHistoryService.failCycle
→ AgentPublicStateStore
→ ERRO_E1
→ IPC stateChanged
→ AgentDashboard
```

Show separate paths for:

```text
pause
stop
shutdown
unfinished history on startup
indeterminate queue while idle
```

The indeterminate idle queue must not transition to E1.

- [ ] **Step 6: Validate all sources**

```powershell
pnpm run uml:validate
```

Expected:

```text
UML_AS_IS_SOURCES_VALID
diagramCount=18
```

- [ ] **Step 7: Commit**

```powershell
git add docs/uml/as-is/15-estados-etapas-ciclo.puml docs/uml/as-is/16-modelo-historico.puml docs/uml/as-is/17-classificacao.puml docs/uml/as-is/18-tratamento-falhas.puml
git commit -m "docs: complete UML AS-IS source set"
```

---

### Task 8: Add README and Traceability Documentation

**Files:**

- Create: `docs/uml/as-is/README.md`
- Modify: `tests/unit/scripts/uml-as-is-manifest.test.ts`

- [ ] **Step 1: Add a RED documentation test**

Add:

```ts
it('keeps the UML README aligned with all diagram ids', async () => {
  const readme = await readFile(resolve('docs/uml/as-is/README.md'), 'utf8')

  for (const diagram of UML_AS_IS_DIAGRAMS) {
    expect(readme).toContain(`${diagram.id} - ${diagram.title}`)
    expect(readme).toContain(diagram.fileName)
  }

  expect(readme).toContain('AS-IS')
  expect(readme).toContain('PLANTUML_JAR')
  expect(readme).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
})
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm run uml:manifest:test
```

Expected: FAIL because README is absent.

- [ ] **Step 3: Create README**

Required sections:

```text
Purpose
AS-IS scope
Out of scope
Dependencies
PLANTUML_JAR configuration
Build command
Validation command
Diagram catalog
Runtime versus auxiliary modules
Traceability policy
Generated outputs
Privacy policy
Troubleshooting
```

The catalog must list all 18 diagrams using the exact title and filename from the manifest.

- [ ] **Step 4: Run tests**

```powershell
pnpm run uml:manifest:test
pnpm run uml:validate
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add docs/uml/as-is/README.md tests/unit/scripts/uml-as-is-manifest.test.ts
git commit -m "docs: document UML build and traceability"
```

---

### Task 9: Implement PlantUML Build Orchestration

**Files:**

- Create: `docs/uml/as-is/build-uml.ps1`
- Create: `tests/unit/scripts/uml-as-is-build-script.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces command:
  - `pnpm run uml:build`
- Environment contract:
  - `PLANTUML_JAR` points to an existing `plantuml.jar`.

- [ ] **Step 1: Write RED guard tests**

The test reads `build-uml.ps1` and requires:

```ts
expect(script).toContain('Get-Command java')
expect(script).toContain('Get-Command dot')
expect(script).toContain('$env:PLANTUML_JAR')
expect(script).toContain('pnpm run uml:validate')
expect(script).toContain('-tsvg')
expect(script).toContain('-tpng')
expect(script).toContain('18')
expect(script).toContain('pnpm run uml:report')
expect(script).toContain('pnpm run uml:verify')
expect(script).toContain('exit 1')
```

It must reject:

```ts
expect(script).not.toContain('Invoke-WebRequest')
expect(script).not.toContain('curl ')
expect(script).not.toContain('git reset')
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-build-script.test.ts
```

- [ ] **Step 3: Implement `build-uml.ps1`**

Required behavior:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
```

Resolve:

```powershell
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$umlRoot = $PSScriptRoot
$generatedRoot = Join-Path $umlRoot "generated"
$svgRoot = Join-Path $generatedRoot "svg"
$pngRoot = Join-Path $generatedRoot "png"
```

Check:

```powershell
Get-Command java -ErrorAction Stop
Get-Command dot -ErrorAction Stop
```

Resolve PlantUML only from:

```text
$env:PLANTUML_JAR
$env:USERPROFILE\.plantuml\plantuml.jar
C:\tools\plantuml\plantuml.jar
```

Do not download dependencies.

Clean and recreate only:

```text
generated/svg
generated/png
generated/_work
```

Run:

```powershell
pnpm run uml:validate
java -jar $plantUmlJar -checkonly -charset UTF-8 *.puml
java -jar $plantUmlJar -tsvg -charset UTF-8 -o generated/svg *.puml
java -jar $plantUmlJar -tpng -charset UTF-8 -o generated/png *.puml
```

Count exactly 18 SVG and 18 PNG files.

Then run:

```powershell
pnpm run uml:report
pnpm run uml:verify
```

On any caught error:

```powershell
Write-Error $_
exit 1
```

- [ ] **Step 4: Add package script**

```json
"uml:build": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File docs/uml/as-is/build-uml.ps1"
```

- [ ] **Step 5: Run the focused test**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-build-script.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the script without `PLANTUML_JAR` to verify safe failure**

```powershell
Remove-Item Env:PLANTUML_JAR -ErrorAction SilentlyContinue
pnpm run uml:build
```

Expected: nonzero exit with a clear PlantUML path message; no network request.

- [ ] **Step 7: Commit**

```powershell
git add docs/uml/as-is/build-uml.ps1 tests/unit/scripts/uml-as-is-build-script.test.ts package.json
git commit -m "build: add reproducible UML renderer"
```

---

### Task 10: Build Deterministic HTML and PDF Report Generation

**Files:**

- Create: `scripts/uml-as-is/uml-report.ts`
- Create: `scripts/uml-as-is/generate-uml-report.ts`
- Create: `tests/unit/scripts/uml-as-is-report.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces:
  - `escapeHtml(value: string): string`
  - `renderCoverPage(): string`
  - `renderDiagramPage(input: DiagramPageInput): string`
  - `renderTraceabilityPage(): string`
  - `generateUmlReport(options: GenerateUmlReportOptions): Promise<string>`

- [ ] **Step 1: Install the report merge dependency**

Run:

```powershell
pnpm add -D pdf-lib@1.17.1
```

Expected: `package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write RED report tests**

Tests must verify:

```ts
expect(renderCoverPage()).toContain('AGENTE CPI')
expect(renderCoverPage()).toContain('UML AS-IS')
expect(renderDiagramPage({ ... }).toContain('<svg')).toBe(true)
expect(renderDiagramPage({ ... })).toContain('page: landscape')
expect(renderTraceabilityPage()).toContain('Diagrama')
expect(renderTraceabilityPage()).toContain('Arquivo-fonte')
expect(report).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
```

- [ ] **Step 3: Run and confirm RED**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-report.test.ts
```

- [ ] **Step 4: Implement the pure HTML renderer**

Use inline CSS with named pages:

```css
@page portrait {
  size: A4 portrait;
  margin: 14mm;
}

@page landscape {
  size: A4 landscape;
  margin: 10mm;
}

.page-portrait {
  page: portrait;
  break-after: page;
}

.page-landscape {
  page: landscape;
  break-after: page;
}
```

Each diagram page must contain:

```text
diagram number
title
purpose
embedded SVG
source files
AS-IS label
```

No external web resources or font downloads.

- [ ] **Step 5: Implement the CLI generator**

`generate-uml-report.ts` must:

1. run `validateUmlSources`;
2. read 18 SVGs;
3. create one HTML document for cover and introductory pages;
4. create one HTML document per diagram;
5. use Playwright `chromium.launch({ headless: true })`;
6. generate each page PDF with `printBackground: true`;
7. set orientation from the manifest;
8. merge PDFs in manifest order using `PDFDocument.create()`;
9. write:

```text
docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf
```

10. delete `generated/_work` in `finally`;
11. close Chromium in `finally`;
12. print:

```text
UML_AS_IS_REPORT_GENERATED
<absolute PDF path>
```

- [ ] **Step 6: Add package script**

```json
"uml:report": "tsx scripts/uml-as-is/generate-uml-report.ts"
```

- [ ] **Step 7: Run tests**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-report.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add package.json pnpm-lock.yaml scripts/uml-as-is/uml-report.ts scripts/uml-as-is/generate-uml-report.ts tests/unit/scripts/uml-as-is-report.test.ts
git commit -m "docs: generate consolidated UML PDF"
```

---

### Task 11: Implement Generated Artifact Verification

**Files:**

- Create: `scripts/uml-as-is/verify-uml-artifacts.ts`
- Create: `tests/unit/scripts/uml-as-is-artifacts.test.ts`
- Modify: `package.json`

**Interfaces:**

- Produces:
  - `verifyUmlArtifacts(options: VerifyUmlArtifactsOptions): Promise<UmlArtifactSummary>`.

- [ ] **Step 1: Write RED tests**

Use a temporary generated directory and verify:

```ts
await expect(verifyUmlArtifacts({ generatedRoot })).rejects.toThrow('Esperados 18 SVG')

await expect(verifyUmlArtifacts({ generatedRoot })).rejects.toThrow('Esperados 18 PNG')

await expect(verifyUmlArtifacts({ generatedRoot })).rejects.toThrow('PDF consolidado ausente')
```

A valid fixture must return:

```ts
{
  svgCount: 18,
  pngCount: 18,
  pdfBytes: expect.any(Number)
}
```

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-artifacts.test.ts
```

- [ ] **Step 3: Implement verification**

Rules:

```text
18 SVG files
18 PNG files
each SVG > 500 bytes
each PNG > 2 KB
final PDF > 50 KB
no generated/_work directory after completion
every manifest id has matching SVG and PNG basename
```

Success output:

```text
UML_AS_IS_ARTIFACTS_VALID
svgCount=18
pngCount=18
pdfBytes=<number>
```

- [ ] **Step 4: Add package script**

```json
"uml:verify": "tsx scripts/uml-as-is/verify-uml-artifacts.ts"
```

- [ ] **Step 5: Run tests**

```powershell
pnpm test -- tests/unit/scripts/uml-as-is-artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/uml-as-is/verify-uml-artifacts.ts tests/unit/scripts/uml-as-is-artifacts.test.ts
git commit -m "test: verify generated UML artifacts"
```

---

### Task 12: Render All Diagrams and Generate the PDF

**Files:**

- Generate: `docs/uml/as-is/generated/svg/*.svg`
- Generate: `docs/uml/as-is/generated/png/*.png`
- Generate: `docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf`

- [ ] **Step 1: Configure PlantUML**

Example:

```powershell
$env:PLANTUML_JAR = "C:\tools\plantuml\plantuml.jar"
```

Confirm:

```powershell
Test-Path $env:PLANTUML_JAR
java -version
dot -V
```

Expected: all dependencies available.

- [ ] **Step 2: Run the complete build**

```powershell
pnpm run uml:build
```

Expected:

```text
UML_AS_IS_SOURCES_VALID
UML_AS_IS_REPORT_GENERATED
UML_AS_IS_ARTIFACTS_VALID
```

- [ ] **Step 3: Inspect the generated artifact list**

```powershell
Get-ChildItem docs\uml\as-is\generated\svg -Filter *.svg
Get-ChildItem docs\uml\as-is\generated\png -Filter *.png
Get-Item docs\uml\as-is\generated\AGENTE_CPI_UML_AS_IS.pdf
```

Expected: 18 SVG, 18 PNG, one PDF.

- [ ] **Step 4: Commit generated deliverables**

```powershell
git add docs/uml/as-is/generated
git commit -m "docs: add rendered UML AS-IS deliverables"
```

---

### Task 13: Perform Visual PDF Verification and Correct Layout Defects

**Files:**

- Inspect: `docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf`
- Modify only when needed:
  - affected `.puml`;
  - `_theme.puml`;
  - `scripts/uml-as-is/uml-report.ts`.

- [ ] **Step 1: Render the PDF to page images**

In the artifact environment:

```bash
python /home/oai/skills/pdfs/scripts/render_pdf.py \
  docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf \
  --out_dir /mnt/data/uml_as_is_pdf_render \
  --dpi 200
```

Expected: one PNG per PDF page.

- [ ] **Step 2: Inspect every rendered page**

Reject any page containing:

```text
clipped text
overlapping arrows
unreadable class members
broken accents
black squares
empty diagram
image outside page
source list outside margin
incorrect page order
missing diagram
```

- [ ] **Step 3: Correct one defect class at a time**

Examples:

```text
Too many crossing arrows
→ add together blocks, hidden links, or left-to-right direction

Diagram too small
→ split auxiliary group into a secondary area on the same page or reduce member detail

Broken PDF glyph
→ replace decorative Unicode punctuation with ASCII punctuation

SVG clipped
→ remove fixed dimensions and use max-width/max-height CSS
```

After each change:

```powershell
pnpm run uml:build
```

Then re-render the PDF.

- [ ] **Step 4: Confirm no visual defects remain**

Record the final page count and inspection outcome in:

```text
docs/uml/as-is/README.md
```

Use a concise section:

```text
Visual verification
- Renderer: PDFium at 200 DPI
- All pages inspected
- No clipping, overlap, broken glyphs, or empty diagrams
```

- [ ] **Step 5: Commit visual corrections**

```powershell
git add docs/uml/as-is scripts/uml-as-is
git commit -m "docs: verify UML PDF rendering"
```

---

### Task 14: Run Final Project Validation and Delivery Audit

**Files:**

- Verify all files from the File Map.
- Do not modify production files unless validation reveals an unrelated pre-existing problem; report such a problem instead of changing runtime behavior.

- [ ] **Step 1: Run all UML unit tests**

```powershell
pnpm test -- `
  tests/unit/scripts/uml-as-is-manifest.test.ts `
  tests/unit/scripts/uml-as-is-validator.test.ts `
  tests/unit/scripts/uml-as-is-build-script.test.ts `
  tests/unit/scripts/uml-as-is-report.test.ts `
  tests/unit/scripts/uml-as-is-artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 2: Validate source and generated artifacts**

```powershell
pnpm run uml:validate
pnpm run uml:verify
```

Expected: PASS.

- [ ] **Step 3: Run global validation**

```powershell
pnpm run validate
```

Expected: TypeScript, ESLint, Prettier, and all tests pass.

- [ ] **Step 4: Confirm production source was not changed**

Run:

```powershell
git diff --name-only HEAD~1..HEAD
git status --short
```

Review the complete implementation range and confirm no file under `src/` changed.

- [ ] **Step 5: Audit final outputs**

Confirm:

```text
18 .puml
18 .svg
18 .png
1 PDF
1 README
1 build script
5 TypeScript UML scripts
5 UML-focused test files
```

- [ ] **Step 6: Final commit when validation evidence changed**

```powershell
git add docs/uml/as-is scripts/uml-as-is tests/unit/scripts package.json pnpm-lock.yaml .prettierignore
git commit -m "docs: finalize complete UML AS-IS package"
```

Skip this commit only when the working tree is already clean.

---

## Execution Notes

- Use an isolated Git worktree before implementation.
- Keep the 18 PlantUML sources small enough to review individually.
- Do not add application telemetry, fictitious services, or proposed classes to AS-IS diagrams.
- When the code and a prior written description disagree, the current source code is authoritative.
- The diagram manifest must be updated before any diagram is renamed.
- The report generator must read titles, purpose, orientation, and source files from the manifest rather than duplicate metadata.
- Generated `_work` files are temporary and must not remain after successful or failed builds.
- The final PDF is the client-facing artifact; PlantUML, SVG, and PNG files are technical deliverables.
