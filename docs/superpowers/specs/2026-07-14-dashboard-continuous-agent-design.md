# Design — Dashboard do agente automático contínuo

Data: 14 de julho de 2026

## 1. Objetivo

Integrar o agente automático contínuo já validado ao dashboard existente do aplicativo Electron.

O dashboard será responsável por:

- iniciar o agente;
- solicitar pausa;
- continuar uma execução pausada;
- solicitar parada;
- orientar o login manual;
- mostrar o estado atual;
- mostrar a etapa operacional atual;
- mostrar a quantidade de ciclos concluídos;
- mostrar a situação da fila;
- mostrar a contagem regressiva da próxima verificação;
- mostrar o último erro E1;
- exibir o histórico persistente das pesquisas;
- abrir o PDF gerado;
- abrir a pasta do PDF;
- limpar somente o histórico armazenado.

O fluxo automático existente continuará sendo a fonte de verdade para a execução das pesquisas.

## 2. Decisões aprovadas

### 2.1 Histórico

O histórico será persistido em SQLite e permanecerá disponível após fechar e abrir o aplicativo.

Os registros serão mantidos indefinidamente.

A limpeza será exclusivamente manual.

A ação **Limpar histórico** excluirá somente registros do SQLite.

Nenhum PDF será excluído pela limpeza do histórico.

### 2.2 Proteção de dados

O histórico armazenará somente:

- CPF mascarado;
- classificação;
- resultado aplicado na CPI;
- status do ciclo;
- data e hora de início;
- data e hora de término;
- duração;
- caminho técnico do PDF;
- etapa de erro;
- mensagem segura de erro.

O histórico não armazenará:

- CPF completo;
- nome completo;
- conteúdo integral da pesquisa;
- credenciais;
- cookies;
- tokens de autenticação;
- conteúdo do PDF;
- dados brutos retornados pela DeskData;
- dados brutos exibidos pela CPI.

### 2.3 Inicialização

Ao abrir o aplicativo, o agente sempre iniciará no estado **PARADO**.

Nenhuma pesquisa será iniciada automaticamente.

Nenhuma aba será aberta automaticamente.

Nenhum custo será gerado até o clique em **Iniciar agente**.

### 2.4 Pausa

Ao clicar em **Pausar**:

- se o agente estiver ocioso, ele pausará imediatamente;
- se houver um ciclo em andamento, ele concluirá o ciclo;
- o ciclo atual será gravado normalmente;
- a DeskData será preparada para a próxima consulta;
- o agente retornará à fila;
- nenhuma nova pesquisa será aberta;
- o navegador permanecerá aberto;
- as sessões autenticadas permanecerão disponíveis.

### 2.5 Parada

Ao clicar em **Parar**:

- se o agente estiver ocioso, ele parará imediatamente;
- se houver um ciclo em andamento, ele concluirá o ciclo;
- o ciclo atual será gravado normalmente;
- nenhuma nova pesquisa será aberta;
- o agente passará ao estado **PARADO**;
- o navegador permanecerá aberto;
- as sessões autenticadas permanecerão disponíveis.

### 2.6 Reinício

Ao clicar novamente em **Iniciar agente**:

- o aplicativo tentará reutilizar o navegador existente;
- o aplicativo reutilizará o contexto persistente quando estiver válido;
- uma nova instância será criada somente quando a anterior estiver fechada, desconectada ou inválida;
- não poderão existir duas execuções simultâneas do agente.

### 2.7 Login

Quando a sessão da CPI ou da DeskData estiver expirada:

- o agente não iniciará uma pesquisa parcialmente;
- o dashboard passará ao estado **AGUARDANDO_LOGIN**;
- o navegador exibirá a página necessária;
- o usuário fará o login manualmente;
- o dashboard exibirá o botão **Login concluído — continuar**;
- após o clique, o aplicativo validará CPI e DeskData;
- o agente retomará somente após as duas validações;
- esse estado não será tratado como erro E1.

### 2.8 PDFs

Cada registro com PDF terá:

- botão **Abrir PDF**;
- botão **Abrir pasta**.

**Abrir PDF** utilizará o aplicativo padrão do Windows.

**Abrir pasta** utilizará o Explorer e selecionará o arquivo quando possível.

Quando o arquivo não existir, o dashboard mostrará **PDF não encontrado**.

