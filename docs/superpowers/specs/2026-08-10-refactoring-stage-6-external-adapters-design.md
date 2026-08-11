# Etapa 6 — Adaptadores externos

## 1. Objetivo

Reorganizar os adapters concretos de navegador, sessão, CPI, DeskData e PDF sobre as portas
semânticas criadas na Etapa 5, preservando exatamente o comportamento funcional e visual atual.

Ao final da etapa:

- `src/application` continuará independente de Electron, Playwright, SQLite, filesystem e
  adapters concretos;
- `src/main` comporá o núcleo da aplicação somente com implementações de `src/infrastructure`;
- os adapters Playwright implementarão explicitamente as portas consumidas pelos casos de uso;
- `src/automation` e suas fachadas de compatibilidade serão removidos;
- seletores, esperas e políticas de idempotência terão ownership explícito por plataforma;
- scripts operacionais e testes usarão os novos caminhos sem re-exports legados;
- nenhuma regra de negócio, fluxo, contrato IPC, persistência ou interface visual será alterada.

Esta etapa continua oficialmente suportada apenas no Windows.

## 2. Restrições vinculantes

1. O comportamento funcional e visual atual deve ser preservado.
2. A aplicação continua sendo proprietária da sequência dos casos de uso, lifecycle, estado,
   histórico, cancelamento e classificação.
3. Adapters executam operações externas e traduzem seus resultados; eles não duplicam decisões
   da aplicação.
4. Valores atuais de seletores, timeouts, intervalos, limites, mensagens, stages, retries e ordem
   operacional não podem mudar sem uma correção de bug isolada, comprovada e aprovada.
5. Submit DeskData, anexo CPI e salvamento CPI não podem ganhar repetição automática.
6. Pause e stop permanecem restritos aos checkpoints seguros já caracterizados na Etapa 5.
7. IPC, preload, renderer, schema SQLite, caminhos canônicos, perfil do navegador, cookies e
   sessões permanecem compatíveis.
8. CPF completo não pode aparecer em estado público, histórico, logs, eventos, erros, snapshots
   ou artefatos de teste.
9. Nenhum script operacional que acesse CPI ou DeskData será executado automaticamente pelos
   gates da etapa.
10. A etapa não cria commit nem realiza push. A publicação continua reservada à etapa final,
    depois da aprovação manual explícita do usuário.

## 3. Estado verificado na entrada

A Etapa 5 terminou com o núcleo de aplicação independente e manualmente aprovado. As portas
semânticas existentes incluem:

- `AgentWorkspacePort` e `ContinuousResearchExecutionPort`;
- `ResearchQueuePort`, `ResearchCycleFactory` e `ResearchCyclePort`;
- `CpiResearchCyclePort`, `DeskDataCyclePort` e `ResearchPreparationPort`;
- `DeskDataResearchPort`, `ResearchReportPort` e `CpiResearchPreparationPort`;
- portas de histórico, relógio, geração de ID e sanitização.

O débito físico restante está concentrado em `src/automation`:

- browser e sessão;
- polling e controles CPI;
- pesquisa DeskData e processamento PDF;
- composição Playwright do workspace, runner, ciclo e preparação;
- fachadas de estado, runtime, histórico, stage e logging.

O composition root ainda possui exatamente sete imports temporários de `main` para `automation`:

1. browser manager;
2. browser workspace service;
3. platform page manager;
4. Playwright browser launcher;
5. CPI queue filter controller;
6. platform session service;
7. Playwright agent workspace adapter.

Também existe uma exceção temporária `automation -> infrastructure` para o re-export do logger.
Vários scripts operacionais e testes ainda importam caminhos sob `src/automation`, portanto a
remoção da pasta exige migração explícita desses consumidores.

## 4. Arquitetura-alvo

```text
main ──compose──> application <──implement── infrastructure
                         │
                         └──> domain
```

A organização física prevista é:

```text
src/
  application/
    agent/
    history/
    ports/
    research/
  domain/
  infrastructure/
    automation/
      browser/
      session/
      cpi/
      deskdata/
      pdf/
      workflow/
    config/
    database/
    filesystem/
    logging/
    runtime/
  main/
  preload/
  renderer/
  shared/
```

