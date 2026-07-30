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

## Stage 1 result

The all-source coverage command passed after regression protection.
The exact post-protection totals are recorded in the Stage 1 completion report.
No baseline metric regressed.
