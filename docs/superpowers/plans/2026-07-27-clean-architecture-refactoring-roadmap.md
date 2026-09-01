# Agente CPI Clean Architecture Refactoring Roadmap

**Specification:** `docs/superpowers/specs/2026-07-27-clean-architecture-refactoring-design.md`

**Delivery model:** incremental implementation with verification checkpoints. One final
commit is allowed only after manual testing and explicit user approval.

## Verified baseline

- Branch: `refactor/limpeza-segura`
- Source: 82 TypeScript/TSX files and 5,937 lines
- Tests: 80 files and 388 passing tests
- Build: passing
- Typecheck: passing
- Format check: failing in 18 files
- ESLint: no errors and 552 line-ending warnings
- Honest coverage with every production TypeScript file included:
  - statements: 79.40%
  - branches: 72.69%
  - functions: 79.52%
  - lines: 79.55%

The previous 85.12% statement result counted only modules imported by the tests. Vitest 4
requires an explicit `coverage.include` pattern to account for untouched production files.

## Plan sequence

| Stage | Plan                               | Depends on             | Completion evidence                                         |
| ----- | ---------------------------------- | ---------------------- | ----------------------------------------------------------- |
| 1     | Baseline and regression protection | Approved specification | Honest coverage, compatibility tests, verified bug baseline |
| 2     | Repository hygiene                 | Stage 1                | Green format/lint pipeline, obsolete-file inventory         |
| 3     | Architecture boundaries            | Stage 2                | Dependency rules and layer contract tests                   |
| 4     | Configuration and persistence      | Stage 3                | Single config source, SQLite migration compatibility        |
| 5     | Application core                   | Stage 4                | Use cases independent from Electron/Playwright/SQLite       |
| 6     | External adapters                  | Stage 5                | CPI, DeskData, browser and PDF adapters behind ports        |
| 7     | Electron security                  | Stage 6                | Restricted preload, validated IPC and navigation            |
| 8     | Renderer refactoring               | Stage 7                | Smaller hooks/components with unchanged UI behavior         |
| 9     | Distribution and documentation     | Stage 8                | Windows installer, operational README and smoke test        |
| 10    | Final delivery                     | Stage 9                | Full validation, single commit and main-branch push         |

## Stage plans

Plans are written immediately before their stage so that each one uses evidence produced by
the previous stage.

1. `docs/superpowers/plans/2026-07-27-refactoring-stage-1-baseline-implementation-plan.md`
2. `docs/superpowers/plans/2026-07-27-refactoring-stage-2-hygiene-implementation-plan.md`
3. `docs/superpowers/plans/2026-07-27-refactoring-stage-3-architecture-implementation-plan.md`
4. `docs/superpowers/plans/2026-07-27-refactoring-stage-4-data-config-implementation-plan.md`
5. `docs/superpowers/plans/2026-07-27-refactoring-stage-5-application-implementation-plan.md`
6. `docs/superpowers/plans/2026-07-27-refactoring-stage-6-adapters-implementation-plan.md`
7. `docs/superpowers/plans/2026-07-27-refactoring-stage-7-electron-implementation-plan.md`
8. `docs/superpowers/plans/2026-07-27-refactoring-stage-8-renderer-implementation-plan.md`
9. `docs/superpowers/plans/2026-07-27-refactoring-stage-9-distribution-implementation-plan.md`
10. `docs/superpowers/plans/2026-07-27-refactoring-stage-10-delivery-implementation-plan.md`

Only the current stage plan must exist before implementation. Later filenames reserve the
agreed sequence; they do not authorize speculative implementation.

## Stage 5 approval status

Checkpoint final de 2026-08-10:

- as Tasks 1–10 do application core concluíram revisão e gates automatizados no worktree não
  commitado da Etapa 5;
- o usuário informou que a validação manual no Windows foi testada e está funcionando;
- a Etapa 5 está manualmente aprovada, sem commit ou push;
- a Etapa 6 iniciou posteriormente no mesmo worktree, preservando o HEAD de referência.

## Stage 6 accepted checkpoint

Em 2026-08-11, a Etapa 6 concluiu os gates automatizados: os adapters externos canônicos
substituíram `src/automation`, scripts operacionais foram migrados, e o contrato de importação não
encontra caminho legado compilável. `pnpm run validate` passou com 108 arquivos/614 testes,
`pnpm run build` passou (83 módulos main, 6 preload, 32 renderer) e `pnpm run test:coverage`
passou com 88.12% statements, 81.12% branches, 92.19% functions e 88.32% lines.

