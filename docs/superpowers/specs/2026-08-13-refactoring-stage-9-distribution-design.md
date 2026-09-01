# Stage 9 — Windows Distribution and Operational Documentation Design

**Date:** 2026-08-13
**Status:** Approved design; implementation not started
**Depends on:** Stage 8 manual acceptance and commit `812649e`
**Platform:** Windows 10 and Windows 11 x64 only

## 1. Objective

Create a reproducible Windows distribution for Agente CPI, prove that the packaged application can
start safely, and replace the template README with complete operational and development guidance.

Stage 9 changes packaging, startup-path isolation and documentation only. It does not redesign the
renderer, change research rules, add automatic updates, publish a release or sign binaries.

## 2. Current evidence

The accepted Stage 8 baseline is commit `812649e` and uses:

- Electron `39.2.x`, electron-builder `26.0.x` and electron-vite `5.0.x`;
- React `19.2.x` and TypeScript `5.9.x`;
- Playwright `1.61.x` and `better-sqlite3` `12.11.x`;
- Node.js `24.11.x` and pnpm `10.28.x` in the validated workstation;
- a passing `pnpm run validate` with 126 test files and 1114 tests;
- a passing production build with 92 main, 6 preload and 50 renderer modules.

The current builder configuration still uses the placeholder identity `com.electron.app`, product
name `agente-cpi`, executable `agente-cpi` and an always-created desktop shortcut. The root README
is still the electron-vite template. `build/icon.ico` and `build/icon.png` already exist.

The application currently stores:

- its SQLite database below Electron `userData`, historically `%APPDATA%\agente-cpi`;
- its operational directories below `%APPDATA%\AgenteCPI`;
- its preferred externally managed PDFs in `E:\PDF-AGENTE-CPI`, with the internal downloads
  directory as fallback.

The existing `scripts/browser-smoke-test.ts` validates a standalone Chromium page. It does not
launch or validate the packaged Electron application and is not the Stage 9 distribution smoke.

## 3. Approved decisions

1. The official target is Windows 10 and Windows 11 x64 only.
2. Distribution consists of an assisted per-user NSIS installer and an unpacked application ZIP.
   There is no portable target.
3. The installer is unsigned in Stage 9. The README explains SmartScreen without instructing users
   to disable Windows security.
4. Product identity is `Agente CPI`, executable `AgenteCPI.exe` and App ID
   `com.agentecpi.desktop`.
5. The installer allows a custom installation directory, creates only a Start Menu shortcut and
   does not launch the application when installation finishes.
6. Updates are manual installations over the existing version and preserve user data.
7. Uninstall preserves user data by default. An unchecked opt-in removes only the application's
   internal data.
8. `E:\PDF-AGENTE-CPI`, external PDFs and the shared Playwright browser cache are never removed by
   the uninstaller.
9. The operational Chromium revision is downloaded during installation into Playwright's default
   per-user global cache. A failed download aborts and rolls back the installation.
10. Packaged smoke is automated against the unpacked application, uses an isolated temporary data
    root and never opens CPI or DeskData.
11. The installer itself has a mandatory manual Windows checklist.
12. One PowerShell pipeline validates, builds, smokes, packages, archives and hashes the release.
13. `package.json` is the sole application-version source.
14. Development uses Node.js 24 LTS and pnpm 10 through Corepack.
15. The product-name change must not relocate or hide the accepted database. Production
    `userData` remains explicitly fixed at `%APPDATA%\agente-cpi`.

## 4. Distribution architecture

### 4.1 Canonical pipeline

`scripts/build-windows-distribution.ps1` is the only complete distribution entry point. It is
fail-fast and performs these phases in order:

1. verify Windows x64, repository root, Node.js 24 and pnpm 10;
2. read the application version from `package.json`;
3. run the complete validation suite;
4. compile the Electron application once;
5. create the Windows x64 unpacked application;
6. execute the packaged smoke against `AgenteCPI.exe` from that unpacked directory;
7. create the assisted NSIS installer from the already packaged application;
8. archive the exact unpacked application as ZIP;
9. generate and immediately verify the SHA-256 manifest;
10. print the final absolute artifact paths without publishing them.

The pipeline neither runs operational CPI/DeskData scripts nor kills unrelated processes. A failed
phase returns a non-zero exit code and prevents later release phases. Temporary release files are
scoped below the distribution output directory and may be replaced only after their paths are
validated as belonging to that directory.

### 4.2 Artifact contract

For version `<version>` from `package.json`, the public artifacts are exactly:

- `Agente-CPI-<version>-Setup-x64.exe`;
- `Agente-CPI-<version>-Windows-x64.zip`;
- `SHA256SUMS.txt`.