A ausência do PDF não interromperá o agente.

## 3. Arquitetura

A integração será dividida em cinco camadas.

### 3.1 Renderer React

Responsável somente pela interface visual.

Não terá acesso direto a:

- Node.js;
- Playwright;
- SQLite;
- sistema de arquivos;
- processos;
- shell do Windows.

O renderer consumirá exclusivamente a API exposta pelo preload.

### 3.2 Preload

O preload usará `contextBridge` para expor uma API estritamente tipada.

A API não aceitará comandos arbitrários, caminhos executáveis nem código dinâmico.

O preload exporá apenas operações autorizadas do agente, histórico e PDFs.

### 3.3 Electron main

O processo principal controlará:

- estado do agente;
- `ContinuousResearchRunner`;
- `SingleResearchCycle`;
- `AbortController`;
- sessão do navegador;
- Playwright;
- SQLite;
- histórico;
- abertura de PDF;
- abertura de pasta;
- comunicação IPC.

O processo `main` não iniciará o agente executando comandos PowerShell ou `pnpm`.

O runner será importado e executado diretamente pelo aplicativo.

### 3.4 Serviço de execução

Será criado um serviço denominado `AgentRuntimeService`.

Responsabilidades:

- impedir mais de uma execução simultânea;
- iniciar o runner;
- controlar pausa;
- controlar continuação;
- controlar parada;
- controlar estado de login;
- manter a sessão do navegador;
- contabilizar ciclos;
- emitir atualizações para o dashboard;
- aplicar a política E1;
- registrar o histórico de cada ciclo.

### 3.5 Persistência SQLite

Será criado um repositório isolado para o histórico.

A implementação usará `better-sqlite3` no processo principal do Electron.

O renderer não acessará o banco diretamente.

O arquivo SQLite ficará no diretório `userData` fornecido pelo Electron.

Nome previsto do arquivo:

```text
agente-cpi.sqlite
```

## 4. Estados do agente

Os estados públicos serão:

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

### 4.1 PARADO

Não existe monitoramento ativo.

O navegador pode permanecer aberto.

### 4.2 INICIANDO

O aplicativo está preparando o banco, o navegador, as páginas e as sessões.

### 4.3 AGUARDANDO_LOGIN

Uma ou mais sessões precisam de autenticação manual.

Nenhum ciclo poderá começar.

### 4.4 EXECUTANDO

Existe uma pesquisa em andamento.

### 4.5 PAUSANDO

A pausa foi solicitada durante um ciclo.

O agente concluirá o ciclo antes de pausar.

### 4.6 PAUSADO

O navegador permanece aberto, mas nenhuma nova pesquisa será iniciada.

### 4.7 PARANDO

A parada foi solicitada durante um ciclo.

O agente concluirá o ciclo antes de parar.

### 4.8 OCIOSO

A fila está vazia.

O agente aguarda a próxima verificação de 60 segundos.

### 4.9 ERRO_E1

Um erro operacional interrompeu o agente.

Nenhuma nova pesquisa será iniciada.

O navegador permanecerá aberto para inspeção.

## 5. Modelo de estado público

O dashboard receberá um objeto equivalente a:

```ts
type AgentPublicState = {
  status:
    | 'PARADO'
    | 'INICIANDO'
    | 'AGUARDANDO_LOGIN'
    | 'EXECUTANDO'
    | 'PAUSANDO'
    | 'PAUSADO'
    | 'PARANDO'
    | 'OCIOSO'
    | 'ERRO_E1'
  currentStage: string | null
  completedCycles: number
  queueStatus: 'DESCONHECIDA' | 'COM_PESQUISA' | 'VAZIA'
  nextCheckAt: string | null
  remainingSeconds: number | null
  currentMaskedCpf: string | null
  lastError: {
    stage: string
    message: string
    occurredAt: string
  } | null
}
```

O CPF presente no estado público sempre estará mascarado.

## 6. Modelo SQLite

Será criada a tabela:

```sql
CREATE TABLE research_history (
  id TEXT PRIMARY KEY,
  masked_cpf TEXT NOT NULL,
  classification TEXT NOT NULL,
  cpi_result TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  pdf_path TEXT,
  error_stage TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);
```

Índices:

```sql
CREATE INDEX idx_research_history_started_at
ON research_history(started_at DESC);

CREATE INDEX idx_research_history_status
ON research_history(status);

CREATE INDEX idx_research_history_classification
ON research_history(classification);
```

