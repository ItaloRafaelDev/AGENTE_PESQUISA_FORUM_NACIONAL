# UML AS-IS completo do Agente CPI

**Data:** 2026-07-27  
**Projeto:** `AGENTE_PESQUISA_FORUM_NACIONAL` / `agente-cpi`  
**Status:** desenho aprovado para planejamento  
**Base analisada:** snapshot do repositório recebido em `AGENTE_PESQUISA_FORUM_NACIONAL-main.zip`

## 1. Objetivo

Produzir a documentação UML completa do estado atual do Agente CPI, em duas camadas:

1. visão executiva, voltada a operação, responsabilidades e integração entre sistemas;
2. visão técnica, voltada a arquitetura, classes, interfaces, dependências, IPC, persistência, sequências e tratamento de falhas.

Os diagramas serão mantidos como fontes PlantUML versionáveis e consolidados em um PDF profissional.

## 2. Limite AS-IS

Esta documentação representa somente o código e o comportamento existentes no snapshot analisado.

Ficam explicitamente fora desta versão:

- pesquisa de menor por Nome + Data de nascimento;
- qualquer implementação TO-BE;
- reformulação do layout Electron;
- novas regras de classificação;
- novas integrações;
- alterações de código motivadas pela documentação;
- inferências não sustentadas pelos arquivos atuais.

A futura pesquisa de menor será documentada separadamente na versão TO-BE.

## 3. Baseline técnico confirmado

O projeto utiliza:

- Electron;
- React;
- TypeScript;
- electron-vite;
- Playwright com Chromium e contexto persistente;
- SQLite por `better-sqlite3`;
- Drizzle como ferramenta de banco;
- `pdf-parse`;
- Zod;
- Vitest;
- Testing Library;
- ESLint;
- Prettier.

Os pontos de entrada do aplicativo são:

```text
src/main/index.ts
src/preload/index.ts
src/renderer/src/main.tsx
```

A análise estática de imports do snapshot identificou:

```text
102 arquivos TypeScript/TSX em src
64 alcançáveis pelos pontos de entrada do aplicativo
38 auxiliares, usados por scripts, testes ou fluxos não conectados ao runtime Electron atual
```

Essa separação não significa que os 38 arquivos sejam inúteis. Eles serão identificados como componentes auxiliares, experimentais ou de suporte, sem misturá-los ao caminho de produção.

## 4. Princípio de rastreabilidade

Todo elemento interno apresentado nos diagramas técnicos deverá possuir correspondência com pelo menos um destes itens:

- arquivo real;
- classe real;
- interface real;
- tipo real;
- tabela real;
- canal IPC real;
- transição real;
- dependência real;
- comportamento confirmado por teste.

Os únicos elementos sem arquivo de origem serão:

- ator Operador;
- CPI Central;
- DeskData;
- sistema operacional Windows;
- sistema de arquivos;
- Chromium;
- SQLite enquanto tecnologia externa.

Não serão inventados métodos, heranças, serviços ou camadas.

## 5. Convenções UML

### 5.1 Idioma

- títulos e explicações: português;
- nomes de classes, interfaces, métodos, tipos e canais: exatamente como no código;
- valores de estados: exatamente como declarados no código.

### 5.2 Estereótipos

Serão usados os seguintes estereótipos:

```text
<<runtime>>       componente alcançável pelo aplicativo Electron atual
<<auxiliary>>     componente usado por scripts, testes ou fluxo não conectado ao runtime atual
<<external>>      sistema externo
<<actor>>         operador humano
<<IPC>>           contrato ou canal IPC
<<database>>      persistência SQLite
<<filesystem>>    armazenamento local
<<domain>>        regra de domínio
<<port>>          interface de dependência
<<controller>>    controlador de automação
<<service>>       serviço de aplicação
<<repository>>    repositório
```

### 5.3 Relações