The manifest contains one SHA-256 entry for the installer and one for the ZIP, uses artifact
basenames rather than absolute paths, and is deterministic apart from the artifact bytes. It is an
integrity aid, not proof of publisher identity. The README explains that an unsigned artifact must
come from an authorized source before its checksum is trusted.

No artifact, unpacked directory, downloaded browser, database, report or generated checksum is
tracked by Git.

### 4.3 Builder identity and targets

`electron-builder.yml` becomes the canonical packaging declaration:

- `appId: com.agentecpi.desktop`;
- `productName: Agente CPI`;
- Windows executable `AgenteCPI`;
- explicit NSIS x64 target;
- assisted installer (`oneClick: false`);
- per-user install (`perMachine: false`) with no elevation;
- selectable installation directory;
- Start Menu shortcut enabled;
- desktop shortcut disabled;
- post-install launch disabled;
- automatic application-data deletion disabled;
- artifact name matching the contract above.

The main process uses the same App User Model ID as the builder configuration. Tests reject a
second product identity, x86/ARM64/portable targets and divergent artifact naming.

The builder behavior follows the official electron-builder Windows, NSIS, configuration and CLI
contracts:

- https://www.electron.build/docs/win
- https://www.electron.build/nsis.html
- https://www.electron.build/configuration.html
- https://www.electron.build/cli.html

## 5. Chromium provisioning

The application continues to use the Chromium revision declared by the installed Playwright
version. The NSIS installation invokes the Playwright browser installer through a fixed packaged
helper and the packaged Electron runtime in Node mode. The helper path and its `install chromium`
arguments are release-owned constants; the installer accepts no arbitrary command, script path or
browser name. It does not require Node.js or pnpm on the end-user machine and does not hard-code a
browser download URL or revision independently from Playwright.

The helper runs the equivalent of `playwright install chromium` with Playwright's default browser
cache. On Windows this is the shared per-user cache below Local AppData. The installer:

- reuses an already present compatible revision;
- downloads only when the pinned revision is absent;
- respects the standard proxy and download-host environment supported by Playwright;
- reports a concise safe failure without credentials, proxy values or download URLs containing
  secrets;
- aborts installation if the compatible Chromium cannot be prepared;
- never falls back silently to an arbitrary installed Chrome executable.

The optional application-data cleanup does not delete or prune the shared cache because other
Playwright applications may own revisions there. Browser installation follows the official
Playwright guidance:

- https://playwright.dev/docs/browsers

## 6. Startup mode and path compatibility

### 6.1 Production mode

Before `app.whenReady()` and before the single-instance lock, the main process explicitly sets
Electron `userData` to `%APPDATA%\agente-cpi`. The target directory is created first because
Electron requires `app.setPath` targets to exist. This preserves the accepted SQLite location even
though the visible product name changes to `Agente CPI`.

The operational root remains `%APPDATA%\AgenteCPI`, and the preferred external PDF directory
remains `E:\PDF-AGENTE-CPI`. No automatic data migration, rename or duplicate database is added.

### 6.2 Smoke mode

A small typed startup parser recognizes only:

- `--smoke-test`;
- `--smoke-root=<absolute-directory>`.

`--smoke-test` without exactly one valid absolute smoke root fails before runtime composition. In
smoke mode, before Electron becomes ready:

- `appData` is set to `<smoke-root>\app-data`;
- `userData` is set to `<smoke-root>\user-data`;
- the preferred PDF output is overridden to `<smoke-root>\pdf-output`;
- all target directories are created beneath the resolved smoke root;
- production database, profile, downloads, logs, config and external PDF paths are unreachable.

Path containment is checked after canonical resolution. Relative paths, a filesystem root, the
workspace root, `%APPDATA%`, an existing production data directory and duplicate/conflicting smoke
arguments are rejected. The normal startup path is unchanged when the flag is absent.

Electron path configuration follows the official `app.getPath`/`app.setPath` lifecycle:

- https://www.electronjs.org/docs/latest/api/app

## 7. Packaged application smoke

`scripts/smoke-packaged-app.ts` launches the real unpacked `AgenteCPI.exe` with Playwright's
Electron automation API and a newly created temporary smoke root. It validates:

1. the Electron process starts;
2. the main window loads the packaged renderer;
3. only the restricted `window.agent` preload API is present;
4. safe read-only state, browser status, session status and first history-page IPC calls resolve;
5. the initial agent state remains stopped;
6. SQLite is created below the isolated `userData`;
7. all internal runtime directories are created below the isolated `appData`;
8. the external preferred PDF directory is not accessed;
9. no browser-start, agent-start, PDF action or portal URL is invoked;
10. normal application shutdown closes IPC, repository and Electron;
11. the temporary root can be removed after process exit.

