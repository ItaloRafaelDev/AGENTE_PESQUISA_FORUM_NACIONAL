# Stage 9 Windows Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible unsigned Windows x64 installer and unpacked ZIP, validate the
packaged application through an isolated smoke test, and document installation, operation,
development and recovery without changing accepted application behavior.

**Architecture:** Keep product identity in one JSON catalog consumed by the main bundle and
electron-builder. Configure production/smoke paths synchronously before Electron readiness,
provision Playwright Chromium through a fixed packaged helper, and orchestrate validation,
packaging, smoke, archive and hashes from one fail-fast PowerShell pipeline.

**Tech Stack:** Windows 10/11 x64, PowerShell, Node.js 24 LTS, pnpm 10.28.1 through Corepack,
TypeScript 5.9.x, Electron 39.2.x, electron-vite 5.0.x, electron-builder 26.0.x, NSIS, Playwright
1.61.x, Vitest 4.1.x and better-sqlite3 12.11.x.

**Specification:**
`docs/superpowers/specs/2026-08-13-refactoring-stage-9-distribution-design.md`

## Global Constraints

- Support only Windows 10 and Windows 11 x64.
- Preserve all accepted functional, visual, IPC, automation, database and privacy behavior.
- Use product name `Agente CPI`, executable `AgenteCPI.exe` and App ID
  `com.agentecpi.desktop` everywhere.
- Keep `package.json` as the sole version source and record `pnpm@10.28.1` in `packageManager`.
- Preserve production SQLite at `%APPDATA%\agente-cpi\agente-cpi.sqlite` and operational data at
  `%APPDATA%\AgenteCPI`.
- Never delete `E:\PDF-AGENTE-CPI`, external PDFs or Playwright's shared browser cache.
- Installer is assisted, per-user, non-elevated, unsigned, x64-only and allows selecting its
  application directory.
- Create only a Start Menu shortcut; create no desktop shortcut and do not launch after install.
- Download the pinned Playwright Chromium during installation; fail and roll back if it cannot be
  prepared.
- Automated smoke is offline with respect to CPI/DeskData and uses only a temporary isolated root.
- Do not run operational CPI, DeskData, supervised or continuous scripts during implementation.
- No signing, updater, publication, CI/CD, portable target or non-Windows target belongs here.
- No complete CPF, credentials, cookies, database, browser profile, PDF or personal data may enter
  source, tests, docs, logs, reports or artifacts.
- Every production change observes a focused RED, minimum GREEN and related regression gate.
- Do not stage, commit, merge, push or publish before explicit manual Windows acceptance. Each task
  ends at an unstaged checkpoint.

## File Map

### Canonical identity and packaging

- `build/application-identity.json` — sole product/App ID/executable/artifact-base catalog.
- `src/shared/config/application-identity.ts` — typed read-only view of the JSON catalog.
- `electron-builder.config.cjs` — executable electron-builder configuration consuming the catalog.
- `electron-builder.yml` — removed after the CJS configuration reaches GREEN.
- `package.json` — fixed package manager and canonical Stage 9 commands.
- `.gitignore` — exclude release artifacts and local smoke output.

### Startup and data isolation

- `src/main/startup/application-startup-options.ts` — parse production/smoke command-line mode.
- `src/main/startup/configure-application-paths.ts` — synchronously configure Electron paths.
- `src/main/index.ts` — apply paths before readiness/lock and use canonical identity.
- `src/main/main-application-runtime.ts` — consume injected parsed configuration.

### Browser provisioning and installer

- `src/main/distribution/playwright-browser-installation.ts` — fixed Chromium CLI execution
  boundary.
- `src/main/install-playwright-chromium.ts` — packaged Node-mode helper entry point.
- `electron.vite.config.ts` — stable second main entry for the helper.
- `build/installer.nsh` — browser installation, failure rollback and optional uninstall cleanup.

### Smoke and release pipeline

- `scripts/lib/packaged-app-smoke.ts` — typed packaged-smoke orchestration.
- `scripts/smoke-packaged-app.ts` — CLI entry point for unpacked `AgenteCPI.exe`.
- `scripts/lib/windows-distribution.ts` — pure version/artifact/hash manifest functions.
- `scripts/build-windows-distribution.ps1` — canonical complete release pipeline.
- `scripts/setup-windows.ps1` — idempotent developer setup.

### Tests and documentation

- `tests/unit/distribution/application-identity.test.ts`
- `tests/unit/distribution/electron-builder-config.test.ts`
- `tests/unit/distribution/nsis-installer-contract.test.ts`
- `tests/unit/main/startup/application-startup-options.test.ts`
- `tests/unit/main/startup/configure-application-paths.test.ts`
- `tests/unit/main/distribution/playwright-browser-installation.test.ts`
- `tests/unit/scripts/packaged-app-smoke.test.ts`
- `tests/unit/scripts/windows-distribution.test.ts`
- `tests/unit/scripts/windows-distribution-powershell.test.ts`
- `tests/unit/scripts/setup-windows.test.ts`
- `tests/unit/main/main-continuous-composition-guard.test.ts`
- `tests/unit/security/electron-security-contract.test.ts`
- `README.md`
- `docs/architecture/windows-distribution.md`
- `docs/superpowers/specs/2026-07-15-readme-installation-design.md`
- `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`