- composição: somente quando o objeto é criado e controlado pelo componente;
- agregação: somente quando existe posse sem controle integral do ciclo de vida;
- implementação: somente para `implements` real;
- dependência: import, parâmetro, retorno ou chamada real;
- herança: somente quando existir `extends`;
- fluxo de dados: setas rotuladas nos diagramas de sequência e componentes;
- nenhuma relação será inferida apenas por semelhança de nomes.

### 5.4 Privacidade

Os diagramas e o PDF não poderão conter:

- CPF completo;
- nome de pesquisado;
- data de nascimento;
- credenciais;
- cookies;
- conteúdo de sessão;
- URLs com parâmetros sensíveis;
- caminho real de arquivo contendo dado pessoal.

Será usado apenas CPF mascarado nos exemplos operacionais.

## 6. Estrutura do pacote

```text
docs/uml/as-is/
├── README.md
├── _theme.puml
├── 01-contexto.puml
├── 02-casos-de-uso.puml
├── 03-atividade-ciclo-completo.puml
├── 04-estados-operacionais.puml
├── 05-implantacao.puml
├── 06-pacotes.puml
├── 07-componentes.puml
├── 08-classes-nucleo.puml
├── 09-classes-browser-sessoes.puml
├── 10-classes-cpi.puml
├── 11-classes-deskdata.puml
├── 12-sequencia-consulta-nova.puml
├── 13-sequencia-consulta-semelhante.puml
├── 14-sequencia-controle-operacional.puml
├── 15-estados-etapas-ciclo.puml
├── 16-modelo-historico.puml
├── 17-classificacao.puml
├── 18-tratamento-falhas.puml
├── build-uml.ps1
└── generated/
    ├── svg/
    ├── png/
    └── AGENTE_CPI_UML_AS_IS.pdf
```

Os 18 arquivos numerados correspondem exatamente aos 18 diagramas aprovados.

## 7. Visão executiva

## 7.1 Diagrama 01 - Contexto

**Arquivo:** `01-contexto.puml`

Deverá apresentar:

- Operador;
- Agente CPI;
- CPI Central;
- DeskData;
- armazenamento de PDFs;
- banco de histórico;
- navegador persistente.

Fluxos principais:

```text
Operador → Agente CPI: iniciar, pausar, continuar, parar e confirmar login
Agente CPI → CPI Central: monitorar fila, abrir pesquisa, anexar PDF e salvar resultado
Agente CPI → DeskData: pesquisar CPF, obter resultado e exportar PDF
Agente CPI → Sistema de arquivos: salvar e abrir PDF
Agente CPI → SQLite: registrar histórico operacional
```

O diagrama não apresentará classes.

## 7.2 Diagrama 02 - Casos de uso

**Arquivo:** `02-casos-de-uso.puml`

Ator principal:

```text
Operador
```

Casos de uso:

- abrir navegador operacional;
- autenticar manualmente na CPI;
- autenticar manualmente na DeskData;
- iniciar agente;
- confirmar login concluído;
- monitorar fila CPI;
- processar primeira pesquisa disponível;
- consultar CPF na DeskData;
- reutilizar consulta semelhante;
- baixar PDF;
- classificar resultado;
- preencher resultado na CPI;
- anexar PDF;
- confirmar gravação;
- pausar;
- continuar;
- parar;
- consultar histórico;
- limpar histórico quando permitido;
- abrir PDF;
- revelar PDF na pasta.

Relações `include` e `extend` serão aplicadas somente quando refletirem o fluxo atual.

## 7.3 Diagrama 03 - Atividade do ciclo completo

**Arquivo:** `03-atividade-ciclo-completo.puml`

Raias:

- Operador;
- Dashboard Electron;
- Runtime;
- CPI Central;
- DeskData;
- PDF e classificação;
- Histórico.

O fluxo deverá incluir:

```text
inicializar
→ validar sessões
→ aplicar filtro criminal
→ aguardar fila
→ abrir primeira pesquisa
→ ler CPF
→ preparar DeskData
→ preencher CPF
→ selecionar seis conjuntos
→ enviar consulta
→ decidir entre resultado direto e consulta semelhante
→ aguardar resultado
→ exportar PDF
→ ler processos do PDF
→ classificar Esferas
→ preparar CPI
→ anexar PDF
→ salvar e confirmar
→ preparar próxima consulta
→ retornar à fila
```

Decisões obrigatórias:

- sessões autenticadas;
- fila vazia;
- resultado direto ou semelhante;
- PDF válido;
- gravação confirmada;
- erro operacional.

## 7.4 Diagrama 04 - Estados operacionais

**Arquivo:** `04-estados-operacionais.puml`

Estados públicos reais:

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

Eventos:

```text
start
loginCompleted
pause
resume
stop
runner state
operational error
shutdown
```

Deverão ser diferenciadas:

- pausa solicitada durante ciclo ativo;
- pausa solicitada durante espera;
- parada durante ciclo ativo;
- parada durante espera;
- erro E1;
- retomada após autenticação.

A origem principal será:

```text
src/shared/types/agent-runtime-api.ts
src/automation/workflow/continuous-agent-runtime-service.ts
src/automation/workflow/agent-public-state-store.ts
```

## 7.5 Diagrama 05 - Implantação

**Arquivo:** `05-implantacao.puml`

Nós:

- estação Windows;
- processo Electron Main;
- processo Electron Renderer;
- Preload isolado;
- Chromium persistente;
- perfil `%APPDATA%\AgenteCPI\browser-profile`;
- banco `agente-cpi.sqlite` em `userData`;
- diretório operacional `AgenteCPI`;
- diretório `E:\PDF-AGENTE-CPI`;
- CPI Central;
- DeskData.

Protocolos e ligações:

- IPC Electron;
- HTTPS;
- leitura e escrita no sistema de arquivos;
- SQLite local;
- Playwright CDP interno ao Chromium.

Configurações de segurança:

```text
contextIsolation = true
nodeIntegration = false
sandbox = false
```

## 8. Visão técnica

## 8.1 Diagrama 06 - Pacotes

**Arquivo:** `06-pacotes.puml`

Pacotes:

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

Cada pacote deverá indicar:

- responsabilidade;
- dependências principais;
- classificação `<<runtime>>` ou `<<auxiliary>>`.

O diagrama deverá evidenciar que `main/index.ts` é a raiz de composição do runtime Electron atual.

## 8.2 Diagrama 07 - Componentes

**Arquivo:** `07-componentes.puml`

Componentes de runtime:

- `AgentDashboard`;
- `ResearchHistoryPanel`;
- `window.agent`;
- Preload `contextBridge`;
- handlers IPC;
- `ContinuousAgentRuntimeService`;
- `ContinuousResearchRunner`;
- `SingleResearchCycle`;
- automação CPI;
- automação DeskData;
- pipeline PDF;
- `ResearchHistoryService`;
- `ResearchHistoryRepository`;
- `BrowserWorkspaceService`;
- `PlatformSessionService`;
- `PdfFileService`.

Canais IPC reais:

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

Deverá ser mostrada a fronteira de segurança entre Renderer, Preload e Main.

## 8.3 Diagrama 08 - Classes do núcleo operacional

**Arquivo:** `08-classes-nucleo.puml`

Classes e contratos principais:

- `ContinuousAgentRuntimeService`;
- `AgentPublicStateStore`;
- `ContinuousResearchRunner`;
- `SingleResearchCycle`;
- `FullResearchPreparationWorkflow`;
- `ContinuousResearchStageError`;
- `SafeResearchLogger`;
- interfaces de portas definidas nesses módulos.

Relações obrigatórias:

```text
ContinuousAgentRuntimeService
  → AgentRuntimeBrowser
  → AgentRuntimeSessions
  → AgentRuntimeFilter
  → AgentRuntimeRunner
  → AgentRuntimeHistory
  → AgentPublicStateStore

ContinuousResearchRunner
  → ContinuousQueueMonitorPort
  → SingleResearchCycleFactory

SingleResearchCycle
  → CpiResearchOpenPort
  → CpiResearchIdentityPort
  → DeskDataNextSearchPort
  → FullResearchPreparationPort
  → CpiConfirmedSavePort
  → CpiQueueReturnPort
```

Módulos auxiliares de workflow não conectados ao runtime atual serão exibidos em uma área separada:

- `AgentController`;
- `AgentRuntimeService`;
- `CircuitBreaker`;
- `PauseController`;
- `RetryPolicy`;
- `AgentStateMachine`.

Eles não poderão aparecer como participantes do fluxo de produção atual.

## 8.4 Diagrama 09 - Classes de navegador e sessões

**Arquivo:** `09-classes-browser-sessoes.puml`

Classes de runtime:

- `BrowserManager`;
- `PlaywrightBrowserLauncher`;
- `BrowserWorkspaceService`;
- `PlatformPageManager`;
- `PlatformSessionDetector`;
- `PlatformSessionService`.

Contratos e tipos:

- `BrowserLauncher`;
- `BrowserRuntimeManager`;
- `PlatformPagesInitializer`;
- `ManagedBrowserContext`;
- `PlatformPagesSnapshot`;
- `BrowserManagerSnapshot`;
- `PlatformSessionsSnapshot`.

Comportamentos:

- iniciar contexto persistente;
- reutilizar contexto;
- abrir ou localizar páginas CPI e DeskData;
- determinar sessão autenticada, aguardando login ou indeterminada;
- encerrar navegador;
- preservar perfil.

## 8.5 Diagrama 10 - Classes CPI

**Arquivo:** `10-classes-cpi.puml`

Caminho de runtime:

- `CpiQueueFilterController`;
- `CpiQueueAvailabilityReader`;
- `CpiQueueMonitor`;
- `CpiFirstResearchOpener`;
- `CpiResearchIdentityReader`;
- `CpiResearchResultMapper`;
- `CpiResearchResultController`;
- `CpiResearchPdfAttachmentController`;
- `CpiResearchPdfPreparationWorkflow`;
- `CpiResearchResultSaver`;
- `CpiResearchConfirmedSaveController`.

Responsabilidades:

- aplicar filtro 29;
- clicar em Mostrar Tudo;
- detectar pesquisa;
- abrir primeira pesquisa;
- capturar CPF e caminho do frame;
- mapear classificação para a CPI;
- configurar fonte, status e resultado;
- anexar PDF;
- clicar em Alterar;
- validar e aceitar confirmação;
- confirmar gravação.

Componentes CPI auxiliares serão apresentados em grupo separado, sem ligação falsa ao runtime:

- `CpiActionControlEvaluator`;
- `CpiFieldStructureEvaluator`;
- `CpiResearchClassificationParser`;
- `CpiResearchResultSimulationReporter`;
- `CpiResearchSaveConfirmation`.

## 8.6 Diagrama 11 - Classes DeskData

**Arquivo:** `11-classes-deskdata.puml`

Caminho de runtime:

- `DeskDataNextSearchController`;
- `DeskDataCpfFormController`;
- `DeskDataDatasetController`;
- `DeskDataSearchSubmitController`;
- `DeskDataSearchResultPageResolver`;
- `DeskDataResultReadyWaiter`;
- `DeskDataPdfDownloadController`;
- `DeskDataPdfProcessReader`;
- `DeskDataPdfTextExtractor`;
- `DeskDataPdfProcessParser`.

Fluxos:

```text
preparar Consultar pessoas
→ preencher CPF
→ selecionar seis conjuntos
→ submeter uma vez
→ resolver resultado direto ou semelhante
→ aguardar resultado pronto
→ baixar PDF
→ extrair texto
→ interpretar processos
```

