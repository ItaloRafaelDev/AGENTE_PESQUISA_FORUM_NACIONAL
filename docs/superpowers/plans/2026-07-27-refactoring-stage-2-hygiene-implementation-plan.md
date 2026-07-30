# Repository Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Leave the repository-wide formatting and lint pipeline green, remove only proven
obsolete artifacts, and align tooling and distribution configuration with official Windows-only
support without changing supported runtime or visual behavior.

**Architecture:** This stage changes repository policy and removes dead surface before architectural
movement starts. Historical evidence remains immutable and is excluded centrally from formatting
and linting; active TypeScript is normalized to LF. Obsolete files are deleted only after a
reference inventory and guarded by repository contract tests. Windows-only cleanup removes
unsupported platform branches and unused updater/template configuration while preserving the
Windows build contract.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Vitest 4, ESLint 9 flat config,
Prettier 3, pnpm, electron-vite 5, electron-builder 26, Windows PowerShell.

## Global Constraints

- Preserve exact functional and visual behavior on Windows.
- Windows is the only officially supported platform.
- Preserve SQLite history, existing database paths, PDF paths/files, Chromium profile and
  authenticated sessions.
- The only accepted Stage 1 runtime change remains the three confirmed PDF message repairs.
- No full CPF literal may be introduced.
- Historical files under `docs/superpowers/evidence/` remain byte-preserved.
- `artifacts/deskdata-inspection/` remains preserved as operational classification evidence.
- Drizzle ORM, `drizzle.config.ts`, `drizzle-orm` and `drizzle-kit` remain untouched until Stage 4.
- Do not restructure architecture, split renderer components or move production modules.
- Do not run destructive external automation or write to real external systems.
- Do not run `git add`, `git commit`, `git merge`, `git push`, or create a PR.
- The single final commit remains forbidden until the user manually tests the complete project and
  explicitly approves it.
- Although the generic planning template mentions per-task commits, this user-approved no-commit
  rule takes precedence. Every task ends with a working-tree checkpoint and independent review.

## Verified Stage 2 input

- Stage 1: 83 test files and 402 tests passing.
- Honest Stage 1 coverage:
  - statements: 83.57%;
  - branches: 74.34%;
  - functions: 88.14%;
  - lines: 83.78%.
- `pnpm run format:check` reports 18 pre-existing project files:
  - 15 immutable historical evidence files;
  - `package.json`;
  - `src/automation/workflow/continuous-agent-runtime-service.ts`;
  - `tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts`.
- The local ignored SDD reports add nine non-project warnings until `.superpowers/sdd/` is excluded.
- The repository lint scope, with historical evidence excluded, reports exactly 552 CRLF-only
  warnings across the runtime service and integration test.
- `prettier --find-config-path` resolves `.prettierrc.yaml`; `prettier.config.mjs` is a duplicate
  lower-precedence configuration with no live reference.
- Proven obsolete candidates have no live import, script, configuration or documentation entry
  except where explicitly removed in this plan.

## Official references

- Prettier configuration precedence and `.editorconfig` integration:
  <https://prettier.io/docs/configuration>
- Prettier ignore policy:
  <https://prettier.io/docs/next/ignore/>
- ESLint flat-config global ignores:
  <https://eslint.org/docs/latest/use/configure/ignore>
- ESLint `--max-warnings` gate:
  <https://eslint.org/docs/latest/use/command-line-interface>
- electron-builder platform configuration:
  <https://www.electron.build/docs/configuration/>
- electron-builder Windows CLI target:
  <https://www.electron.build/docs/cli/>

---

### Task 1: Close the deferred PDF extractor regression gap

**Files:**

- Modify: `tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts`
- Test: `src/automation/deskdata/deskdata-pdf-text-extractor.ts`

**Interfaces:**

- Consumes:
  `DeskDataPdfTextExtractor.extract(filePath): Promise<DeskDataPdfTextSnapshot>`.
- Produces: a regression contract proving that a technical `getText()` failure after parser
  construction preserves the original cause and still destroys the parser.

- [ ] **Step 1: Add the post-construction failure test**

Append inside the existing `describe`:

```ts
it('destrói o parser quando a extração falha após a construção', async () => {
  const cause = new Error('falha interna do parser')
  mocks.getText.mockRejectedValue(cause)

  const extractor = new DeskDataPdfTextExtractor()

  await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\falha-parser.pdf')).rejects.toMatchObject({
    code: 'PDF_TEXT_EXTRACTION_FAILED',
    message: 'Não foi possível extrair o texto do PDF da DeskData.',
    cause
  })
  expect(mocks.destroy).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
pnpm test -- tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
```

Expected: 5 tests pass without production changes.

- [ ] **Step 3: Validate the checkpoint**

Run:

```powershell
pnpm exec prettier --check tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
pnpm exec eslint tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts
pnpm run typecheck:node
git diff --check
git status --short
```

Expected: all commands pass and no production file changes in this task.

---

### Task 2: Make the repository quality pipeline deterministic and green

**Files:**

- Modify: `.prettierignore`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify mechanically:
  `src/automation/workflow/continuous-agent-runtime-service.ts`
- Modify mechanically:
  `tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts`
- Delete: `prettier.config.mjs`
- Test:
  - `tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts`
  - `tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts`

**Interfaces:**

- Consumes: the existing `.prettierrc.yaml`, `.editorconfig` LF policy, ESLint 9 flat config and
  package validation scripts.
- Produces:
  - one effective Prettier configuration;
  - immutable evidence excluded from formatting/lint traversal;
  - repository-wide lint with zero-warning enforcement;
  - global `format:check` and `lint` exit code 0.

- [ ] **Step 1: Reproduce the existing quality failures**

Run:

```powershell
pnpm run format:check
pnpm exec eslint . --cache --cache-location "$env:TEMP\agente-cpi-stage-2-red.cache" `
  --ignore-pattern docs/superpowers/evidence/** `
  --ignore-pattern .agent-backups/** `
  --ignore-pattern .agent-config-backups/**
```

Expected:

- format check fails on the 18 pre-existing project files plus local ignored SDD reports;
- ESLint exits 0 but prints exactly 552 CRLF warnings in the two active TypeScript files.

- [ ] **Step 2: Centralize the Prettier exclusions**

Replace `.prettierignore` with:

```gitignore
node_modules
out
dist
coverage
pnpm-lock.yaml
LICENSE.md
tsconfig.json
tsconfig.*.json

# Immutable historical and local execution evidence
docs/superpowers/evidence/
.superpowers/sdd/
artifacts/deskdata-inspection/

# Generated local backups
.agent-backups/
.agent-config-backups/
```

Historical evidence must not be reformatted.

- [ ] **Step 3: Centralize ESLint ignores in flat config**

Change the import:

```ts
import { defineConfig, globalIgnores } from 'eslint/config'
```

Replace the first inline ignore object in `defineConfig` with:

```ts
globalIgnores([
  '**/node_modules/',
  '**/dist/',
  '**/out/',
  'docs/superpowers/evidence/',
  '.superpowers/sdd/',
  '.agent-backups/',
  '.agent-config-backups/'
])
```

Keep every existing TypeScript, React, hooks, refresh and Prettier rule configuration unchanged.

- [ ] **Step 4: Make warnings fail the lint gate without a repository cache**

Change only the `lint` script in `package.json`:

```json
"lint": "eslint . --max-warnings 0"
```

This avoids the current root `.eslintcache` `EPERM` failure and makes any future warning fail the
pipeline.

- [ ] **Step 5: Remove the unused duplicate Prettier configuration**

Delete:

```text
prettier.config.mjs
```

Run:

```powershell
pnpm exec prettier --find-config-path package.json
```

Expected: `.prettierrc.yaml`.

- [ ] **Step 6: Normalize only the active failing files**

Run:

```powershell
pnpm exec prettier --write `
  package.json `
  src/automation/workflow/continuous-agent-runtime-service.ts `
  tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts
```

Expected: mechanical formatting/LF normalization only; no runtime or assertion change.

- [ ] **Step 7: Run focused behavioral verification**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts `
  tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts
pnpm run typecheck
```

Expected: both test files and both typechecks pass.

- [ ] **Step 8: Prove the global quality gates are green**