O usuário concluiu a validação manual no Windows e respondeu explicitamente
`A — testado e funcionando`. A Etapa 6 está, portanto, registrada como
`DONE_STAGE_6_MANUAL_ACCEPTED`. Nenhum commit ou push foi criado neste checkpoint.

## Stage 7 manual acceptance

Em 2026-08-12, a Etapa 7 concluiu a revisão whole-diff com `0 Critical`, `0 Important`
e `4 Minor` adiados com justificativa no relatório da Task 8. O boundary Electron agora usa
origem exata do renderer, autorização central de IPC, contratos estritos de argumentos, eventos
direcionados apenas à janela principal, navegação restrita, permission checks e requests negados,
preload limitado a `window.agent`, sandbox habilitado e shutdown idempotente com isolamento por
etapa. A onda final coordena browser `STARTING`/`STOPPING`, bloqueia novos starts após o início do
shutdown, aguarda quiescência e impede criação/carregamento da janela quando quit já começou.

Na árvore final exata, o focused security gate passou com 17 arquivos/119 testes. `pnpm run
validate` passou com 118 arquivos/701 testes, além de 3/3 type-tests sem erros; `pnpm run build`
passou com 92 módulos main, 6 preload e 32 renderer; e `pnpm run test:coverage` passou com 88,39%
statements, 81,36% branches, 91,23% functions e 88,63% lines. Lint, Prettier e os typechecks dos
três projetos também passaram.

Em 2026-08-12, o usuário concluiu a validação manual no Windows e respondeu explicitamente
`A — testado e funcionando`, incluindo o checklist de dashboard, browser e sessões, fluxo
CPI → DeskData → PDF → CPI, histórico e ações de PDF, pause/resume/stop, abertura externa HTTPS,
ausência de prompts ou novas janelas Electron, fechamento durante inicialização/bootstrap,
encerramento seguro em operação normal e reinício. A Etapa 7 está registrada como
`DONE_STAGE_7_MANUAL_ACCEPTED`. Nenhum commit, push ou publicação foi criado neste checkpoint.

## Stage 8 manual acceptance

Status: `DONE_STAGE_8_MANUAL_ACCEPTED`.

Em 2026-08-13, a Etapa 8 separou o renderer em gateway tipado, modelos puros, hooks de lifecycle e
comandos, e componentes de apresentação. O único acesso a `window.agent` ficou em
`src/renderer/src/api/agent-api.ts`; guardas recursivas rejeitam IPC Electron bruto, API genérica,
estado/effects e acesso de ambiente nos componentes de apresentação. O dashboard mantém uma trava
global de ações e o histórico mantém sua própria trava global, hidratação reconciliada, três
subscriptions e cleanup por geração.

A revisão final do diff registrou `0 Critical`, `1 Important` corrigido e `1 Minor` preservado por
compatibilidade. O finding Important separou o programa TypeScript de scripts do renderer depois
que os novos módulos `.ts` expuseram a inclusão cruzada; `typecheck:scripts` observou RED e passou
após o `exclude` mínimo. Datas válidas do histórico continuam formatadas no fuso local do processo
Windows, como antes da refatoração. Os minors de guarda adiados nas Tasks 4 e 6 foram resolvidos
pela descoberta recursiva de componentes e pelas verificações de ownership de log, hooks e modelos.

Na árvore de implementação final, o focused renderer/preload/security gate passou com 14 arquivos
e 454 testes. `pnpm run validate` passou com 126 arquivos e 1114 testes, além de 3 type-test files;
`pnpm run build` passou com 92 módulos main, 6 preload e 50 renderer; e
`pnpm run test:coverage` passou com 89,28% statements, 83,21% branches, 91,83% functions e 89,53%
lines. O CSS preservou o SHA-256
`949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6`.

Em 2026-08-13, o usuário concluiu a aceitação manual no Windows e respondeu explicitamente
`A — Testado e funcionando`. O aceite cobre aparência e comportamento do dashboard, botões,
hidratação e eventos, countdown/log, sessões, E1, histórico/PDF, fluxo operacional, fechamento e
reinício. Nenhum commit, merge, push ou publicação foi criado neste checkpoint; a integração Git
continua sendo uma decisão separada do usuário.

## Stage 9 automated-only checkpoint

Status: `DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVERS`.

Em 2026-08-17, as Tasks 1–8 implementaram identidade canônica, isolamento de startup/smoke,
helper fixo do Chromium, instalador NSIS assistido, pipeline fail-fast, setup Windows e documentação
operacional. Os contratos automatizados e gates estáticos próprios de cada task ficaram verdes, sem
commit, stage, push, publicação, execução de portal ou aceite manual da Etapa 9.