---

### Task 1: Establish Canonical Application Identity and Builder Configuration

**Files:**

- Create: `build/application-identity.json`
- Create: `src/shared/config/application-identity.ts`
- Create: `electron-builder.config.cjs`
- Create: `tests/unit/distribution/application-identity.test.ts`
- Create: `tests/unit/distribution/electron-builder-config.test.ts`
- Modify: `src/main/index.ts`
- Modify: `package.json`
- Remove: `electron-builder.yml`

**Interfaces:**

- Consumes: `package.json.version`, existing build icons and electron-builder.
- Produces:

```ts
export interface ApplicationIdentity {
  readonly appId: string
  readonly productName: string
  readonly executableName: string
  readonly artifactBaseName: string
  readonly legacyUserDataDirectoryName: string
}

export const APPLICATION_IDENTITY: Readonly<ApplicationIdentity>
```

- [ ] **Step 1: Write identity and builder RED**

Create the tests before the catalog/config. Require exactly these JSON values:

```ts
expect(identity).toEqual({
  appId: 'com.agentecpi.desktop',
  productName: 'Agente CPI',
  executableName: 'AgenteCPI',
  artifactBaseName: 'Agente-CPI',
  legacyUserDataDirectoryName: 'agente-cpi'
})
```

Require the builder config to consume that object and assert:

```ts
expect(config.appId).toBe(identity.appId)
expect(config.productName).toBe(identity.productName)
expect(config.win).toMatchObject({
  executableName: identity.executableName,
  target: [{ target: 'nsis', arch: ['x64'] }]
})
expect(config.nsis).toMatchObject({
  oneClick: false,
  perMachine: false,
  allowElevation: false,
  allowToChangeInstallationDirectory: true,
  createStartMenuShortcut: true,
  createDesktopShortcut: false,
  runAfterFinish: false,
  deleteAppDataOnUninstall: false
})
expect(config.nsis.artifactName).toBe('Agente-CPI-${version}-Setup-x64.${ext}')
```

Also assert that the config has no portable/x86/ARM64 target, uses `build/icon.ico`, outputs below
`release`, does not yet reference a missing NSIS include, and that `electron-builder.yml` no longer
exists. Task 5 adds `build/installer.nsh` and its builder reference atomically.

- [ ] **Step 2: Run RED**

Run:

```powershell
pnpm run test -- tests/unit/distribution/application-identity.test.ts tests/unit/distribution/electron-builder-config.test.ts
```

Expected: missing JSON/config failures and current placeholder identity mismatch.

- [ ] **Step 3: Create the canonical identity and typed view**

Create the exact JSON object above. In the TypeScript wrapper:

```ts
import rawIdentity from '../../../build/application-identity.json'

export interface ApplicationIdentity {
  readonly appId: string
  readonly productName: string
  readonly executableName: string
  readonly artifactBaseName: string
  readonly legacyUserDataDirectoryName: string
}

export const APPLICATION_IDENTITY = Object.freeze(rawIdentity satisfies ApplicationIdentity)
```

TypeScript widens imported JSON string properties. Keep the interface honest and structural; the
focused contract test owns the five exact values. Do not copy any identity literal into another
production source or cast the imported JSON to narrower literal types.

- [ ] **Step 4: Replace YAML with executable builder config**

`electron-builder.config.cjs` must `require('./build/application-identity.json')` and export the
current file exclusions plus:

```js
module.exports = {
  appId: identity.appId,
  productName: identity.productName,
  directories: { buildResources: 'build', output: 'release' },
  win: {
    icon: 'build/icon.ico',
    executableName: identity.executableName,
    target: [{ target: 'nsis', arch: ['x64'] }]
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    artifactName: `${identity.artifactBaseName}-\${version}-Setup-x64.\${ext}`,
    shortcutName: identity.productName,
    uninstallDisplayName: identity.productName,
    createStartMenuShortcut: true,
    createDesktopShortcut: false,
    runAfterFinish: false,
    deleteAppDataOnUninstall: false
  },
  npmRebuild: false
}
```

Retain the existing Electron download mirror and file exclusions. Do not configure `nsis.include`
until Task 5 creates the real include. Delete the superseded YAML only after the config test loads
the CJS successfully.

- [ ] **Step 5: Use identity in main and package scripts**

Replace the hard-coded App User Model ID with:

```ts
electronApp.setAppUserModelId(APPLICATION_IDENTITY.appId)
```

Add exact `packageManager: "pnpm@10.28.1"`. Update `build:unpack` and `build:win` to pass
`--config electron-builder.config.cjs`, `--x64` and the intended target explicitly. Do not add a
second version value.

- [ ] **Step 6: Verify GREEN and mutation sensitivity**