Run:

```powershell
pnpm run format:check
pnpm run lint
git diff --check
git status --short
```

Expected:

- format check passes globally;
- lint exits 0 with zero errors and zero warnings;
- no historical evidence file changed;
- no whitespace error.

---

### Task 3: Remove only proven obsolete repository artifacts

**Files:**

- Create: `tests/unit/config/repository-artifact-hygiene.test.ts`
- Create: `docs/architecture/repository-hygiene-inventory.md`
- Delete recursively:
  - `.agent-backups/`
  - `.agent-config-backups/`
- Delete:
  - `task-12-dashboard-context.txt`
  - `task-13-dashboard-targeted-context.txt`
  - `artifacts/task-3-current-context.txt`
  - `artifacts/full-flow-integration-inspection/full-flow-context-20260714-144305.txt`
  - `src/renderer/src/assets/base.css`
  - `src/renderer/src/assets/electron.svg`
  - `src/renderer/src/assets/wavy-lines.svg`

**Interfaces:**

- Consumes: exact reference searches, Git tracking state and the repository cleanup rules in the
  approved design.
- Produces:
  - a permanent inventory explaining every removal, preservation and deferral;
  - a regression contract preventing generated context/backups and unused template assets from
    returning.

- [ ] **Step 1: Create the failing artifact policy test**

Create:

```ts
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const prohibitedRepositoryArtifacts = [
  '.agent-backups',
  '.agent-config-backups',
  'task-12-dashboard-context.txt',
  'task-13-dashboard-targeted-context.txt',
  'artifacts/task-3-current-context.txt',
  'artifacts/full-flow-integration-inspection/full-flow-context-20260714-144305.txt',
  'prettier.config.mjs',
  'src/renderer/src/assets/base.css',
  'src/renderer/src/assets/electron.svg',
  'src/renderer/src/assets/wavy-lines.svg'
] as const

describe('repository artifact hygiene', () => {
  it('não mantém backups, dumps de contexto ou assets de template obsoletos', () => {
    expect(prohibitedRepositoryArtifacts.filter((filePath) => existsSync(filePath))).toEqual([])
  })
})
```

- [ ] **Step 2: Run the policy test and verify the obsolete files exist**

Run:

```powershell
pnpm test -- tests/unit/config/repository-artifact-hygiene.test.ts
```

Expected: FAIL listing the existing backup directories, context dumps and unused renderer assets.

- [ ] **Step 3: Record the evidence-backed inventory**

Create `docs/architecture/repository-hygiene-inventory.md` with:

```markdown
# Repository hygiene inventory

Inventory date: 2026-07-28

## Removed in Stage 2

| Item                                                       | Evidence                                                                       | Decision                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `.agent-backups/`                                          | Generated timestamped copies; ignored by Git/tooling; no live import or script | Remove the complete local directory |
| `.agent-config-backups/`                                   | Generated configuration copies; ignored by Git/tooling; no live reference      | Remove the complete local directory |
| Root `task-12` and `task-13` context dumps                 | Generated repository snapshots; no live reference                              | Remove                              |
| `artifacts/task-3-current-context.txt`                     | Generated context snapshot; no live reference                                  | Remove                              |
| `artifacts/full-flow-integration-inspection/` context dump | Generated full-flow snapshot; no live reference                                | Remove                              |
| `prettier.config.mjs`                                      | Lower-precedence duplicate; Prettier resolves `.prettierrc.yaml`               | Remove                              |
| `base.css`, `electron.svg`, `wavy-lines.svg`               | No import, CSS reference, HTML reference or build entry                        | Remove                              |

## Preserved

| Item                                  | Reason                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `docs/superpowers/evidence/`          | Immutable historical red/green and compatibility evidence |
| `artifacts/deskdata-inspection/`      | Operational classification samples retained for audit     |
| `build/icon.ico` and `build/icon.png` | Windows packaging resources                               |
| Current specs and plans               | Approved refactoring and behavior documentation           |

## Deferred

| Item                                              | Target stage                       |
| ------------------------------------------------- | ---------------------------------- |
| `drizzle.config.ts`, `drizzle-orm`, `drizzle-kit` | Stage 4 persistence migration      |
| README and package identity rewrite               | Stage 9 distribution/documentation |
```