The smoke stores no personal data and performs no network portal request. It always attempts
orderly Electron shutdown and temporary cleanup in `finally`, while preserving the primary failure
if cleanup also fails.

The launcher uses Playwright's official Electron `launch`, `firstWindow`, evaluation and close
APIs:

- https://playwright.dev/docs/api/class-electron

## 8. Installer, update and uninstall behavior

### 8.1 Installation and update

The assisted installer:

- displays and allows changing the per-user installation directory;
- does not request administrator privileges;
- creates exactly one Start Menu shortcut;
- creates no desktop shortcut;
- does not start the application at completion;
- prepares the compatible Chromium before reporting success.

Installing a newer version over the same per-user installation is the supported update flow. The
application files are replaced, while `%APPDATA%\agente-cpi`, `%APPDATA%\AgenteCPI`, external PDFs
and the Playwright cache are preserved. Automatic update checks and background downloads are out of
scope.

### 8.2 Optional data cleanup

The uninstall flow displays a separate unchecked option to remove local Agente CPI data. Without
explicit selection, it removes only installed binaries and shortcuts.

When selected, custom NSIS logic may recursively remove only these two literal app-owned roots:

- `%APPDATA%\agente-cpi`;
- `%APPDATA%\AgenteCPI`.

The implementation validates that each expanded path is non-empty, below `%APPDATA%`, and exactly
matches its expected application suffix before deletion. It never consumes a path from application
configuration, registry content or user input for recursive removal.

The cleanup never removes:

- `E:\PDF-AGENTE-CPI` or any other external PDF directory;
- Playwright's global browser cache;
- the selected installation parent directory;
- unrelated files in AppData;
- user downloads outside the application's internal operational root.

Tests characterize the default-preserve branch, selected-cleanup branch, exact allowlist and
rejection of broad/dynamic deletion targets.

## 9. Development setup

`scripts/setup-windows.ps1` is an idempotent, fail-fast developer setup for Windows 10/11 x64. It:

1. verifies Windows x64 and that execution started from the repository root;
2. verifies Node.js major version 24;
3. verifies or enables Corepack and requires pnpm major version 10;
4. validates `package.json` and `pnpm-lock.yaml`;
5. installs dependencies with the frozen lockfile without changing versions;
6. runs the repository's canonical native-module rebuild through the existing install lifecycle;
7. installs the Playwright Chromium revision;
8. runs `pnpm run validate`;
9. runs `pnpm run build`;
10. prints the development and distribution commands.

The project records `pnpm@10.28.1` exactly through `packageManager`; Corepack resolves that declared
version instead of selecting a floating pnpm 10 patch. The script does not install Git or Node.js,
store credentials, start the portals, start the agent, delete local data, change execution policy
globally or publish artifacts.

Running the script again performs safe checks and converges on the same lockfile, native build and
browser revision.

## 10. README and documentation

The root README is rewritten for two audiences.

### 10.1 Authorized operator

It documents:

- authorized-use and personal-data warning;
- Windows 10/11 x64 requirements;
- installer acquisition and SHA-256 validation;
- unsigned-build/SmartScreen limitations without security-bypass instructions;
- installation, first manual login and normal dashboard operation;
- states, controls, E1 behavior, history and PDFs;
- manual update over the current version;
- default-preserving and optional-cleanup uninstall flows;
- exact internal data roots and explicit external-PDF/cache exclusions;
- backup guidance and operational troubleshooting.

### 10.2 Developer or deployment maintainer

It documents:

- Git, Node.js 24 LTS, Corepack and pnpm 10 requirements;
- automated and manual setup paths;
- native `better-sqlite3` ABI considerations;
- Chromium installation and proxy/download troubleshooting;
- development, typecheck, tests, coverage and build commands;
- the canonical Windows distribution pipeline and artifact contract;
- packaged smoke scope and invocation;
- architecture summary and links to architecture documents;
- release checklist without publication commands.

The README contains no invented repository URL, credentials or example personal data. macOS,
Linux, ARM64 and Windows Server are described as unsupported rather than experimental.

`docs/superpowers/specs/2026-07-15-readme-installation-design.md` is marked superseded by this
specification because its experimental cross-platform and distribution assumptions no longer
match the accepted Windows-only architecture.

## 11. Error handling and security

- Every PowerShell script uses strict mode, stops on errors and checks native-process exit codes.
- User-facing failures are concise and do not include credentials, cookies, tokens, complete CPF,
  raw portal responses or sensitive environment-variable values.