`src/infrastructure/automation` identifica integrações externas baseadas em automação de
navegador; não reintroduz uma camada de aplicação paralela. Nenhum módulo nessa árvore pode ser
proprietário de lifecycle público, histórico, classificação de domínio ou decisões do caso de
uso.

As regras finais de dependência são:

- `application -> application | domain`;
- `domain -> domain`;
- `infrastructure -> infrastructure | application | domain`;
- `main -> main | application | infrastructure | shared`;
- `preload -> preload | shared`;
- `renderer -> renderer | shared`;
- `shared -> shared`.

Após a migração não haverá allowlist para `main -> automation`, nem exceção
`automation -> infrastructure`.

## 5. Componentes e fluxo final

O grafo ativo de produção será:

```text
MainApplicationRuntime
  -> ContinuousAgentCoordinator
  -> PlaywrightAgentWorkspaceAdapter
     -> ResearchQueueAdapter
     -> ResearchCycleAdapter
        -> CpiCycleAdapter
        -> DeskDataCycleAdapter
        -> ResearchPreparationAdapter
           -> DeskDataResearchAdapter
           -> PdfReportAdapter
           -> CpiPreparationAdapter
```

Os nomes concretos podem preservar qualificadores Playwright ou DeskData quando isso esclarecer
a tecnologia externa, mas cada adapter deve corresponder a uma porta semântica da aplicação.

### 5.1 Browser e sessão

Browser launcher, manager, workspace, resolução de páginas e detecção de sessão passam para
`src/infrastructure/automation/browser` e `session`.

Responsabilidades preservadas:

- iniciar o Chromium persistente com o mesmo perfil e opções;
- reutilizar o mesmo `BrowserContext` quando aplicável;
- localizar CPI e DeskData com as mesmas URLs e regras;
- manter as mesmas decisões de autenticação;
- fechar recursos somente nos pontos já existentes.

Handles Playwright não atravessam portas da aplicação.

### 5.2 Fila e ciclo CPI

Polling, filtros, abertura da próxima pesquisa, leitura de identidade, preparação/anexo e save
passam para `src/infrastructure/automation/cpi`.

O adapter de fila implementa `ResearchQueuePort`. O adapter do ciclo CPI implementa
`CpiResearchCyclePort`. A aplicação continua decidindo quando aguardar, abrir, salvar e retornar à
fila.

### 5.3 DeskData e PDF

Preenchimento de CPF, seleção de datasets, submit, resolução do resultado, download, leitura e
interpretação do PDF passam para `src/infrastructure/automation/deskdata` e `pdf`.

O adapter DeskData implementa `DeskDataResearchPort` e `DeskDataCyclePort`. O adapter de relatório
implementa `ResearchReportPort`, mantendo a referência lógica e o `compatibilityPath` exigido pelo
histórico atual. O adapter CPI de preparação implementa `CpiResearchPreparationPort`.

A classificação canônica continua em `domain`/`application`; parsing de formatos externos e
mapeamento para controles CPI permanecem na infraestrutura.

### 5.4 Workspace e execução contínua

`PlaywrightAgentWorkspaceAdapter` passa para `src/infrastructure/automation/workflow` e continua
sendo a única implementação ativa de `AgentWorkspacePort`.

Ele prepara contexto e páginas, constrói os adapters da execução e devolve uma implementação de
`ContinuousResearchExecutionPort`. A instância canônica de `ExecutionControl` continua sendo
criada pelo coordinator e propagada até o runner; nenhum segundo controle concorrente pode ser
criado no caminho ativo.

Runner, ciclo individual e preparação deixam de ser fachadas com decisões próprias. A sequência
permanece nos casos de uso `RunContinuousResearch`, `RunResearchCycle` e `PrepareResearch`; os
módulos de infraestrutura apenas adaptam Playwright e as factories concretas.

## 6. Seletores, esperas e idempotência

### 6.1 Seletores

Seletores CPI e DeskData serão centralizados em catálogos imutáveis próximos aos respectivos
adapters. A centralização é mecânica e deve preservar cada literal e sua ordem de fallback.

Seletores textualmente iguais, mas com significados ou ownership diferentes, não serão unidos
apenas para reduzir linhas. Controllers não devem voltar a declarar cópias locais depois da
migração.

### 6.2 Esperas e polling

Timeouts, intervalos, tentativas e condições de prontidão permanecem derivados da configuração
canônica. A migração remove números duplicados somente quando houver equivalência comprovada.