- [ ] **Step 4: Reverify exact targets before deletion**

Run:

```powershell
git grep -n -F -- "task-12-dashboard-context.txt" `
  ":(exclude)task-12-dashboard-context.txt" `
  ":(exclude)task-13-dashboard-targeted-context.txt"
git grep -n -F -- "src/renderer/src/assets/electron.svg"
git grep -n -F -- "src/renderer/src/assets/wavy-lines.svg"
git grep -n -F -- "src/renderer/src/assets/base.css"
git status --short
```

Expected: no live reference. The only self-references in generated context dumps are excluded.

- [ ] **Step 5: Delete the exact obsolete targets safely**

Resolve `E:\agente-cpi` and every target first. Confirm every resolved target starts with
`E:\agente-cpi\` and is one of the paths listed in this task. Then:

- delete tracked files with `apply_patch`;
- remove the exact `.agent-backups` and `.agent-config-backups` directories with native
  PowerShell `Remove-Item -LiteralPath ... -Recurse -Force`;
- remove now-empty `artifacts/full-flow-integration-inspection/`.

Do not delete `artifacts/deskdata-inspection/`, `docs/superpowers/evidence/`, `build/`,
`data/`, `coverage/`, `out/`, PDFs, SQLite files or Chromium/session directories.

Tracked deleted files remain recoverable from Git; ignored generated backup copies are intentionally
removed as obsolete local artifacts.

- [ ] **Step 6: Run the artifact contract**

Run:

```powershell
pnpm test -- tests/unit/config/repository-artifact-hygiene.test.ts
```

Expected: 1 test passes.

- [ ] **Step 7: Validate preservation and scope**

Run:

```powershell
Test-Path -LiteralPath 'docs/superpowers/evidence'
Test-Path -LiteralPath 'artifacts/deskdata-inspection'
Test-Path -LiteralPath 'build/icon.ico'
Test-Path -LiteralPath 'build/icon.png'
pnpm run format:check
pnpm run lint
git diff --check
git status --short
```

Expected: all four preserved paths return `True`; quality gates and diff check pass.

---

### Task 4: Enforce the approved Windows-only project surface

**Files:**

- Create: `tests/unit/config/windows-only-project-contract.test.ts`
- Modify: `package.json`
- Modify mechanically: `pnpm-lock.yaml`
- Modify: `electron-builder.yml`
- Modify: `src/main/index.ts`
- Modify: `README.md`
- Modify: `docs/architecture/repository-hygiene-inventory.md`
- Delete:
  - `build/entitlements.mac.plist`
  - `build/icon.icns`
  - `dev-app-update.yml`
  - `resources/icon.png`

**Interfaces:**

- Consumes:
  - `package.json` scripts and direct dependencies;
  - `electron-builder.yml`;
  - the Electron main-process entry.
- Produces:
  - Windows as the only project build/distribution surface;
  - no unsupported macOS/Linux runtime branch;
  - no unused updater dependency or example publishing endpoint;
  - a Windows build contract protected by tests.

- [ ] **Step 1: Write the failing Windows-only contract**

Create:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
}
const builderConfig = readFileSync('electron-builder.yml', 'utf8')
const mainSource = readFileSync('src/main/index.ts', 'utf8')

describe('Windows-only project contract', () => {
  it('expõe somente scripts e dependências de distribuição suportados', () => {
    expect(packageJson.scripts).toHaveProperty('build:win')
    expect(packageJson.scripts).not.toHaveProperty('build:mac')
    expect(packageJson.scripts).not.toHaveProperty('build:linux')
    expect(packageJson.dependencies).not.toHaveProperty('electron-updater')
  })

  it('mantém somente configuração e assets de empacotamento Windows', () => {
    expect(builderConfig).toMatch(/^win:/m)
    expect(builderConfig).not.toMatch(/^(mac|dmg|linux|appImage|publish):/m)
    expect(existsSync('build/entitlements.mac.plist')).toBe(false)
    expect(existsSync('build/icon.icns')).toBe(false)
    expect(existsSync('dev-app-update.yml')).toBe(false)
  })

  it('remove ramificações de runtime exclusivas de plataformas não suportadas', () => {
    expect(mainSource).not.toContain('process.platform')
    expect(mainSource).not.toContain("app.on('activate'")
    expect(existsSync('resources/icon.png')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the contract and verify the unsupported surface**

Run:

```powershell
pnpm test -- tests/unit/config/windows-only-project-contract.test.ts
```

Expected: 3 tests fail because macOS/Linux scripts/configuration/assets, updater dependency and
platform branches still exist.

- [ ] **Step 3: Remove unsupported scripts and unused updater dependency**

Remove from `package.json`:

```json
"build:mac": "electron-vite build && electron-builder --mac",
"build:linux": "electron-vite build && electron-builder --linux",
```

Run:

```powershell
pnpm remove electron-updater
```

Expected: `electron-updater` is removed from direct dependencies and `pnpm-lock.yaml` is updated by
pnpm. Do not alter Drizzle dependencies.

- [ ] **Step 4: Reduce electron-builder to Windows configuration**

Keep the existing common configuration, `win`, `nsis`, `npmRebuild` and `electronDownload`.
Remove:

```yaml
asarUnpack:
  - resources/**
mac:
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSCameraUsageDescription: Application requests access to the device's camera.
    - NSMicrophoneUsageDescription: Application requests access to the device's microphone.
    - NSDocumentsFolderUsageDescription: Application requests access to the user's Documents folder.
    - NSDownloadsFolderUsageDescription: Application requests access to the user's Downloads folder.
  notarize: false
dmg:
  artifactName: ${name}-${version}.${ext}
linux:
  target:
    - AppImage
    - snap
    - deb
  maintainer: electronjs.org
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
publish:
  provider: generic
  url: https://example.com/auto-updates
```

Also remove `dev-app-update.yml` from the excluded-file glob because the file itself is deleted:

```yaml
- '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}'
```

- [ ] **Step 5: Remove unsupported runtime branches**

In `src/main/index.ts`, delete:

```ts
import icon from '../../resources/icon.png?asset'
```

Delete from `BrowserWindow` options:

```ts
...(process.platform === 'linux' ? { icon } : {}),
```

Delete the macOS-only activation block:

```ts
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
```

Replace:

```ts
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

with:

```ts
app.on('window-all-closed', () => {
  app.quit()
})
```

This preserves the exact Windows behavior and removes only unsupported-platform branches.

- [ ] **Step 6: Remove unsupported/template files**

Delete exactly:

```text
build/entitlements.mac.plist
build/icon.icns
dev-app-update.yml
resources/icon.png
```

Keep `build/icon.ico` and `build/icon.png`.

- [ ] **Step 7: Align the current README build surface**

Replace the build section with:

````markdown
### Build for Windows

```powershell
pnpm build:win
```
````

Do not perform the Stage 9 operational README rewrite.

- [ ] **Step 8: Update the permanent inventory**

Append to `## Removed in Stage 2`:

```markdown
| macOS/Linux package scripts and electron-builder blocks | Official support is Windows-only | Remove |
| `build/entitlements.mac.plist`, `build/icon.icns` | Used only by removed macOS configuration | Remove |
| `resources/icon.png` and platform conditionals | Used only by unsupported Linux/macOS runtime branches | Remove |
| `electron-updater`, `dev-app-update.yml`, example publish endpoint | No import, startup registration, IPC, service or documented update flow | Remove |
```

- [ ] **Step 9: Run the Windows-only contract**

Run:

```powershell
pnpm test -- tests/unit/config/windows-only-project-contract.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 10: Validate supported behavior**

Run:

```powershell
pnpm test -- `
  tests/unit/config/windows-only-project-contract.test.ts `
  tests/unit/main/main-continuous-composition-guard.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts
pnpm run typecheck
pnpm run build
pnpm run format:check
pnpm run lint
git diff --check
git status --short
```

Expected:

- all focused tests pass;
- Windows production build, typecheck, global formatting and lint pass;
- no visual file or supported runtime behavior changed.

---

### Task 5: Execute the Stage 2 verification gate

**Files:**

- Modify: `docs/architecture/repository-hygiene-inventory.md`
- Review: every file changed or deleted in Tasks 1–4

**Interfaces:**

- Consumes: the complete Stage 2 working-tree diff and all project validation scripts.
- Produces: a verified hygiene checkpoint with green global quality gates and exact evidence for
  the Stage 3 architecture plan.

- [ ] **Step 1: Run all Stage 2 targeted tests**

Run:

```powershell
pnpm test -- `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/automation/workflow/continuous-agent-runtime-service.test.ts `
  tests/integration/automation/deskdata/deskdata-inspection-classifier.test.ts `
  tests/unit/config/repository-artifact-hygiene.test.ts `
  tests/unit/config/windows-only-project-contract.test.ts `
  tests/unit/main/main-continuous-composition-guard.test.ts `
  tests/unit/preload/continuous-agent-preload-api.test.ts
```

Expected: every listed file passes.

- [ ] **Step 2: Run the global zero-warning validation pipeline**

Run:

```powershell
pnpm run validate
```

Expected:

- Node and renderer typechecks pass;
- lint has zero errors and zero warnings;
- repository-wide format check passes;
- exactly 85 test files and 407 tests pass.

- [ ] **Step 3: Run production build**

Run:

```powershell
pnpm run build
```

Expected: Electron main, preload and renderer production bundles build successfully on Windows.

- [ ] **Step 4: Measure honest all-source coverage**

Run:

```powershell
pnpm run test:coverage
```

Expected:

- 85 files and 407 tests pass;
- every production TypeScript/TSX module remains included;
- metrics do not fall below the Stage 1 checkpoint:
  - statements: 83.57%;
  - branches: 74.34%;
  - functions: 88.14%;
  - lines: 83.78%.

- [ ] **Step 5: Verify removals, preservation and dependency scope**

Run:

```powershell
pnpm why electron-updater
rg -n "electron-updater|dev-app-update|build:mac|build:linux|^(mac|dmg|linux|appImage|publish):" `
  package.json `
  pnpm-lock.yaml `
  electron-builder.yml `
  src `
  README.md
Test-Path -LiteralPath 'docs/superpowers/evidence'
Test-Path -LiteralPath 'artifacts/deskdata-inspection'
Test-Path -LiteralPath 'build/icon.ico'
Test-Path -LiteralPath 'build/icon.png'
Test-Path -LiteralPath 'drizzle.config.ts'
```

Expected:

- no direct `electron-updater` dependency or unsupported build/config reference;
- preserved paths and deferred Drizzle config return `True`.

- [ ] **Step 6: Review privacy, behavior and exact scope**

Run:

```powershell
rg -n "\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b" `
  tests/unit/automation/deskdata/deskdata-pdf-text-extractor.test.ts `
  tests/unit/config `
  docs/architecture/repository-hygiene-inventory.md `
  README.md
git diff --check
git diff --name-status
git status --short
git log -1 --format=%H
```

Expected:

- no complete CPF;
- no whitespace errors;
- no supported production module moved or renamed;
- production changes are limited to mechanical LF formatting and removal of unsupported
  Linux/macOS branches;
- no visual asset in use was changed;
- HEAD remains `91902e7378ee94f90f714a8079b682477f4b0528`;
- no staging, commit, merge, push or PR.

- [ ] **Step 7: Append the exact Stage 2 result**

Append:

```markdown
## Stage 2 result

- Global format check: passing.
- Global ESLint: zero errors and zero warnings.
- Full test suite: 85 files and 407 tests passing.
- Windows production build: passing.
- Historical evidence and operational DeskData samples: preserved.
- Drizzle removal: intentionally deferred to Stage 4.
- No commit created.
```

If actual test or coverage totals differ, record the exact observed values rather than concealing
the difference.

- [ ] **Step 8: Stop for Stage 2 review**

Report:

- exact quality/test/build/coverage results;
- every removed item and its evidence;
- every preserved/deferred item;
- exact changed/deleted-file inventory;
- confirmation of unchanged supported visual/functional behavior;
- confirmation that no commit exists.

Do not create the Stage 3 plan until the Stage 2 result is reviewed and accepted.
