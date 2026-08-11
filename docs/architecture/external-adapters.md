# Adapters externos implementados

Esta é a arquitetura efetivamente implementada na Etapa 6. `src/infrastructure/automation` é a fronteira Playwright/CPI/DeskData/PDF; não é uma segunda camada de aplicação.

## Árvore final

```text
src/
  application/{agent,errors,history,ports,research}/
  domain/{errors,identity,research}/
  infrastructure/
    automation/
      browser/{browser-manager,browser-types,browser-workspace-service,platform-page-manager,playwright-browser-launcher}.ts
      session/{platform-session-detector,platform-session-service}.ts
      cpi/{queue,filter,availability,identity,result,attachment,save,selectors,...}.ts
      deskdata/{cpf-form,dataset,submit,result-resolver,result-ready,next-search,selectors,...}.ts
      pdf/{download,report,process-reader,process-parser,text-extractor,...}.ts
      workflow/{agent-workspace,continuous-execution,research-queue,research-cycle,research-preparation,cpi-cycle,deskdata-cycle,...}.ts
    {config,database,filesystem,logging,runtime}/
  main/{adapters,ipc,mappers,services}/
  preload/{index.ts,index.d.ts}/
  renderer/src/{components,hooks,App.tsx,main.tsx}/
  shared/{types,utils}/
```

`src/automation` não existe. Código compilável em `src`, `scripts` e `tests` usa somente os caminhos canônicos.

## Portas e adapters concretos

| Porta application                            | Adapter concreto                                                                           | Localização             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| `AgentWorkspacePort`                         | `PlaywrightAgentWorkspaceAdapter`                                                          | `automation/workflow`   |
| `ContinuousResearchExecutionPort`            | `PlaywrightContinuousResearchExecutionAdapter`                                             | `automation/workflow`   |
| `ResearchQueuePort`                          | `PlaywrightResearchQueueAdapter`                                                           | `automation/workflow`   |
| `ResearchCycleFactory` / `ResearchCyclePort` | `createPlaywrightResearchCycleAdapter` / `PlaywrightResearchCycleAdapter`                  | `automation/workflow`   |
| `CpiResearchCyclePort`                       | `PlaywrightCpiResearchCycleAdapter`                                                        | `automation/workflow`   |
| `DeskDataCyclePort`                          | `PlaywrightDeskDataCycleAdapter`                                                           | `automation/workflow`   |
| `ResearchPreparationPort`                    | `PlaywrightResearchPreparationAdapter`                                                     | `automation/workflow`   |
| `DeskDataResearchPort`                       | `PlaywrightDeskDataResearchAdapter`                                                        | `automation/workflow`   |
| `ResearchReportPort`                         | `DeskDataPdfReportAdapter`                                                                 | `automation/pdf`        |
| `CpiResearchPreparationPort`                 | `PlaywrightCpiPreparationAdapter`                                                          | `automation/workflow`   |
| história, clock, ID e sanitização            | `ResearchHistoryRepository`, `SystemClock`, `UuidGenerator`, `SafeMessageSanitizerAdapter` | infraestrutura canônica |

## Donos de seletores

| Plataforma                              | Catálogo/owner único                                                                     | Consumidores                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| CPI fila, identidade, resultado e anexo | `cpi/cpi-selectors.ts`                                                                   | filtro, opener, reader, result e attachment               |
| DeskData                                | `deskdata/deskdata-selectors.ts`                                                         | CPF form, datasets, submit, resolver e readiness          |
| Sessão CPI/DeskData                     | seletor inline `input[type="password"]:visible` em `session/platform-session-service.ts` | detector de sessão; workspace só compõe o serviço         |
| Browser/páginas autenticadas            | `browser/platform-page-manager.ts` e `workflow/playwright-agent-workspace-adapter.ts`    | workspace resolve as páginas CPI/DeskData para composição |

Literais e ordem de fallback foram preservados nos catálogos; controllers não declaram cópias locais.

## Donos de espera e polling

| Operação externa                      | Owner                    | Limite/condição                                                      |
| ------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| fila CPI                              | `CpiQueueMonitor`        | intervalo canônico, `AbortSignal` e predicate dinâmica de pause/stop |
| frame/filtro/identidade/resultado CPI | controllers CPI          | tentativas/intervalos de `PlaywrightAutomationConfig`                |
| formulário/resultado DeskData         | controllers DeskData     | polling, navigation/action/read timeout canônicos                    |
| download/PDF                          | adapter PDF              | timeout canônico de download e ação                                  |
| browser/páginas/sessão                | adapters browser/session | timeout de navegação canônico                                        |