Os seis conjuntos reais:

```text
basic_data
emails_extended
addresses_extended
phones_extended
occupation_data
processes
```

O grupo auxiliar DeskData deverá documentar, sem conectá-lo falsamente ao runtime atual:

- inspeção de DOM;
- coleta de cartões;
- paginação;
- adaptador Playwright;
- captura live;
- relatórios seguros;
- inspeção de resultado;
- localizador do PDF mais recente.

## 8.7 Diagrama 12 - Sequência de consulta nova

**Arquivo:** `12-sequencia-consulta-nova.puml`

Participantes:

- Operador;
- `AgentDashboard`;
- Preload;
- handler IPC;
- `ContinuousAgentRuntimeService`;
- `ContinuousResearchRunner`;
- `CpiQueueMonitor`;
- `SingleResearchCycle`;
- CPI;
- `FullResearchPreparationWorkflow`;
- DeskData;
- pipeline PDF;
- preparação CPI;
- histórico.

A sequência deverá mostrar:

- autenticação já concluída;
- pesquisa disponível;
- criação do registro `EM_ANDAMENTO`;
- leitura e mascaramento do CPF;
- consulta nova;
- download;
- classificação;
- anexo;
- confirmação;
- atualização para `CONCLUIDO`;
- incremento de ciclos;
- retorno à fila.

## 8.8 Diagrama 13 - Sequência de consulta semelhante

**Arquivo:** `13-sequencia-consulta-semelhante.puml`

Deverá detalhar:

- submissão por CPF;
- detecção da página de consultas semelhantes;
- leitura das linhas candidatas;
- correspondência pelo CPF normalizado;
- confirmação dos seis conjuntos;
- ordenação por data;
- seleção da consulta mais recente;
- abertura de `Ver` em nova aba;
- validação da URL histórica;
- espera pelo botão Exportar;
- download do mesmo PDF disponível;
- classificação;
- salvamento CPI;
- fechamento somente da aba histórica;
- preservação da aba principal;
- retorno a Consultar pessoas.

Em caso de nenhuma correspondência segura, a sequência deve terminar em E1.

## 8.9 Diagrama 14 - Sequência de controle operacional

**Arquivo:** `14-sequencia-controle-operacional.puml`

Cenários no mesmo arquivo, separados por blocos:

1. iniciar com sessões autenticadas;
2. iniciar aguardando login;
3. confirmar login;
4. pausar durante espera;
5. pausar durante ciclo ativo;
6. continuar;
7. parar durante espera;
8. parar durante ciclo ativo;
9. encerramento do Electron.

Deverá refletir o uso de:

- `requestedExit`;
- `AbortController`;
- `runnerPromise`;
- `cycleActive`;
- `finishRequestedExit`;
- `shutdown`.

## 8.10 Diagrama 15 - Estados das etapas do ciclo

**Arquivo:** `15-estados-etapas-ciclo.puml`

Etapas reais:

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

O diagrama deverá distinguir:

- etapas emitidas diretamente por `SingleResearchCycle`;
- etapas conceituais executadas dentro de `FullResearchPreparationWorkflow`;
- transições para `ContinuousResearchStageError`;
- retorno para `WAITING_QUEUE`.

Não deverá afirmar que toda etapa é emitida individualmente quando o código atual agrupa operações sob `PREPARING_CPI_RESULT`.

## 8.11 Diagrama 16 - Modelo do histórico

**Arquivo:** `16-modelo-historico.puml`

Entidades e serviços:

- `ResearchHistoryRecord`;
- `ResearchHistoryService`;
- `ResearchHistoryRepository`;
- `ResearchHistoryRepositoryPort`;
- `ResearchHistoryEvent`;
- `ResearchHistoryPage`;
- `ResearchHistoryPanel`;
- handlers IPC de histórico.

Tabela real:

```text
research_history
```

Colunas:

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

Estados:

```text
EM_ANDAMENTO
CONCLUIDO
ERRO_E1
INTERROMPIDO
```

Operações:

- criar;
- atualizar CPF mascarado;
- concluir;
- falhar;
- listar com paginação;
- limpar;
- marcar registros não finalizados como interrompidos;
- notificar Renderer.

## 8.12 Diagrama 17 - Classificação

**Arquivo:** `17-classificacao.puml`

Caminho atual:

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

Regras atuais:

```text
qualquer Esfera criminal
→ SIM_CONSTA_RESTRICAO
→ CONSTA_RESTRICAO
→ Sim, Consta Restrições

nenhuma Esfera criminal
→ HA_INFORMACOES
→ HA_INFORMACOES
→ Há Informações
```

Esferas vazias ou não reconhecidas não geram restrição.

Os classificadores auxiliares e anteriores serão exibidos em bloco separado, sem confundi-los com o caminho atual:

- `classifyDeskDataResult`;
- `getCpiClassificationLabel`;
- `DeskDataInspectionClassifier`;
- `DeskDataSphereExtractor`;
- `DeskDataProcessResultAnalyzer`.

## 8.13 Diagrama 18 - Tratamento de falhas

**Arquivo:** `18-tratamento-falhas.puml`

Categorias:

- falha ao iniciar navegador;
- sessão não autenticada;
- fila indeterminada;
- falha em etapa do ciclo;
- consulta semelhante sem correspondência;
- PDF ausente ou inválido;
- campos CPI não confirmados;
- gravação não confirmada;
- pausa;
- parada;
- encerramento da aplicação;
- registro incompleto encontrado na inicialização.

Fluxo E1:

```text
erro original
→ ContinuousResearchStageError
→ ContinuousAgentRuntimeService.handleOperationalError
→ SafeResearchLogger
→ ResearchHistoryService.failCycle
→ AgentPublicStateStore
→ status ERRO_E1
→ evento IPC
→ dashboard
```

A fila indeterminada durante ociosidade não deverá ser apresentada como E1 quando o código a trata como estado tolerado.

## 9. Tema visual PlantUML

O arquivo `_theme.puml` deverá definir:

- fundo branco ou cinza muito claro;
- texto de alto contraste;
- bordas discretas;
- azul escuro para runtime;
- cinza para auxiliares;
- verde para resultados concluídos;
- vermelho apenas para erros;
- amarelo apenas para espera ou autenticação;
- fontes padrão do sistema, sem incorporar ou distribuir arquivos de fonte;
- ausência de gradientes;
- ausência de efeitos decorativos;
- espaçamento suficiente para leitura em PDF A4.

Os diagramas executivos devem priorizar poucos elementos e leitura rápida.

Os diagramas técnicos podem ser densos, mas deverão ser divididos por pacotes e grupos para evitar cruzamento excessivo de setas.

## 10. PDF consolidado

**Arquivo final:**

```text
docs/uml/as-is/generated/AGENTE_CPI_UML_AS_IS.pdf
```

Estrutura:

1. capa;
2. identificação do snapshot;
3. objetivo e escopo;
4. legenda UML;
5. sumário;
6. visão executiva - diagramas 01 a 05;
7. visão técnica - diagramas 06 a 18;
8. matriz de rastreabilidade;
9. inventário de módulos auxiliares;
10. observações e limites AS-IS.

Características:

- capa e textos introdutórios em A4 retrato;
- diagramas em A4 paisagem quando necessário;
- uma página ou dupla de páginas por diagrama;
- título, finalidade e fontes de código em cada seção;
- numeração de páginas;
- sumário;
- sem URLs de ambiente operacional;
- sem dados pessoais;
- sem conteúdo criado como se fosse comportamento implementado.

## 11. Matriz de rastreabilidade

O PDF e o `README.md` deverão conter uma matriz no formato:

```text
Diagrama | Elemento | Arquivo-fonte | Tipo de evidência
```