Run the two focused tests and `typecheck:node`. Temporarily change the main App ID and add an ARM64
target; each mutation must fail its contract. Restore and rerun GREEN.

- [ ] **Step 7: Record the unstaged checkpoint**

Run affected ESLint/Prettier, `git diff --check`, privacy scan and `git status --short`. Do not stage
or commit.

---

### Task 2: Preserve Production Data and Add Isolated Startup Mode

**Files:**

- Create: `src/main/startup/application-startup-options.ts`
- Create: `src/main/startup/configure-application-paths.ts`
- Create: `tests/unit/main/startup/application-startup-options.test.ts`
- Create: `tests/unit/main/startup/configure-application-paths.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/main-application-runtime.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`

**Interfaces:**

```ts
export type ApplicationStartupOptions =
  { readonly mode: 'production' } | { readonly mode: 'smoke'; readonly smokeRoot: string }

export function parseApplicationStartupOptions(
  args: readonly string[],
  temporaryDirectory?: string
): ApplicationStartupOptions

export interface ElectronPathBoundary {
  getPath(name: 'appData'): string
  setPath(name: 'appData' | 'userData', path: string): void
}

export interface ConfiguredApplicationStartup {
  readonly appDataDirectory: string
  readonly userDataDirectory: string
  readonly preferredPdfDirectory?: string
  readonly smokeRoot?: string
}

export function configureApplicationPaths(
  electron: ElectronPathBoundary,
  options: ApplicationStartupOptions
): ConfiguredApplicationStartup
```

- [ ] **Step 1: Write parser RED**

Cover production with no smoke args and smoke with one exact pair:

```ts
expect(
  parseApplicationStartupOptions(
    ['--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123'],
    'C:\\Temp'
  )
).toEqual({ mode: 'smoke', smokeRoot: 'C:\\Temp\\agente-cpi-smoke-123' })
```

Reject missing root, root without mode, duplicate mode/root, relative root, filesystem root,
non-temporary root, the temporary directory itself and a basename without the
`agente-cpi-smoke-` prefix. Ignore unrelated Electron/Playwright switches rather than rejecting
them.

- [ ] **Step 2: Write path-configuration RED**

For production, assert one synchronous `mkdirSync` and:

```ts
expect(setPath).toHaveBeenCalledWith(
  'userData',
  'C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi'
)
expect(setPath).not.toHaveBeenCalledWith('appData', expect.anything())
```

For smoke, assert canonical directories and call order:

```ts
expect(setPath.mock.calls).toEqual([
  ['appData', join(smokeRoot, 'app-data')],
  ['userData', join(smokeRoot, 'user-data')]
])
expect(result.preferredPdfDirectory).toBe(join(smokeRoot, 'pdf-output'))
```

Use an injected synchronous filesystem boundary and prove all created paths remain descendants of
the smoke root.

- [ ] **Step 3: Run RED**

Run both new test files. Expected: missing startup modules.

- [ ] **Step 4: Implement strict parsing and synchronous configuration**

Use `path.win32.resolve`, `path.win32.relative` and `os.tmpdir()` semantics. A contained path must
have a non-empty relative value that neither equals `..` nor starts with `..\` and is not absolute.
Use `mkdirSync(path, { recursive: true })` before every `app.setPath`.

Production derives `join(app.getPath('appData'), APPLICATION_IDENTITY.legacyUserDataDirectoryName)`.
Smoke derives only the three subdirectories from its validated root.

- [ ] **Step 5: Apply paths before Electron readiness and lock**

At module startup, before `app.requestSingleInstanceLock()`:

```ts
const startupOptions = parseApplicationStartupOptions(process.argv.slice(1))
const configuredStartup = configureApplicationPaths(app, startupOptions)
```

Create the runtime configuration once. In smoke mode call:

```ts
parseAppConfig({
  paths: { preferredPdfDirectory: configuredStartup.preferredPdfDirectory }
})
```

Change `MainApplicationRuntime` to accept `AppConfig` as its second constructor argument with
`parseAppConfig()` as the compatibility default. Replace its local config creation with the injected
read-only value. Normal callers and behavior remain compatible.

- [ ] **Step 6: Update composition contracts and verify GREEN**

Require startup configuration to appear before the single-instance lock and `app.whenReady()`.
Require production legacy `userData`, smoke PDF override and injected config. Run startup tests,
runtime/composition/security tests and Node typecheck.

- [ ] **Step 7: Mutation-proof isolation**

Temporarily omit the smoke `userData` override and change the production directory to `Agente CPI`.
Each focused test must fail. Restore and rerun GREEN.

- [ ] **Step 8: Record the unstaged checkpoint**

Run affected lint/format, diff-check, privacy and Git status. Do not stage or commit.

---

### Task 3: Launch and Verify the Packaged Application Offline

**Files:**

- Create: `scripts/lib/packaged-app-smoke.ts`
- Create: `scripts/smoke-packaged-app.ts`
- Create: `tests/unit/scripts/packaged-app-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface PackagedAppSmokeInput {
  readonly executablePath: string
  readonly temporaryParent?: string
}