O banco não terá coluna para CPF completo ou nome.

## 7. Status do histórico

Os registros poderão assumir:

```text
EM_ANDAMENTO
CONCLUIDO
ERRO_E1
INTERROMPIDO
```

Um registro será criado no início do ciclo.

Ao final, o mesmo registro será atualizado.

Não será criado um segundo registro para representar o término do mesmo ciclo.

## 8. Contratos IPC

Os canais de comando serão:

```text
agent:get-state
agent:start
agent:pause
agent:resume
agent:stop
agent:login-completed

history:list
history:clear

pdf:open
pdf:reveal
```

Os canais de eventos serão:

```text
agent:state-changed
history:record-created
history:record-updated
history:cleared
```

Todos os argumentos IPC serão validados no processo principal.

O renderer nunca enviará SQL, seletores Playwright ou comandos de shell.

## 9. Fluxo de início

1. O usuário clica em **Iniciar agente**.
2. O renderer envia `agent:start`.
3. O main verifica se já existe execução ativa.
4. O main inicializa o SQLite.
5. O main tenta reutilizar o navegador existente.
6. O main valida a CPI.
7. O main valida a DeskData.
8. Se faltar login, muda para **AGUARDANDO_LOGIN**.
9. Se as sessões estiverem válidas, aplica o filtro 29.
10. O runner contínuo é iniciado.
11. O estado é enviado ao dashboard.

## 10. Fluxo de pausa

1. O usuário clica em **Pausar**.
2. Se estiver ocioso, o agente muda para **PAUSADO**.
3. Se houver ciclo ativo, muda para **PAUSANDO**.
4. O ciclo atual termina normalmente.
5. O histórico é finalizado.
6. O agente retorna à fila.
7. Nenhuma nova pesquisa é aberta.
8. O estado muda para **PAUSADO**.

## 11. Fluxo de continuação

1. O usuário clica em **Continuar**.
2. O main confirma que o estado atual é **PAUSADO**.
3. O navegador existente é validado.
4. As sessões são validadas.
5. Se necessário, muda para **AGUARDANDO_LOGIN**.
6. Caso contrário, o monitoramento da fila é retomado.

## 12. Fluxo de parada

1. O usuário clica em **Parar**.
2. Se estiver ocioso, o monitoramento é encerrado imediatamente.
3. Se houver ciclo ativo, muda para **PARANDO**.
4. O ciclo atual termina normalmente.
5. Nenhuma nova pesquisa é aberta.
6. O estado muda para **PARADO**.
7. O navegador permanece aberto.

## 13. Fluxo de erro E1

1. Uma etapa operacional lança erro.
2. O ciclo atual é atualizado como **ERRO_E1**.
3. O erro é sanitizado.
4. O estado muda para **ERRO_E1**.
5. O monitoramento é interrompido.
6. Nenhuma nova pesquisa é aberta.
7. O navegador permanece aberto.
8. O dashboard mostra etapa, mensagem e horário.

A mensagem não poderá conter CPF completo, nome, credencial ou conteúdo bruto.

## 14. Histórico no dashboard

A tela apresentará:

- data e hora;
- CPF mascarado;
- classificação;
- resultado CPI;
- status;
- duração;
- existência do PDF;
- ação **Abrir PDF**;
- ação **Abrir pasta**;
- etapa do erro;
- mensagem segura de erro.

A ordenação padrão será do registro mais recente para o mais antigo.

O carregamento inicial será paginado.

Quantidade padrão por página:

```text
50 registros
```

## 15. Limpeza do histórico

A ação **Limpar histórico** exigirá confirmação explícita no dashboard.

Texto da confirmação:

```text
Esta ação excluirá o histórico do dashboard.
Os arquivos PDF não serão excluídos.
```

Após a confirmação:

- todos os registros serão removidos;
- os PDFs permanecerão intactos;
- a lista será atualizada;
- o estado do agente não será alterado.

## 16. Segurança

As seguintes regras são obrigatórias:

- `contextIsolation` habilitado;
- `nodeIntegration` desabilitado no renderer;
- API limitada via `contextBridge`;
- validação de todos os argumentos IPC;
- nenhuma execução arbitrária de shell;
- nenhum SQL recebido do renderer;
- nenhum CPF completo enviado ao renderer;
- nenhum CPF completo gravado em log;
- nenhuma credencial gravada no SQLite;
- nenhum conteúdo de PDF gravado no SQLite;
- caminhos de PDF validados antes da abertura;
- apenas arquivos PDF poderão ser abertos pela ação **Abrir PDF**.

## 17. Componentes previstos

### Processo principal

```text
AgentRuntimeService
BrowserSessionManager
AgentStateStore
ResearchHistoryRepository
ResearchHistoryService
AgentIpcController
HistoryIpcController
PdfIpcController
```

### Preload

```text
agentApi
historyApi
pdfApi
```

### Renderer

```text
AgentControlPanel
AgentStatusCard
AgentCurrentStage
QueueCountdown
AgentErrorPanel
ResearchHistoryTable
ResearchHistoryPagination
ClearHistoryDialog
PdfActionButtons
```

## 18. Integração com o fluxo existente

O fluxo validado não será reescrito.

Serão reutilizados:

- `ContinuousResearchRunner`;
- `SingleResearchCycle`;
- `ContinuousResearchStageError`;
- `CpiQueueMonitor`;
- `SafeResearchLogger`;
- controladores CPI;
- controladores DeskData;
- download e validação de PDF;
- confirmação automática da gravação;
- política E1.

O script de terminal continuará disponível para diagnóstico e operação alternativa.

O dashboard e o script não poderão executar simultaneamente usando o mesmo perfil persistente.

## 19. Estratégia de implementação

A implementação será dividida em etapas pequenas:

1. contratos e tipos;
2. máquina de estados;
3. repositório SQLite;
4. serviço de histórico;
5. gerenciador de navegador;
6. runtime do agente;
7. comandos de pausa e parada;
8. tratamento de login;
9. IPC do Electron;
10. preload seguro;
11. integração com o dashboard;
12. tabela de histórico;
13. abertura de PDF e pasta;
14. limpeza do histórico;
15. testes integrados;
16. validação real controlada.

Cada etapa será concluída somente após seus testes passarem.

## 20. Testes obrigatórios

Serão criados testes para:

- estado inicial **PARADO**;
- bloqueio de execução duplicada;
- início manual;
- pausa durante ociosidade;
- pausa durante ciclo ativo;
- continuação após pausa;
- parada durante ociosidade;
- parada durante ciclo ativo;
- preservação do navegador ao parar;
- reutilização do navegador;
- estado **AGUARDANDO_LOGIN**;
- continuação após login;
- transição para **ERRO_E1**;
- bloqueio da próxima pesquisa após E1;
- persistência do histórico;
- atualização do registro do ciclo;
- paginação;
- limpeza sem exclusão dos PDFs;
- mascaramento do CPF;
- ausência de nome e CPF completo no banco;
- abertura de PDF;
- abertura da pasta;
- arquivo PDF inexistente;
- validação dos canais IPC;
- eventos em tempo real;
- regressão do modo contínuo já validado.

## 21. Fora do escopo

Não fazem parte desta implementação:

- exclusão automática de PDFs;
- exclusão automática do histórico;
- armazenamento de nome completo;
- armazenamento de CPF completo;
- edição manual do histórico;
- sincronização em nuvem;
- operação remota;
- múltiplos agentes simultâneos;
- execução em servidor;
- login automático;
- armazenamento de credenciais;
- alteração da regra de classificação;
- alteração do intervalo de 60 segundos;
- alteração da política E1.

## 22. Critérios de aceite

A implementação será considerada concluída quando:

1. o agente puder ser iniciado pelo dashboard;
2. nenhuma pesquisa iniciar ao abrir o aplicativo;
3. pausa e parada respeitarem o término do ciclo atual;
4. o navegador permanecer aberto após parar;
5. uma execução posterior reutilizar o navegador válido;
6. login expirado gerar **AGUARDANDO_LOGIN**;
7. o histórico sobreviver ao reinício do aplicativo;
8. o banco não armazenar CPF completo nem nome;
9. PDFs puderem ser abertos pelo dashboard;
10. a pasta do PDF puder ser aberta;
11. limpar histórico não remover PDFs;
12. erros E1 impedirem o próximo ciclo;
13. o dashboard receber atualizações em tempo real;
14. todos os testes automatizados passarem;
15. um teste real controlado concluir corretamente.