Cada espera deve:

- pertencer ao adapter que conhece o evento externo;
- respeitar o mesmo limite e intervalo atuais;
- remover listeners e subscriptions em `finally`;
- traduzir abort técnico para o resultado semântico já esperado pela aplicação;
- não transformar polling em paralelismo.

### 6.3 Idempotência

A aplicação continua controlando a sequência e a quantidade lógica de comandos. O adapter protege
a operação técnica não idempotente na fronteira externa.

Regras:

- submit DeskData ocorre no máximo uma vez por preparação;
- anexo CPI ocorre no máximo uma vez por ciclo;
- save CPI ocorre no máximo uma vez após confirmação conhecida;
- erros genéricos não disparam replay automático;
- cleanup não repete uma operação de negócio;
- uma falha de cleanup não substitui a falha primária.

## 7. Fachadas e compatibilidade

As seguintes fachadas temporárias da Etapa 5 serão removidas depois que todos os consumidores forem
migrados:

- `automation/flow/continuous-research-stage.ts`;
- `automation/history/research-history-service.ts`;
- `automation/workflow/agent-public-state-store.ts`;
- `automation/workflow/continuous-agent-runtime-service.ts`;
- `automation/flow/continuous-research-runner.ts`;
- `automation/flow/single-research-cycle.ts`;
- `automation/flow/full-research-preparation-workflow.ts`;
- `automation/logging/safe-research-logger.ts`.

Compatibilidade será preservada pelo comportamento e pelos contratos canônicos, não por re-exports
indefinidos. Consumidores internos serão migrados:

- production composition root;
- scripts operacionais;
- testes unitários, de integração, de arquitetura e type tests;
- documentação arquitetural vigente.

Imports históricos podem permanecer apenas em documentos de etapas anteriores claramente
identificados como registros históricos. Código compilável não pode depender de `src/automation`.

## 8. Erros, privacidade e recursos

Erros técnicos de Playwright, PDF e filesystem permanecem internos ao adapter. Na fronteira com a
aplicação eles são traduzidos para os erros e stages públicos já caracterizados.

Regras:

- mensagens públicas existentes são preservadas;
- selector, URL, path, HTML, cookie, token e detalhes do perfil não são expostos por IPC ou
  histórico;
- `ApplicationError.cause` permanece interno;
- um `StageError` explicitamente público continua preservado pelo boundary atual;
- CPF completo fica limitado às closures ativas de preenchimento e resolução DeskData;
- logs, estado, callbacks, histórico e testes usam somente CPF mascarado ou valor sintético seguro.

Ownership de recursos deve ser explícito:

- o componente que cria uma página, listener, subscription ou download registra sua liberação;
- cleanup ocorre em caminho equivalente a `finally`;
- stop não força interrupção de save ou anexo em andamento;
- cancelamento impede o próximo ciclo depois do checkpoint seguro;
- páginas históricas e popups continuam sendo fechados nos mesmos momentos observáveis atuais.

## 9. Estratégia de migração

A implementação será incremental e vertical:

1. caracterizar browser e sessão; mover e reconectar;
2. caracterizar fila e controles CPI; criar adapters das portas CPI;
3. caracterizar DeskData e PDF; criar adapters das portas de preparação e relatório;
4. migrar o ciclo CPI -> DeskData -> CPI sem duplicar orquestração;
5. mover o workspace Playwright e atualizar o composition root;
6. migrar scripts operacionais e testes para os caminhos canônicos;
7. remover fachadas, `src/automation` e allowlists temporárias;
8. atualizar a documentação e executar todos os gates.

Para cada slice:

1. executar a caracterização relevante;
2. escrever um teste RED para o contrato ou boundary novo;
3. aplicar a menor mudança de produção;
4. executar testes focados e relacionados;
5. revisar dependências, privacidade, idempotência e cleanup;
6. executar a suíte completa antes de avançar quando a slice alterar o grafo ativo.

Movimentos mecânicos e renomeações devem ser separados de mudanças comportamentais no diff sempre
que possível.

## 10. Testes e gates

### 10.1 Caracterização e contratos

Os testes devem cobrir:

- opções de lançamento, perfil e lifecycle do browser;
- detecção das sessões CPI e DeskData;
- seleção de páginas e frames;
- ordem e fallback dos seletores;
- estados e limites do polling da fila;
- transferência de CPF somente no caminho ativo e máscara nos boundaries;
- seleção de datasets, submit único e espera de resultado;
- download, parsing e referência compatível do PDF;
- preparação, anexo, confirmação e save único CPI;
- cleanup de páginas, listeners, subscriptions e histórico;
- tradução de erro técnico e preservação da mensagem pública;
- identidade do token de execução e checkpoints de pause/stop;
- sequência atômica de estado público e histórico.

Testes existentes não serão removidos antes de uma cobertura equivalente estar ativa no caminho
novo. Testes movidos devem manter a intenção, não apenas atualizar imports.

### 10.2 Arquitetura

Os testes arquiteturais devem provar:

- zero import de `src/application` para Playwright, Electron, filesystem, `main`, `shared` ou
  adapters concretos;
- zero import de `src/main` para `src/automation`;
- zero import compilável para `src/automation` em `src`, `scripts` e `tests`;
- inexistência da pasta `src/automation` ao final;
- somente o composition root de produção constrói o grafo canônico do agente;
- somente uma instância ativa de `ContinuousAgentCoordinator` e um controle de execução canônico;
- ausência das oito fachadas e das allowlists temporárias.

### 10.3 Gates automatizados

Ao final da etapa serão executados:

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

Também serão executados scans específicos de imports proibidos, CPF completo, duplicação de
seletores e construção paralela do coordinator/controle.

A cobertura será comparada à baseline honesta da Etapa 5. Redução relevante exige justificativa e
aprovação; testes artificiais criados apenas para elevar percentual não são aceitos.

### 10.4 Validação manual

Depois dos gates automatizados, o usuário validará no Windows:

- abertura e reutilização do browser;
- autenticação CPI e DeskData;
- fila e filtro CPI;
- ciclo completo CPI -> DeskData -> PDF -> CPI;
- pause, retomada e stop;
- histórico, mensagens e estado visual;
- fechamento e nova abertura do aplicativo.

A etapa só será marcada como manualmente aceita após confirmação explícita do usuário.

## 11. Documentação

Serão atualizados ao final:

- a referência arquitetural dos adapters externos;
- o teste/registro de dependências entre camadas;
- o roadmap com evidência real da Etapa 6;
- o ledger e o relatório de implementação da etapa;
- instruções de scripts somente quando seus caminhos ou factories mudarem.

Documentos devem descrever o resultado implementado, sem antecipar mudanças de Electron previstas
para a Etapa 7.

## 12. Fora de escopo

A Etapa 6 não autoriza:

- alterar UI, CSS, textos, componentes ou comportamento do renderer;
- modificar canais ou DTOs IPC;
- endurecer preload, navegação Electron ou permissões, reservados à Etapa 7;
- alterar schema, migrations ou localização do banco;
- mudar diretórios de download, PDF, perfil do browser ou configuração canônica;
- substituir Playwright ou a biblioteca de PDF;
- trocar seletores, timeouts, retries ou condições operacionais sem bug aprovado;
- adicionar paralelismo, cache ou recuperação automática de operações não idempotentes;
- executar scripts reais contra CPI ou DeskData sem solicitação explícita;
- remover suporte Windows ou adicionar suporte oficial a outro sistema;
- criar commit, merge, push ou mutação remota.

## 13. Critérios de aceite

A Etapa 6 estará tecnicamente concluída quando:

1. CPI, DeskData, browser, sessão, PDF e workspace estiverem sob
   `src/infrastructure/automation`;
2. as portas da aplicação tiverem implementações concretas explícitas e testadas;
3. `src/automation` e as oito fachadas temporárias não existirem;
4. não houver import compilável para os caminhos antigos;
5. `main` não importar `automation` e as allowlists da Etapa 5 forem removidas;
6. seletores, esperas e idempotência tiverem ownership único sem mudança semântica;
7. scripts operacionais compilarem pelos novos caminhos;
8. comportamento, IPC, histórico, privacidade, cancelamento e recursos permanecerem compatíveis;
9. testes focados, relacionados, suíte completa, type tests, lint, format, build e coverage
   passarem;
10. a revisão integral não encontrar finding Critical ou Important aberto;
11. o usuário testar no Windows e confirmar que tudo continua funcionando;
12. nenhum commit ou push tiver sido criado nesta etapa.