export interface PackagedAppSmokeResult {
  readonly agentStatus: 'PARADO'
  readonly browserStatus: 'STOPPED'
  readonly historyRecords: number
}

export async function runPackagedAppSmoke(
  input: PackagedAppSmokeInput,
  dependencies?: PackagedAppSmokeDependencies
): Promise<PackagedAppSmokeResult>
```

- [ ] **Step 1: Write smoke orchestration RED**

Use fakes for `mkdtemp`, Electron launch, filesystem inspection and cleanup. Require launch with:

```ts
expect(launch).toHaveBeenCalledWith({
  executablePath: resolve(input.executablePath),
  args: ['--smoke-test', `--smoke-root=${smokeRoot}`]
})
```

The fake page must expose only `window.agent` groups `browser`, `control`, `history`, `pdf` and
`sessions`. Assert calls only to:

```ts
control.getState()
browser.getStatus()
sessions.getStatus()
history.list({ page: 1, pageSize: 50 })
```

Fail the test if start/stop/pause/resume/login/PDF methods, a portal URL or a second window is used.

- [ ] **Step 2: Characterize lifecycle and error precedence**

Prove `firstWindow()` and renderer readiness precede API evaluation. After evaluation, require
orderly `electronApp.close()`, then verify the database and directories, then remove the temporary
root. If smoke and cleanup both fail, reject with the smoke error; if only cleanup fails, reject
with `Falha ao limpar o diretório temporário do smoke.`.

- [ ] **Step 3: Run RED**

Run the new test. Expected: missing smoke module.

- [ ] **Step 4: Implement the orchestration**

Use `mkdtemp(join(resolve(temporaryParent ?? tmpdir()), 'agente-cpi-smoke-'))` and Playwright
`_electron.launch`. Wait for the first window and its document readiness. Evaluate one fixed
function that returns safe snapshots and API keys; do not serialize raw errors or paths from the
renderer.

After close, require:

```powershell
$smokeRoot\user-data\agente-cpi.sqlite
$smokeRoot\app-data\AgenteCPI\browser-profile
$smokeRoot\app-data\AgenteCPI\downloads
$smokeRoot\app-data\AgenteCPI\screenshots
$smokeRoot\app-data\AgenteCPI\logs
$smokeRoot\app-data\AgenteCPI\config
$smokeRoot\pdf-output
```

Require exactly one application window throughout the smoke.

- [ ] **Step 5: Add the CLI**

Accept exactly one `--executable=` argument whose value passes absolute-path validation, call
`runPackagedAppSmoke`, print only the safe summary and set exit code 1 with
`Falha no smoke do aplicativo empacotado.` on rejection. Add:

```json
"smoke:packaged": "tsx scripts/smoke-packaged-app.ts"
```

- [ ] **Step 6: Verify GREEN and mutations**

Run the focused tests and scripts typecheck. Temporarily call `browser.start()` and skip temporary
cleanup; each named test must fail. Restore and rerun GREEN.

- [ ] **Step 7: Record the unstaged checkpoint**

Run affected style checks, privacy, diff-check and status.

---

### Task 4: Package a Fixed Playwright Chromium Installer Helper

**Files:**

- Create: `src/main/distribution/playwright-browser-installation.ts`
- Create: `src/main/install-playwright-chromium.ts`
- Create: `tests/unit/main/distribution/playwright-browser-installation.test.ts`
- Modify: `electron.vite.config.ts`
- Modify: `tests/unit/main/main-continuous-composition-guard.test.ts`

**Interfaces:**

```ts
export interface BrowserInstallationProcess {
  run(executable: string, args: readonly string[], environment: NodeJS.ProcessEnv): Promise<number>
}