O adapter de fila encaminha a mesma `Page`, o mesmo `AbortSignal`, os checks e uma predicate que lê a diretiva no momento da chamada. Não cria polling paralelo.

## Idempotência na fronteira

| Operação                                      | Classificação               | Regra aplicada                                                                              |
| --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| iniciar/reutilizar browser e consultar sessão | idempotente                 | observa/reutiliza recurso existente                                                         |
| refresh/consulta da fila                      | idempotente por check       | application define sequência; monitor não paraleliza                                        |
| preencher CPF e datasets                      | preparada por ciclo         | estado isolado por ciclo                                                                    |
| submit DeskData                               | não idempotente             | no máximo um por preparação; sem retry genérico                                             |
| download PDF                                  | side effect não idempotente | `DeskDataPdfDownloadController.downloadOnce` protege a execução por estado e não faz replay |
| anexo CPI                                     | não idempotente             | no máximo um por ciclo confirmado                                                           |
| save CPI                                      | não idempotente             | no máximo um após confirmação conhecida                                                     |

## Recursos, erros e privacidade

| Recurso/fronteira               | Owner e cleanup                                                                                | Tradução/privacidade                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| browser/context/páginas         | `BrowserManager`/workspace; shutdown canônico encerra o browser                                | handles não cruzam application                                                                          |
| subscription token/AbortSignal  | execution adapter assina uma vez e executa cleanup explícito, guarded, após capturar o outcome | abort normalizado só para `AbortError`/`ABORT_ERR` reconhecido; primary failure prevalece sobre cleanup |
| estado de ciclo/preparação      | cycle adapter limpa em `finally`                                                               | não retém CPF entre ciclos                                                                              |
| popup/página histórica DeskData | ciclo/use case encerra no ponto caracterizado                                                  | URL/HTML/path não vira erro público                                                                     |
| download/PDF                    | report adapter controla o recurso físico                                                       | referência compatível é opaca à application                                                             |
| falha técnica                   | adapters → `ApplicationError`/`ContinuousResearchStageError` → coordinator                     | causa interna, mensagem sanitizada e stage público                                                      |

O execution adapter usa outcomes discriminados para sucesso, falha primária e cleanup, inclusive para `throw undefined`; a falha primária prevalece. O CPF completo atravessa `ResearchIdentity.cpf`, portas e casos de uso somente em memória durante o ciclo, incluindo as closures de infraestrutura que preenchem/resolvem a DeskData. Ele não é publicado em estado, histórico, logs, callbacks ou erros públicos; essas fronteiras usam a máscara. Fixtures sintéticas zero-prefixadas permanecem documentadas nos testes.

## Grafo de composição de produção

```text
MainApplicationRuntime
  ├─ BrowserManager ── PlaywrightBrowserLauncher
  ├─ BrowserWorkspaceService ── PlatformPageManager
  ├─ PlatformSessionService ── BrowserManager
  ├─ CpiQueueFilterController
  ├─ PlaywrightAgentWorkspaceAdapter
  │   ├─ BrowserWorkspaceService
  │   ├─ PlatformSessionService
  │   └─ CpiQueueFilterController
  ├─ ContinuousAgentCoordinator ── ExecutionControl (um por operação)
  │   └─ PlaywrightAgentWorkspaceAdapter
  │       └─ PlaywrightContinuousResearchExecutionAdapter
  │           ├─ PlaywrightResearchQueueAdapter ── CpiQueueMonitor
  │           └─ PlaywrightResearchCycleAdapter (uma instância por ciclo)
  │               ├─ PlaywrightCpiResearchCycleAdapter
  │               ├─ PlaywrightDeskDataCycleAdapter
  │               └─ PlaywrightResearchPreparationAdapter
  │                   ├─ PlaywrightDeskDataResearchAdapter
  │                   ├─ DeskDataPdfReportAdapter
  │                   └─ PlaywrightCpiPreparationAdapter
  └─ ResearchHistoryService ── ResearchHistoryRepository/SystemClock/UuidGenerator/SafeMessageSanitizerAdapter
```

`MainApplicationRuntime` é a única composição ativa de `ContinuousAgentCoordinator`; o caminho ativo não cria segundo `ExecutionControl`.

## Compatibilidade dos scripts operacionais

Os 20 scripts CPI/DeskData migraram de imports legados para application/infrastructure canônicos. `run-continuous-auto-research.ts` preserva Ctrl+C, prompts, paths, defaults, output e exit handling com `ExecutionControl`/execution adapter; `run-full-supervised-research.ts` usa a factory de preparação canônica e projeta relatório, classificação e labels CPI estáveis. Os gates não executam scripts contra CPI ou DeskData.