- Distribution scripts do not accept arbitrary commands or evaluate downloaded script text.
- Browser download uses Playwright's pinned installer rather than a separately maintained URL.
- Recursive deletion is limited to the two exact AppData roots in section 8.2.
- Smoke paths are canonicalized and contained before any write or cleanup.
- Temporary cleanup never replaces the primary smoke or distribution error.
- Hashes are produced only after artifact handles are closed and are verified before success.
- The installer does not weaken SmartScreen, antivirus, firewall, proxy or PowerShell policy.
- No full CPF, credentials, database, profile, PDF or browser binary is committed or included in
  test evidence.

## 12. Testing strategy

Implementation is test-driven. Each new boundary first receives a focused failing test.

### 12.1 Unit and contract tests

Tests cover:

- startup-mode parsing, duplicate arguments and absolute-root validation;
- production `userData` compatibility and smoke path containment;
- smoke-specific preferred PDF override;
- exact product/App ID/executable/target/NSIS configuration;
- version-derived artifact names and manifest entries;
- installer browser-provisioning failure semantics;
- default-preserving and opt-in uninstall cleanup allowlists;
- setup and distribution pipeline ordering, fail-fast behavior and prohibited operations;
- smoke API call allowlist, orderly shutdown and primary-error preservation;
- README command, platform, path, privacy and supersession contracts.

Source contracts are permitted for declarative YAML/NSIS/PowerShell rules, but path handling,
argument parsing, artifact naming and manifest behavior must be owned by executable typed units
where practical. Mutation proofs demonstrate that broad cleanup, production-path smoke access,
portal-start calls, a second identity, a non-x64 target and ignored subprocess failures are caught.

### 12.2 Automated distribution gates

The final exact tree must pass:

1. focused Stage 9 tests;
2. Node, scripts and web typechecks plus type-tests;
3. ESLint and Prettier with zero warnings;
4. `pnpm run validate`;
5. `pnpm run build`;
6. `pnpm run test:coverage` without reducing configured thresholds;
7. unpacked Windows x64 packaging;
8. packaged Electron smoke;
9. NSIS installer generation from the verified unpacked application;
10. unpacked ZIP generation;
11. SHA-256 generation and independent readback verification;
12. `git diff --check`, privacy scans and whole-diff review;
13. zero Critical or Important review findings.

No CPI, DeskData, supervised-flow or continuous-flow operational script is part of an automated
distribution gate.

## 13. Manual Windows acceptance

The user validates on Windows 10 or Windows 11 x64:

1. SHA-256 verification of installer and ZIP;
2. installation into a custom per-user directory without elevation;
3. Chromium download success with normal network access;
4. failed Chromium download aborting without a usable partial installation;
5. exactly one Start Menu shortcut, no desktop shortcut and no automatic launch;
6. normal application launch with the accepted visual and functional behavior;
7. existing history/database preservation under `%APPDATA%\agente-cpi`;
8. full CPI → DeskData → PDF → CPI operation after manual login;
9. installation of a newer test version over the existing installation with data preserved;
10. uninstall with cleanup unchecked and data preserved;
11. reinstall followed by uninstall with cleanup checked;
12. removal of the two internal AppData roots;
13. preservation of `E:\PDF-AGENTE-CPI`, external PDFs and Playwright's global cache;
14. unpacked ZIP launch and normal shutdown;
15. SmartScreen guidance and troubleshooting accuracy.

No Stage 9 commit, merge, push or publication occurs before the user explicitly reports that this
checklist is tested and working.

## 14. Explicit non-goals

- no code signing or certificate acquisition;
- no GitHub Release, push, CI/CD or remote publication;
- no automatic updater or background update service;
- no portable, x86, ARM64, macOS, Linux or Windows Server build;
- no bundled Chromium and no fallback to an arbitrary system Chrome;
- no administrator or machine-wide installation;
- no desktop shortcut or automatic post-install launch;
- no portal access in automated smoke;
- no visual, IPC, domain, automation or database-schema redesign;
- no migration away from the accepted legacy `userData` path;
- no deletion of external PDFs or shared browser caches;
- no credentials, telemetry or personal-data fixtures.

## 15. Completion criteria

Stage 9 is accepted only when:

- identity and packaging settings have one canonical source and match the approved values;
- production data paths remain compatible with Stage 8;
- setup and distribution commands are reproducible on Windows x64;
- the compatible Playwright Chromium installs or the installer rolls back safely;
- the unpacked packaged application passes the isolated smoke;
- installer, ZIP and verified SHA-256 manifest are produced with version-derived names;
- README and supersession documentation match the actual final commands and paths;
- all automated gates pass with zero Critical or Important findings;
- the complete manual Windows checklist passes;
- Git integration is requested separately after manual acceptance.