export async function installPlaywrightChromium(
  processBoundary?: BrowserInstallationProcess
): Promise<void>
```

- [ ] **Step 1: Write helper RED**

Inject a fake process boundary and assert one fixed invocation:

```ts
expect(run).toHaveBeenCalledWith(
  process.execPath,
  [resolvedPlaywrightCli, 'install', 'chromium'],
  expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' })
)
```

Require exit code 0 to resolve and any non-zero/null/spawn failure to reject with exactly
`Não foi possível preparar o Chromium necessário.`. Prove the public error excludes the raw error,
environment values and CLI path.

- [ ] **Step 2: Run RED**

Run the new test. Expected: missing module.

- [ ] **Step 3: Implement the process boundary**

Resolve the official CLI with `createRequire(import.meta.url).resolve('playwright/cli')`. Spawn
`process.execPath` with only `[cliPath, 'install', 'chromium']`, inherited standard I/O,
`windowsHide: true` and a copied environment containing `ELECTRON_RUN_AS_NODE=1`. Do not use a
shell, command string, download URL, browser revision or system Chrome path.

- [ ] **Step 4: Add the packaged helper entry**

`src/main/install-playwright-chromium.ts` calls the function and sets exit code 1 after printing
only the fixed safe error. Configure electron-vite main Rollup input with exactly:

```ts
input: {
  index: resolve(__dirname, 'src/main/index.ts'),
  'install-playwright-chromium': resolve(
    __dirname,
    'src/main/install-playwright-chromium.ts'
  )
}
```

Keep the existing main alias. The build contract requires
`out/main/install-playwright-chromium.js`.

- [ ] **Step 5: Verify GREEN and build output**

Run focused test, Node typecheck and one Electron build. Verify both main entries exist and the
normal app main remains `out/main/index.js`.

- [ ] **Step 6: Mutation-proof command closure**

Temporarily add a browser name parameter and enable `shell: true`; source/behavior contracts must
fail. Restore and rerun GREEN.

- [ ] **Step 7: Record the unstaged checkpoint**

Run affected lint/format, diff-check, privacy and status.

---

### Task 5: Implement Assisted NSIS Install, Rollback and Optional Cleanup

**Files:**

- Create: `build/installer.nsh`
- Create: `tests/unit/distribution/nsis-installer-contract.test.ts`
- Modify: `electron-builder.config.cjs`

**Interfaces:**

- Consumes: installed `AgenteCPI.exe`, packaged
  `resources\app.asar\out\main\install-playwright-chromium.js` and canonical identity.
- Produces: electron-builder `customInstall` and optional `customUnInstallSection` macros.

- [ ] **Step 1: Write NSIS RED**

Read the include as text and require:

- one `customInstall` macro;
- execution of the fixed helper with `ELECTRON_RUN_AS_NODE=1`;
- exit-code check and fixed Portuguese failure message;
- silent installed uninstaller rollback before `Abort`;
- one `customUnInstallSection` containing an optional `/o` section;
- exact roots `$APPDATA\agente-cpi` and `$APPDATA\AgenteCPI`;
- no `$LOCALAPPDATA\ms-playwright`, `E:\PDF-AGENTE-CPI`, `$INSTDIR\..`, registry-derived deletion
  path or generic user input in an `RMDir /r` command.

Also assert `deleteAppDataOnUninstall: false`, so electron-builder's broad automatic cleanup is not
enabled. Require `electron-builder.config.cjs` to reference exactly `build/installer.nsh` now that
the file exists; this is the first task allowed to add `nsis.include`.

- [ ] **Step 2: Run RED**

Run the new contract. Expected: missing include.

- [ ] **Step 3: Implement browser provisioning and rollback**

In `customInstall`, use `nsExec::ExecToStack` through `cmd.exe /D /S /C` only to set
`ELECTRON_RUN_AS_NODE=1` for the fixed installed executable/helper pair. Quote both paths and accept
no interpolated input besides `$INSTDIR`.

On non-zero exit:

1. invoke the installed uninstaller silently without `--delete-app-data`;
2. verify the rollback process exits;
3. `Abort` with `Não foi possível preparar o Chromium necessário. Tente instalar novamente.`.

Do not recursively delete `$INSTDIR` directly from the custom macro. Playwright owns cleanup of an
incomplete shared-cache browser installation.

Add `include: 'build/installer.nsh'` to the NSIS builder configuration in the same RED/GREEN cycle
that creates the include, so no checkpoint references an absent resource.

- [ ] **Step 4: Implement unchecked optional data section**

Use an NSIS optional component section:

```nsh
!macro customUnInstallSection
  Section /o "Remover dados locais do Agente CPI" SEC_REMOVE_APP_DATA
    StrCmp "$APPDATA" "" cleanup_refused
    RMDir /r "$APPDATA\agente-cpi"
    RMDir /r "$APPDATA\AgenteCPI"
    Goto cleanup_done
  cleanup_refused:
    DetailPrint "Limpeza de dados locais recusada por caminho inválido."
  cleanup_done:
  SectionEnd
!macroend
```

Add an explicit root/suffix guard before both removals rather than relying only on the snippet's
non-empty check. The optional section stays unchecked by default through `/o`.

- [ ] **Step 5: Verify GREEN and build the installer**

Run the contract and package an NSIS x64 installer. Inspect the generated installer log for the
custom include and verify its filename matches the version contract.

- [ ] **Step 6: Mutation-proof destructive boundaries**

One at a time, add `$LOCALAPPDATA\ms-playwright` cleanup, remove `/o`, enable automatic app-data
deletion and remove rollback. Each test must fail. Restore and rerun GREEN.

- [ ] **Step 7: Record the unstaged checkpoint**

Run builder/config style checks, diff-check, privacy and status. Do not install/uninstall against
the developer's real AppData in this task.

---

### Task 6: Build, Smoke, Archive and Hash from One Pipeline

**Files:**

- Create: `scripts/lib/windows-distribution.ts`
- Create: `scripts/build-windows-distribution.ps1`
- Create: `tests/unit/scripts/windows-distribution.test.ts`
- Create: `tests/unit/scripts/windows-distribution-powershell.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