A única evidência real de instalador usada neste status vem da Task 5: o NSIS x64 final compilou
com a configuração e o include então finais como `Agente-CPI-1.0.0-Setup-x64.exe`, com
120.188.888 bytes. Ele foi inspecionado, mas nunca executado. Esse arquivo anterior não é evidência
de um pipeline Task 6 completo e nenhum hash final é reivindicado.

Waivers E2E escolhidos pelo usuário (opção B):

- **Task 6 — `DONE_AUTOMATED_GATE_ONLY`:** pipeline final, smoke empacotado, ZIP e hashes finais
  permanecem não verificados. A primeira e única execução real parou nos checks de ambiente por uma
  incompatibilidade PowerShell 5.1 depois corrigida e não houve rerun.
- **Task 7 — `DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVER`:** a primeira execução real do setup parou
  na descoberta do Corepack antes da instalação, falha depois corrigida sob TDD. As duas execuções
  convergentes não ocorreram; a idempotência de duas execuções permanece não verificada.

A aceitação manual Windows permanece pendente. Ela deve cobrir hash do instalador/ZIP, instalação
assistida e rollback de Chromium, atalhos e ausência de abertura pós-instalação, operação real após
login manual, preservação do banco/histórico, update-over-install, desinstalação com limpeza
desmarcada e marcada, preservação de PDFs/cache global, execução do ZIP e orientação SmartScreen.
Até esse aceite, não há autorização para commit, merge, push ou publicação da Etapa 9.

- **Task 9 — `DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVERS`:** em 2026-08-31, a revisão do delta
  completo corrigiu três findings Important sob gates focados: o lint global do config CommonJS, a
  aresta arquitetural exata do catálogo JSON e a distinção explícita entre x64 e ARM64 no preflight
  da pipeline. O gate focado final passou com 14 arquivos/145 testes; `validate` passou com 138
  arquivos/1.232 testes; o build transformou 98 módulos main, 6 preload e 50 renderer; e a cobertura
  ficou em 90,32% statements, 83,93% branches, 92,10% functions e 90,58% lines. Esses resultados não
  removem os waivers E2E acima: pipeline final, packaged smoke, ZIP, manifesto/hash final, setup
  idempotente e toda aceitação manual continuam pendentes.

Em 2026-09-01, a revisão independente final encontrou três findings Important adicionais: a
limpeza NSIS não auditava reparse points antes de `RMDir /r`; a raiz smoke tinha somente contenção
lexical; e `package.json` ainda expunha metadados template/URL pública. Uma única fix wave adicionou
auditoria recursiva fail-closed das duas árvores antes de qualquer exclusão, contenção filesystem
canônica revalidada contra reparse/conteúdo preexistente/workspace/AppData e removeu `description`,
`author` e `homepage` sem alterar versão, dependências ou lockfile. O RED inicial teve 8 falhas em
4 arquivos/28 testes; o RED de proteção explícita do AppData teve 2 falhas em 2 arquivos/22 testes;
o GREEN focado passou com 4 arquivos/31 testes. O gate focado Stage 9 completo passou depois com 14
arquivos/156 testes. No rerun global pós-fix, `validate` passou com 138 arquivos/1.243 testes e 3/3
type-tests; o build transformou 98 módulos main, 6 preload e 50 renderer; e a cobertura ficou em
90,24% statements, 83,98% branches, 91,90% functions e 90,49% lines. Os waivers E2E e o status
máximo permanecem inalterados. A única re-revisão independente aprovou as três correções sem
finding Critical ou Important aberto. Em 2026-09-01, após manter os waivers pela opção B, o usuário
aceitou o comportamento visual/funcional disponível, histórico/PDF, navegador/login e o fluxo
autorizado CPI → DeskData → PDF → CPI. Instalador, rollback, atalhos, update, uninstall, ZIP, hashes
e idempotência do setup permanecem explicitamente não verificados.

## Global checkpoints

Every stage ends with:

1. targeted tests for all changed behavior;
2. Node and renderer typecheck;
3. the full test suite;
4. coverage comparison against the honest baseline;
5. `git diff --check`;
6. manual diff review for scope, privacy and compatibility;
7. an explicit stage result before the next plan is written.

Formatting and lint failures already present in the baseline remain documented until Stage 2.
No new warning or failure may be introduced in Stage 1.

## Git rule

No stage creates a commit. The final delivery stage:

1. verifies the configured remote and actual primary branch;
2. reruns every quality gate;
3. reviews the complete diff;
4. hands the application to the user for manual testing;
5. waits for the user to state explicitly that the result is correct;
6. creates one commit only after that approval;
7. integrates it into the primary branch without force;
8. pushes the primary branch.