Exemplos:

```text
04 | ERRO_E1 | src/shared/types/agent-runtime-api.ts | enumeração pública
08 | ContinuousAgentRuntimeService | src/automation/workflow/continuous-agent-runtime-service.ts | classe
13 | correspondência CPF + conjuntos | src/automation/deskdata/deskdata-search-result-page-resolver.ts | algoritmo
16 | research_history | src/infrastructure/database/research-history-repository.ts | esquema SQL
17 | classifyDeskDataSpheres | src/domain/research/classify-deskdata-spheres.ts | regra de domínio
```

## 12. Processo de geração

O processo deverá ser reproduzível localmente:

```text
fontes .puml
→ validação PlantUML
→ geração SVG
→ geração PNG para inspeção
→ montagem do PDF
→ renderização do PDF em imagens
→ inspeção visual
→ validação final
```

O script `build-uml.ps1` deverá:

1. localizar Java, Graphviz e PlantUML;
2. falhar com mensagem clara quando uma dependência estiver ausente;
3. renderizar os 18 diagramas;
4. confirmar que os 18 SVGs foram gerados;
5. gerar imagens de inspeção;
6. montar o PDF;
7. confirmar que o PDF existe e possui tamanho válido;
8. não alterar código de produção;
9. retornar código de saída diferente de zero em qualquer falha.

O binário PlantUML não será incluído no repositório sem aprovação específica.

## 13. Validação

### 13.1 Validação estrutural

- exatamente 18 fontes numeradas;
- todos os arquivos iniciam com `@startuml`;
- todos terminam com `@enduml`;
- nenhuma referência a menor por Nome + nascimento;
- nenhum CPF completo;
- nenhum marcador de pendência ou texto incompleto;
- nenhum elemento interno sem fonte identificável.

### 13.2 Validação PlantUML

- renderização de todos os arquivos sem erro;
- nenhuma imagem vazia;
- nenhum diagrama cortado;
- nenhuma legenda sobreposta;
- nenhuma seta ilegível;
- nenhum texto fora da página.

### 13.3 Validação do PDF

O PDF deverá ser renderizado para PNG e inspecionado.

Critérios:

- sem texto cortado;
- sem caracteres quebrados;
- sem páginas vazias;
- sem diagramas fora da área;
- sumário coerente;
- numeração correta;
- leitura mínima aceitável em 100% de zoom;
- títulos consistentes;
- 18 diagramas presentes.

### 13.4 Validação do projeto

Como a documentação será adicionada ao repositório, deverá ser executado:

```powershell
pnpm run validate
```

A geração UML não poderá introduzir falhas em TypeScript, ESLint, Prettier ou testes.

## 14. Critérios de aceite

A documentação será considerada concluída quando:

1. os 18 arquivos PlantUML existirem;
2. todos renderizarem sem erro;
3. a visão executiva representar corretamente o fluxo operacional;
4. a visão técnica corresponder às classes e contratos do snapshot;
5. runtime e módulos auxiliares estiverem claramente separados;
6. consulta nova estiver documentada;
7. consulta semelhante estiver documentada;
8. estados públicos estiverem corretos;
9. as 13 etapas estiverem documentadas sem afirmar emissão inexistente;
10. o modelo SQLite estiver correto;
11. a classificação por Esfera estiver correta;
12. E1, pausa e parada estiverem diferenciados;
13. os canais IPC estiverem completos;
14. o PDF consolidado estiver legível e verificado;
15. não houver dados pessoais;
16. não houver pesquisa de menor na versão AS-IS;
17. a matriz de rastreabilidade estiver presente;
18. `pnpm run validate` passar.

## 15. Entregáveis

```text
18 fontes PlantUML
1 tema PlantUML
1 README de documentação
1 script PowerShell de geração
18 SVGs
18 PNGs de inspeção
1 PDF consolidado
1 matriz de rastreabilidade
```