```ts
export interface WindowsArtifactNames {
  readonly installer: string
  readonly unpackedArchive: string
  readonly manifest: 'SHA256SUMS.txt'
}

export function parsePackageVersion(packageJson: unknown): string
export function createWindowsArtifactNames(version: string): WindowsArtifactNames
export function createSha256Manifest(
  artifacts: readonly { readonly name: string; readonly sha256: string }[]
): string
export function verifySha256Manifest(manifest: string, hashes: ReadonlyMap<string, string>): void
```

- [ ] **Step 1: Write pure artifact RED**

Require version `1.0.0` to produce:

```ts
expect(createWindowsArtifactNames('1.0.0')).toEqual({
  installer: 'Agente-CPI-1.0.0-Setup-x64.exe',
  unpackedArchive: 'Agente-CPI-1.0.0-Windows-x64.zip',
  manifest: 'SHA256SUMS.txt'
})
```

Reject empty/non-string/non-semver package versions. Require two sorted, lowercase SHA-256 lines
using basenames only and reject missing, duplicate, absolute, parent-relative or mismatched entries.

- [ ] **Step 2: Write pipeline source RED**

Require strict mode, stop-on-error and this exact high-level order:

```text
environment checks
pnpm run validate
pnpm run build
electron-builder --dir --win --x64
pnpm run smoke:packaged
electron-builder --win nsis --x64 --prepackaged release\win-unpacked
Compress-Archive
Get-FileHash SHA256
manifest readback verification
```

Reject `git push`, release publication, signing, operational script names, `Remove-Item` outside the
resolved `release` root and any version literal independent from `package.json`.

- [ ] **Step 3: Run RED**

Run both new test files. Expected: missing modules/script.

- [ ] **Step 4: Implement pure artifact functions**

Use one strict semver pattern for the package version, canonical artifact names, sorted manifest
entries and timing-safe-independent lowercase hash comparison. Manifest output ends with one newline.

- [ ] **Step 5: Implement fail-fast PowerShell orchestration**

Use:

```powershell
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
```

Create one `Invoke-CheckedCommand` that runs a fixed executable/argument array and throws on a
non-zero `$LASTEXITCODE`. Resolve repository/release paths, validate that every cleanup/staging path
is a descendant of the repository `release` directory, and never target the repository root.

Build once, create `release\win-unpacked`, run packaged smoke, then pass that exact directory via
electron-builder `--prepackaged`. Create the ZIP from the verified unpacked directory. Generate the
manifest from installer/ZIP file bytes and independently recompute both hashes before success.

- [ ] **Step 6: Wire canonical package commands**

Add:

```json
"distribution:windows": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-distribution.ps1"
```

Keep direct build commands for diagnostics, but README must identify `distribution:windows` as the
complete release entry point. Add `/release/` and the local smoke directory pattern to `.gitignore`.

- [ ] **Step 7: Verify GREEN and fail-fast mutations**

Run unit/source contracts and scripts typecheck. In the injectable/test pipeline boundary, force
validate, smoke and hash verification to fail independently; assert no later phase runs. Restore
and rerun GREEN.

- [ ] **Step 8: Execute the actual pipeline once**

Run `pnpm run distribution:windows`. Record validation/build/test counts, smoke result, artifact
sizes and recomputed hashes. Do not publish artifacts.

- [ ] **Step 9: Record the unstaged checkpoint**

Run style, privacy, diff-check and status. Confirm `release` has no tracked files.

---

### Task 7: Add Idempotent Windows Developer Setup

**Files:**

- Create: `scripts/setup-windows.ps1`
- Create: `tests/unit/scripts/setup-windows.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: Windows PowerShell, Node.js 24, Corepack, `pnpm@10.28.1`, package/lock files.
- Produces: a repeatable development environment ending in validated build output.

- [ ] **Step 1: Write setup-script RED**

Require strict/fail-fast mode and checks for:

- `$IsWindows` or Windows platform detection;
- x64 process/OS architecture;
- repository-root `package.json` and `pnpm-lock.yaml`;
- Node major exactly 24;
- Corepack availability;
- exact declared package manager `pnpm@10.28.1`;
- `pnpm install --frozen-lockfile`;
- `pnpm exec playwright install chromium`;
- `pnpm run validate`;
- `pnpm run build`.

Reject Git/Node installers, credential prompts, execution-policy mutation, portal URLs, application
start, operational scripts and recursive deletion.

- [ ] **Step 2: Run RED**

Run the new test. Expected: missing setup script.

- [ ] **Step 3: Implement environment checks**

Use one checked-command helper. Read `packageManager` from `package.json` and require it to equal
`pnpm@10.28.1`. Check `node --version`, `corepack --version` and `corepack pnpm --version`; do not
silently substitute another pnpm. If Corepack shims are unavailable, print the exact manual
`corepack enable` instruction and fail rather than modifying system policy without visibility.

- [ ] **Step 4: Implement convergent setup**

Run, in order:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm run validate
corepack pnpm run build
```

