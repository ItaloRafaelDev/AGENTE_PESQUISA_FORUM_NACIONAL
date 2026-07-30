# Repository hygiene inventory

Inventory date: 2026-07-28

## Removed in Stage 2

| Item                                                               | Evidence                                                                       | Decision                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------- |
| `.agent-backups/`                                                  | Generated timestamped copies; ignored by Git/tooling; no live import or script | Remove the complete local directory |
| `.agent-config-backups/`                                           | Generated configuration copies; ignored by Git/tooling; no live reference      | Remove the complete local directory |
| Root `task-12` and `task-13` context dumps                         | Generated repository snapshots; no live reference                              | Remove                              |
| `artifacts/task-3-current-context.txt`                             | Generated context snapshot; no live reference                                  | Remove                              |
| `artifacts/full-flow-integration-inspection/` context dump         | Generated full-flow snapshot; no live reference                                | Remove                              |
| `prettier.config.mjs`                                              | Lower-precedence duplicate; Prettier resolves `.prettierrc.yaml`               | Remove                              |
| `base.css`, `electron.svg`, `wavy-lines.svg`                       | No import, CSS reference, HTML reference or build entry                        | Remove                              |
| macOS/Linux package scripts and electron-builder blocks            | Official support is Windows-only                                               | Remove                              |
| `build/entitlements.mac.plist`, `build/icon.icns`                  | Used only by removed macOS configuration                                       | Remove                              |
| `resources/icon.png` and platform conditionals                     | Used only by unsupported Linux/macOS runtime branches                          | Remove                              |
| `electron-updater`, `dev-app-update.yml`, example publish endpoint | No import, startup registration, IPC, service or documented update flow        | Remove                              |

## Preserved

| Item                                  | Reason                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `docs/superpowers/evidence/`          | Immutable historical red/green and compatibility evidence |
| `artifacts/deskdata-inspection/`      | Operational classification samples retained for audit     |
| `build/icon.ico` and `build/icon.png` | Windows packaging resources                               |
| Current specs and plans               | Approved refactoring and behavior documentation           |

## Removed in Stage 4

| Item                                              | Evidence                                                                                             | Decision                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `drizzle.config.ts`, `drizzle-orm`, `drizzle-kit` | No runtime or test import; the configuration referenced a missing schema and a noncanonical database | Removed after verified absence of runtime use |

## Deferred

| Item                                | Target stage                       |
| ----------------------------------- | ---------------------------------- |
| README and package identity rewrite | Stage 9 distribution/documentation |

## Stage 2 result

- Global format check: passing.
- Global ESLint: zero errors and zero warnings.
- Full test suite: 85 files and 407 tests passing.
- Windows production build: passing.
- Historical evidence and operational DeskData samples: preserved.
- Drizzle removal: completed in Stage 4 after verified absence of runtime use.
- Manual Windows validation: approved by the user on 2026-07-28.
- No commit created.