The install lifecycle already executes the canonical native rebuild; do not invoke a second
different rebuild. Print only final commands and safe paths.

- [ ] **Step 5: Verify GREEN and idempotency**

Run the source contract. Execute the setup twice in the Stage 9 worktree. Both runs must preserve
`package.json`/lockfile hashes and finish GREEN. Record command counts and any environmental retry.

- [ ] **Step 6: Mutation-proof failures**

Using the script's checked-command test seam/source fixture, remove frozen lockfile and ignore one
non-zero exit. Each contract must fail. Restore and rerun GREEN.

- [ ] **Step 7: Record the unstaged checkpoint**

Run scripts typecheck, style, privacy, diff-check and status.

---

### Task 8: Replace Template Documentation with Operational Guidance

**Files:**

- Modify: `README.md`
- Create: `docs/architecture/windows-distribution.md`
- Modify: `docs/superpowers/specs/2026-07-15-readme-installation-design.md`
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Create: `tests/unit/distribution/readme-distribution-contract.test.ts`

**Interfaces:**

- Consumes: actual final commands, paths, artifact names, installer behavior and smoke results.
- Produces: one accurate operator/developer handbook and architecture record.

- [ ] **Step 1: Write documentation RED**

Require README text for Windows 10/11 x64, Node 24, `pnpm@10.28.1`, setup, validation,
distribution, artifacts, SHA-256, SmartScreen, manual login, states, history/PDF, update, uninstall,
data roots, browser cache preservation and troubleshooting.

Reject claims of macOS/Linux/ARM64/portable support, auto-update, signing, automatic portal login,
automatic agent start, invented repository URL, external-PDF cleanup or security-disable guidance.

- [ ] **Step 2: Run RED**

Run the new contract. Expected: template README lacks required sections.

- [ ] **Step 3: Rewrite the README for operators**

Include authorized-use warning, artifact checksum verification, assisted install, Chromium network
requirement, SmartScreen limitation, first manual login, dashboard operation, update-over-install,
default data preservation and opt-in cleanup. State explicitly that external PDFs and the global
Playwright cache survive uninstall.

Use `%APPDATA%\agente-cpi` and `%APPDATA%\AgenteCPI` exactly. Do not show any real or full CPF.

- [ ] **Step 4: Add developer and troubleshooting guidance**

Document:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
pnpm dev
pnpm run validate
pnpm run build
pnpm run test:coverage
pnpm run distribution:windows
```

Explain better-sqlite3 Electron ABI, Corepack/pnpm mismatch, missing Chromium, proxy/download
failure, SmartScreen, locked SQLite/profile, session authentication, E1 and PDF-not-found recovery.
Never recommend disabling antivirus, SmartScreen, TLS validation or PowerShell policy globally.

- [ ] **Step 5: Write distribution architecture documentation**

Document implemented ownership and flow: identity catalog → main/builder; startup parser → path
configuration → runtime; builder → unpacked smoke → prepackaged NSIS → ZIP/hash; installer helper →
Playwright cache; optional NSIS cleanup allowlist. Include the manual-vs-automated boundary.

- [ ] **Step 6: Supersede the old design and update roadmap**

At the top of the 2026-07-15 design, add status `SUPERSEDED` with a direct link to the Stage 9 spec
and state that its experimental cross-platform assumptions are no longer valid. Do not delete the
historical document.

Update the roadmap with `DONE_AUTOMATED_GATE_ONLY` only after automated gates pass, include actual
counts/artifacts/hashes without copying secret paths, and list manual Windows acceptance as pending.

- [ ] **Step 7: Verify GREEN**

Run documentation contract, Prettier for all changed docs, link/path scan, privacy scan and
`git diff --check`.

- [ ] **Step 8: Record the unstaged checkpoint**

Confirm README commands exist in `package.json`, no artifact is tracked and Git index is empty.

---

### Task 9: Whole-Diff Review, Distribution Gates and Manual Handoff

**Files:**

- Review: every Stage 9 source/test/config/script/documentation delta
- Modify when evidence requires: files owning a proven Stage 9 defect
- Modify: `docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md`
- Create: `.superpowers/sdd/2026-08-13-refactoring-stage-9-distribution-implementation-plan/task-9-report.md`

**Interfaces:**

- Consumes: Tasks 1–8 and the approved Stage 9 specification.
- Produces: reviewed artifacts, exact automated evidence and manual Windows checklist. No Git
  integration.

- [ ] **Step 1: Review the complete Stage 9 diff**

Inspect identity drift, path timing, smoke containment, browser CLI closure, NSIS quoting/rollback,
cleanup targets, pipeline fail-fast behavior, artifact/hash correctness, README accuracy and scope.
Classify each finding Critical, Important or Minor.

Fix every Critical/Important through a focused RED/GREEN round and repeat its affected gate. Defer a
Minor only with concrete risk and rationale in the report.

- [ ] **Step 2: Run the focused Stage 9 gate**

```powershell
pnpm run test -- tests/unit/distribution tests/unit/main/startup tests/unit/main/distribution tests/unit/scripts/packaged-app-smoke.test.ts tests/unit/scripts/windows-distribution.test.ts tests/unit/scripts/windows-distribution-powershell.test.ts tests/unit/scripts/setup-windows.test.ts tests/unit/main/main-continuous-composition-guard.test.ts tests/unit/security/electron-security-contract.test.ts
```

Record exact files/tests and require zero failures.

- [ ] **Step 3: Run global code-quality gates on the final tree**

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

Record exit codes, test/module counts and coverage. An environmental `spawn EPERM` may be retried
once outside the sandbox and must be documented; a functional failure must be diagnosed and fixed
through TDD.

- [ ] **Step 4: Run the canonical distribution once on the final tree**

```powershell
pnpm run distribution:windows
```

Read `$version` from `package.json`, require the unpacked smoke to pass and require these resolved
paths to exist:

```powershell
$installerPath = Join-Path 'release' "Agente-CPI-$version-Setup-x64.exe"
$archivePath = Join-Path 'release' "Agente-CPI-$version-Windows-x64.zip"
$manifestPath = Join-Path 'release' 'SHA256SUMS.txt'
```

Recompute hashes independently and compare every manifest entry. Inspect ZIP contents for
`AgenteCPI.exe` and installer metadata for x64/assisted/per-user settings.

- [ ] **Step 5: Run final safety and scope scans**

Prove:

- one canonical application identity and one version source;
- no x86/ARM64/portable/non-Windows target;
- no production/smoke path crossover;
- no recursive deletion outside the two exact AppData roots;
- no external PDF/cache deletion;
- no shell-enabled or arbitrary browser-install command;
- no portal operation in packaged smoke;
- no full CPF, credentials, cookies or raw private error;
- package/lock changes are limited to approved `packageManager`/scripts and no dependency drift;
- release/smoke artifacts are ignored and unstaged.

- [ ] **Step 6: Materialize the final report and honest roadmap status**

Record RED/GREEN cycles, mutation proofs, review findings, automated commands, counts, artifact
names/sizes, hash verification and Git invariants. Use `DONE_AUTOMATED_GATE_ONLY`; do not claim
manual installation, update or uninstall success yet.

- [ ] **Step 7: Present the manual Windows checklist**

Ask the user to verify:

1. both artifact SHA-256 values;
2. custom per-user install without elevation;
3. Chromium download and forced network-failure rollback;
4. Start Menu only, no desktop shortcut, no auto-launch;
5. accepted visual/functional application behavior;
6. legacy history/database preservation;
7. full CPI → DeskData → PDF → CPI flow;
8. update-over-install with preserved data;
9. uninstall preserving data by default;
10. opt-in uninstall removing only the two internal AppData roots;
11. preservation of external PDFs and Playwright cache;
12. unpacked ZIP launch and normal shutdown.

- [ ] **Step 8: Stop before Git integration**

Keep all Stage 9 changes unstaged and uncommitted. Only after the user explicitly reports
`A — testado e funcionando` may the status change to `DONE_STAGE_9_MANUAL_ACCEPTED`. Offer commit
and local merge as a separate choice; do not push unless separately authorized.

## Plan Self-Review Matrix

| Specification requirement                                  | Owning task     |
| ---------------------------------------------------------- | --------------- |
| Canonical product identity and Windows x64 builder target  | Task 1          |
| Legacy production `userData` compatibility                 | Task 2          |
| Strict temporary smoke paths and PDF override              | Task 2          |
| Offline packaged Electron/API/SQLite/directory smoke       | Task 3          |
| Fixed Playwright Chromium install command                  | Task 4          |
| Assisted per-user NSIS behavior and rollback               | Task 5          |
| Unchecked exact-root uninstall cleanup                     | Task 5          |
| Validate → build → smoke → NSIS → ZIP → SHA-256 pipeline   | Task 6          |
| Version-derived artifact contract and hash readback        | Task 6          |
| Node 24/Corepack/pnpm 10.28.1 developer setup              | Task 7          |
| Operator/developer README and old-spec supersession        | Task 8          |
| SmartScreen, update and troubleshooting documentation      | Task 8          |
| Complete automated gates, review and artifact verification | Task 9          |
| Manual install/update/uninstall/operational acceptance     | Task 9          |
| No commit/merge/push before explicit manual acceptance     | Global + Task 9 |

## Execution Binding

- Baseline branch: `main`.
- Binding commit: `812649e7c95f28b6d0a5dea583c2bc705780d7cb`.
- Create an isolated `refactor/stage-9-distribution` worktree through
  `superpowers:using-git-worktrees` before Task 1.
- Baseline automated evidence: `pnpm run validate` passed with 126 files/1114 tests; build passed
  with 92 main, 6 preload and 50 renderer modules.
- Preserve any externally owned worktree and never delete it automatically.
- Every task writes its report below
  `.superpowers/sdd/2026-08-13-refactoring-stage-9-distribution-implementation-plan/` and keeps the
  Git index empty.
