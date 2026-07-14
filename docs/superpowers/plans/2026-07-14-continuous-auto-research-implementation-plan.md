# Continuous Automatic Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar pesquisas CPI e DeskData continuamente, sem confirmação manual, monitorando a fila a cada 60 segundos e interrompendo todo o processo no primeiro erro.

**Architecture:** O fluxo será separado em um executor de um único ciclo e um controlador de execução contínua. O monitor da CPI continuará responsável por clicar em `Mostrar Tudo` e aguardar 60 segundos quando não houver pesquisa. Cada ciclo criará controladores novos para impedir duplicidade de consulta, exportação, anexo e gravação.

**Tech Stack:** TypeScript, Node.js, Playwright, Vitest, ESLint, Prettier, pnpm e navegador Chromium persistente.

## Global Constraints

- Sistema operacional: Windows.
- Projeto: `E:\agente-cpi`.
- Gerenciador: pnpm.
- Perfil persistente: `%APPDATA%\AgenteCPI\browser-profile`.
- Diretório permanente de PDFs: `E:\PDF-AGENTE-CPI`.
- Intervalo da fila vazia: exatamente `60_000` milissegundos.
- Encerramento normal: `Ctrl+C`.
- Política de erro: E1, interromper imediatamente e manter o navegador aberto.
- Não registrar CPF completo, nome completo ou conteúdo integral do resultado.
- Não utilizar clipboard.
- Não repetir automaticamente operações que gerem consulta, download, anexo ou gravação.
- A gravação na CPI será automática, sem exigir `GRAVAR`.
- O diálogo esperado da CPI será aceito automaticamente pelo botão `OK`.
- Qualquer diálogo diferente será rejeitado.
- O resultado `Nada Consta` não será utilizado.
- Processo criminal em qualquer polo: `CONSTA_RESTRICAO`.
- Somente processo não criminal: `HA_INFORMACOES`.
- Nenhum processo: `HA_INFORMACOES`.
- Natureza indefinida: classificação interna `INDEFINIDO`, resultado CPI `Há Informações`.

---

## File Map

### Novos arquivos

- `src/automation/flow/single-research-cycle.ts`: executa exatamente uma pesquisa completa.
- `src/automation/flow/continuous-research-runner.ts`: controla monitoramento, repetição, cancelamento e política E1.
- `src/automation/flow/continuous-research-stage.ts`: enumera as etapas seguras para diagnóstico.
- `src/automation/logging/safe-research-logger.ts`: produz logs sem dados pessoais completos.
- `scripts/run-continuous-auto-research.ts`: comando operacional do agente contínuo.
- `tests/unit/automation/flow/single-research-cycle.test.ts`: testes do ciclo individual.
- `tests/unit/automation/flow/continuous-research-runner.test.ts`: testes do laço contínuo.
- `tests/unit/automation/logging/safe-research-logger.test.ts`: testes de sanitização.

### Arquivos modificados

- `src/automation/flow/full-research-preparation-workflow.ts`: continuar responsável apenas por consulta, classificação, PDF e preparação da CPI.
- `src/automation/cpi/cpi-queue-monitor.ts`: preservar o intervalo de 60 segundos e permitir cancelamento por `AbortSignal`.
- `src/automation/cpi/cpi-research-confirmed-save-controller.ts`: confirmar clique único e diálogo único por ciclo.
- `src/automation/deskdata/deskdata-next-search-controller.ts`: preparar DeskData para o ciclo seguinte.
- `scripts/run-full-supervised-research.ts`: permanecer como comando de diagnóstico de ciclo único.
- `package.json`: adicionar comando contínuo.

---

### Task 1: Criar logger seguro

**Files:**

- Create: `src/automation/logging/safe-research-logger.ts`
- Test: `tests/unit/automation/logging/safe-research-logger.test.ts`

**Interfaces:**

- Produces: `SafeResearchLogger`.
- Produces: `maskCpf(rawCpf: string): string`.
- Produces: `sanitizeMessage(message: string): string`.

- [ ] **Step 1: Escrever teste RED para mascaramento de CPF**

```ts
import { describe, expect, it, vi } from 'vitest'
import { SafeResearchLogger } from '@/automation/logging/safe-research-logger'

describe('SafeResearchLogger', () => {
  it('não deve registrar CPF completo', () => {
    const write = vi.fn()
    const logger = new SafeResearchLogger(write)

    logger.info('CPF capturado: 12345678901')

    expect(write).not.toHaveBeenCalledWith(expect.stringContaining('12345678901'))

    expect(write).toHaveBeenCalledWith(expect.stringContaining('***.***.***-01'))
  })
})
```

- [ ] **Step 2: Executar teste e confirmar falha**

Run:

```powershell
pnpm exec vitest run tests/unit/automation/logging/safe-research-logger.test.ts
```

Expected: FAIL porque `safe-research-logger.ts` ainda não existe.

- [ ] **Step 3: Implementar logger mínimo**

```ts
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const RAW_CPF_PATTERN = /\b\d{11}\b/g

export type SafeLogWriter = (message: string) => void

export class SafeResearchLogger {
  constructor(private readonly write: SafeLogWriter = console.log) {}

  info(message: string): void {
    this.write(this.sanitizeMessage(message))
  }

  error(stage: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)

    this.write(this.sanitizeMessage(`[${stage}] ${message}`))
  }

  maskCpf(rawCpf: string): string {
    const digits = rawCpf.replace(/\D/g, '')

    if (digits.length !== 11) {
      return '[CPF_INVALIDO]'
    }

    return `***.***.***-${digits.slice(-2)}`
  }

  sanitizeMessage(message: string): string {
    return message
      .replace(CPF_PATTERN, (cpf) => this.maskCpf(cpf))
      .replace(RAW_CPF_PATTERN, (cpf) => this.maskCpf(cpf))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000)
  }
}
```

- [ ] **Step 4: Executar teste GREEN**

```powershell
pnpm exec vitest run tests/unit/automation/logging/safe-research-logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/automation/logging/safe-research-logger.ts tests/unit/automation/logging/safe-research-logger.test.ts
git commit -m "feat: add safe research logger"
```

---

### Task 2: Criar enumeração de etapas operacionais

**Files:**

- Create: `src/automation/flow/continuous-research-stage.ts`

**Interfaces:**

- Produces: `ContinuousResearchStage`.
- Produces: `ContinuousResearchStageError`.

- [ ] **Step 1: Criar tipos de etapa**

```ts
export type ContinuousResearchStage =
  | 'WAITING_QUEUE'
  | 'OPENING_CPI_RESEARCH'
  | 'READING_CPI_IDENTITY'
  | 'PREPARING_DESKDATA'
  | 'SUBMITTING_DESKDATA'
  | 'WAITING_DESKDATA_RESULT'
  | 'CLASSIFYING_RESULT'
  | 'DOWNLOADING_PDF'
  | 'PREPARING_CPI_RESULT'
  | 'ATTACHING_PDF'
  | 'SAVING_CPI'
  | 'PREPARING_NEXT_SEARCH'
  | 'RETURNING_TO_QUEUE'

export class ContinuousResearchStageError extends Error {
  constructor(
    readonly stage: ContinuousResearchStage,
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause))

    this.name = 'ContinuousResearchStageError'
  }
}
```

- [ ] **Step 2: Executar typecheck**

```powershell
pnpm run typecheck:node
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/automation/flow/continuous-research-stage.ts
git commit -m "feat: define continuous research stages"
```

---

### Task 3: Criar executor de um único ciclo

**Files:**

- Create: `src/automation/flow/single-research-cycle.ts`
- Test: `tests/unit/automation/flow/single-research-cycle.test.ts`

**Interfaces:**

- Consumes: `FullResearchPreparationWorkflow`.
- Consumes: `CpiResearchConfirmedSaveController`.
- Consumes: `DeskDataNextSearchController`.
- Produces: `SingleResearchCycle.run(input): Promise<SingleResearchCycleResult>`.

- [ ] **Step 1: Escrever teste RED de ciclo completo**

O teste deverá confirmar esta ordem exata:

```text
PREPARE_NEXT_DESKDATA
RUN_FULL_PREPARATION
SAVE_CPI
PREPARE_NEXT_DESKDATA
RETURN_TO_CPI_QUEUE
```

O teste também deverá confirmar:

- `saveOnce` chamado exatamente uma vez;
- `attachOnce` chamado exatamente uma vez pelo workflow existente;
- nenhuma confirmação textual solicitada;
- novos controladores utilizados em cada instância de ciclo;
- retorno seguro da classificação e do caminho do PDF.

- [ ] **Step 2: Executar RED**

```powershell
pnpm exec vitest run tests/unit/automation/flow/single-research-cycle.test.ts
```

Expected: FAIL porque `SingleResearchCycle` ainda não existe.

- [ ] **Step 3: Implementar contratos**

```ts
import type { Page } from 'playwright'
import type { ResearchClassification } from '../../domain/research/research-classification'

export interface SingleResearchCycleInput {
  cpiPage: Page
  deskDataPage: Page
  signal?: AbortSignal
}

export interface SingleResearchCycleResult {
  classification: ResearchClassification
  pdfPath: string
  pdfSizeBytes: number
  saved: true
  confirmationAccepted: true
}

export interface SingleResearchCyclePort {
  run(input: SingleResearchCycleInput): Promise<SingleResearchCycleResult>
}
```

- [ ] **Step 4: Implementar ciclo mínimo**

A implementação deverá:

1. verificar `signal.aborted` antes de abrir uma pesquisa;
2. preparar a DeskData para nova consulta;
3. executar `FullResearchPreparationWorkflow`;
4. validar PDF e anexo por meio do resultado do workflow;
5. executar `CpiResearchConfirmedSaveController.saveOnce`;
6. confirmar `saved === true`;
7. preparar a DeskData novamente;
8. retornar à página da fila da CPI;
9. encapsular falhas em `ContinuousResearchStageError`;
10. nunca repetir automaticamente a etapa que falhou.

- [ ] **Step 5: Executar GREEN**

```powershell
pnpm exec vitest run tests/unit/automation/flow/single-research-cycle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Executar testes relacionados**

```powershell
pnpm exec vitest run tests/unit/automation/flow/full-research-preparation-workflow.test.ts tests/unit/automation/cpi/cpi-research-confirmed-save-controller.test.ts tests/unit/automation/deskdata/deskdata-next-search-controller.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/automation/flow/single-research-cycle.ts tests/unit/automation/flow/single-research-cycle.test.ts
git commit -m "feat: add single automatic research cycle"
```

---

### Task 4: Criar controlador contínuo

**Files:**

- Create: `src/automation/flow/continuous-research-runner.ts`
- Test: `tests/unit/automation/flow/continuous-research-runner.test.ts`

**Interfaces:**

- Consumes: `CpiQueueMonitor.waitForResearch`.
- Consumes: fábrica de `SingleResearchCyclePort`.
- Produces: `ContinuousResearchRunner.run(input): Promise<ContinuousResearchRunResult>`.

- [ ] **Step 1: Escrever teste RED para duas pesquisas sequenciais**

O teste deverá simular:

```text
HAS_RESEARCH
→ ciclo 1
→ HAS_RESEARCH
→ ciclo 2
→ Ctrl+C
```

Asserções obrigatórias:

- fábrica de ciclo chamada duas vezes;
- cada ciclo chamado exatamente uma vez;
- nenhuma pesquisa executada em paralelo;
- ciclo 2 iniciado somente depois do término do ciclo 1;
- resultado final `STOPPED_BY_SIGNAL`.

- [ ] **Step 2: Escrever teste RED para fila vazia**

O teste deverá confirmar:

- `refreshQueue()` chamado em toda verificação;
- `Mostrar Tudo` executado pelo monitor;
- espera de exatamente `60_000` ms;
- permanência em estado ocioso;
- retomada quando `HAS_RESEARCH` surgir.

- [ ] **Step 3: Escrever teste RED da política E1**

O teste deverá simular falha no primeiro ciclo e confirmar:

- fábrica de ciclo chamada uma única vez;
- nenhuma segunda pesquisa iniciada;
- erro propagado;
- navegador não fechado pelo runner;
- nenhum retry automático.

- [ ] **Step 4: Executar RED**

```powershell
pnpm exec vitest run tests/unit/automation/flow/continuous-research-runner.test.ts
```

Expected: FAIL porque `ContinuousResearchRunner` ainda não existe.

- [ ] **Step 5: Implementar contratos**

```ts
import type { Page } from 'playwright'
import type { SingleResearchCyclePort } from './single-research-cycle'

export interface ContinuousResearchRunnerInput {
  cpiPage: Page
  deskDataPage: Page
  signal: AbortSignal
  onState?: (state: ContinuousResearchRunnerState) => void
}

export type ContinuousResearchRunnerState =
  | { type: 'WAITING_QUEUE'; checks: number }
  | { type: 'RESEARCH_AVAILABLE'; cycle: number }
  | { type: 'CYCLE_COMPLETED'; cycle: number }
  | { type: 'IDLE'; nextCheckInMs: 60_000 }
  | { type: 'STOPPED'; cycles: number }

export interface ContinuousResearchRunResult {
  status: 'STOPPED_BY_SIGNAL'
  completedCycles: number
}

export type SingleResearchCycleFactory = () => SingleResearchCyclePort
```

- [ ] **Step 6: Implementar loop sequencial**

A implementação deverá usar um único `while (!signal.aborted)`.

Em cada iteração:

1. trazer a CPI para frente;
2. chamar `CpiQueueMonitor.waitForResearch`;
3. se retornar `PAUSED`, finalizar;
4. criar uma nova instância de ciclo;
5. executar o ciclo com `await`;
6. incrementar o contador somente após sucesso;
7. repetir imediatamente.

Não utilizar:

- `Promise.all` entre ciclos;
- timers paralelos;
- retry do ciclo;
- captura que ignore erros.

- [ ] **Step 7: Executar GREEN**

```powershell
pnpm exec vitest run tests/unit/automation/flow/continuous-research-runner.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/automation/flow/continuous-research-runner.ts tests/unit/automation/flow/continuous-research-runner.test.ts
git commit -m "feat: add continuous research runner"
```

---

### Task 5: Validar monitor de 60 segundos

**Files:**

- Modify: `src/automation/cpi/cpi-queue-monitor.ts`
- Test: `tests/unit/automation/cpi/cpi-queue-monitor.test.ts`

**Interfaces:**

- Preserves: `waitForResearch(page, options)`.
- Preserves: intervalo padrão `60_000`.
- Preserves: `AbortSignal`.

- [ ] **Step 1: Adicionar ou atualizar testes**

Os testes deverão confirmar:

- primeira verificação ocorre imediatamente;
- `refreshQueue()` é chamado antes de cada leitura;
- ausência de pesquisa causa espera de `60_000` ms;
- nova verificação chama novamente `refreshQueue()`;
- `AbortSignal` interrompe a espera;
- intervalo menor que `30_000` continua rejeitado.

- [ ] **Step 2: Executar RED ou teste de regressão**

```powershell
pnpm exec vitest run tests/unit/automation/cpi/cpi-queue-monitor.test.ts
```

Expected: PASS quando o comportamento atual já satisfizer a especificação, ou FAIL apenas no requisito ausente.

- [ ] **Step 3: Alterar somente o necessário**

Não modificar os seletores do botão `Mostrar Tudo` quando os testes existentes já estiverem passando.

- [ ] **Step 4: Executar GREEN**

```powershell
pnpm exec vitest run tests/unit/automation/cpi/cpi-queue-monitor.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add src/automation/cpi/cpi-queue-monitor.ts tests/unit/automation/cpi/cpi-queue-monitor.test.ts
git commit -m "test: enforce sixty second queue polling"
```

---

### Task 6: Criar comando operacional contínuo

**Files:**

- Create: `scripts/run-continuous-auto-research.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `PlatformPageManager`.
- Consumes: `ContinuousResearchRunner`.
- Consumes: `SafeResearchLogger`.
- Produces command: `pnpm run flow:run-continuous`.

- [ ] **Step 1: Criar script de inicialização**

O script deverá:

1. abrir o perfil persistente;
2. localizar as abas CPI e DeskData;
3. pedir login manual apenas na inicialização quando necessário;
4. validar a fila autenticada da CPI;
5. validar DeskData autenticada;
6. aplicar filtro 29 uma vez;
7. instalar handler de `SIGINT`;
8. executar `ContinuousResearchRunner`;
9. não pedir `GRAVAR`;
10. não pedir confirmação entre ciclos;
11. manter navegador aberto em caso de erro E1;
12. fechar o navegador somente após encerramento normal e confirmação operacional definida no script.

- [ ] **Step 2: Implementar controle de Ctrl+C**

```ts
const abortController = new AbortController()
let sigintReceived = false

const handleSigint = (): void => {
  if (sigintReceived) {
    return
  }

  sigintReceived = true
  logger.info('Interrupção solicitada. Aguardando ponto seguro.')
  abortController.abort()
}

process.once('SIGINT', handleSigint)
```

- [ ] **Step 3: Adicionar script ao package.json**

```json
"flow:run-continuous": "tsx scripts/run-continuous-auto-research.ts"
```

- [ ] **Step 4: Executar typecheck e lint direcionados**

```powershell
pnpm run typecheck:node
pnpm exec eslint scripts/run-continuous-auto-research.ts src/automation/flow/continuous-research-runner.ts src/automation/flow/single-research-cycle.ts src/automation/logging/safe-research-logger.ts
```

- [ ] **Step 5: Commit**

```powershell
git add scripts/run-continuous-auto-research.ts package.json
git commit -m "feat: add continuous automatic research command"
```

---

### Task 7: Testar gravação automática sem GRAVAR

**Files:**

- Modify: `tests/unit/automation/flow/single-research-cycle.test.ts`
- Verify: `src/automation/cpi/cpi-research-confirmed-save-controller.ts`

- [ ] **Step 1: Adicionar teste de ausência de prompt**

O teste não deverá possuir dependência de `readline`, `stdin` ou `isCpiResearchSaveConfirmed`.

- [ ] **Step 2: Confirmar clique e diálogo únicos**

Asserções:

```ts
expect(saveOnce).toHaveBeenCalledTimes(1)
expect(dialogAccept).toHaveBeenCalledTimes(1)
expect(dialogDismiss).not.toHaveBeenCalled()
```

- [ ] **Step 3: Confirmar bloqueio de diálogo inesperado**

```powershell
pnpm exec vitest run tests/unit/automation/cpi/cpi-research-confirmed-save-controller.test.ts tests/unit/automation/flow/single-research-cycle.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add tests/unit/automation/flow/single-research-cycle.test.ts tests/unit/automation/cpi/cpi-research-confirmed-save-controller.test.ts
git commit -m "test: enforce automatic confirmed saving"
```

---

### Task 8: Testar interrupção E1 e proteção de dados

**Files:**

- Modify: `tests/unit/automation/flow/continuous-research-runner.test.ts`
- Modify: `tests/unit/automation/logging/safe-research-logger.test.ts`

- [ ] **Step 1: Testar falha em cada etapa crítica**

Criar casos parametrizados para:

- envio da DeskData;
- espera do resultado;
- classificação;
- download;
- validação do PDF;
- anexo;
- preparação dos campos;
- clique em Alterar;
- confirmação do diálogo;
- retorno para nova consulta.

Cada caso deverá confirmar que nenhum segundo ciclo foi criado.

- [ ] **Step 2: Testar sanitização de erro**

O teste deverá passar uma mensagem contendo CPF formatado e CPF com 11 dígitos e confirmar ausência dos valores completos.

- [ ] **Step 3: Executar testes**

```powershell
pnpm exec vitest run tests/unit/automation/flow/continuous-research-runner.test.ts tests/unit/automation/logging/safe-research-logger.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add tests/unit/automation/flow/continuous-research-runner.test.ts tests/unit/automation/logging/safe-research-logger.test.ts
git commit -m "test: enforce stop on first error"
```

---

### Task 9: Validação completa sem consumo real

**Files:**

- Verify all files created and modified by Tasks 1-8.

- [ ] **Step 1: Prettier**

```powershell
pnpm exec prettier --write src/automation/flow src/automation/logging scripts/run-continuous-auto-research.ts tests/unit/automation/flow tests/unit/automation/logging package.json
```

- [ ] **Step 2: Testes direcionados**

```powershell
pnpm exec vitest run tests/unit/automation/flow/single-research-cycle.test.ts tests/unit/automation/flow/continuous-research-runner.test.ts tests/unit/automation/logging/safe-research-logger.test.ts tests/unit/automation/cpi/cpi-queue-monitor.test.ts tests/unit/automation/cpi/cpi-research-confirmed-save-controller.test.ts tests/unit/automation/deskdata/deskdata-next-search-controller.test.ts
```

- [ ] **Step 3: Typecheck**

```powershell
pnpm run typecheck:node
```

- [ ] **Step 4: ESLint**

```powershell
pnpm exec eslint src/automation/flow src/automation/logging scripts/run-continuous-auto-research.ts tests/unit/automation/flow tests/unit/automation/logging
```

- [ ] **Step 5: Validação global**

```powershell
pnpm run validate
```

Expected: todos os comandos PASS, nenhuma consulta DeskData enviada e nenhuma pesquisa CPI gravada.

- [ ] **Step 6: Commit**

```powershell
git add .
git commit -m "test: validate continuous automatic workflow"
```

---

### Task 10: Teste real controlado

**Files:**

- Execute: `scripts/run-continuous-auto-research.ts`.

- [ ] **Step 1: Confirmar pré-condições**

- sessão CPI autenticada;
- sessão DeskData autenticada;
- pelo menos uma pesquisa de teste disponível;
- diretório `E:\PDF-AGENTE-CPI` acessível;
- nenhuma outra instância do agente em execução.

- [ ] **Step 2: Executar agente contínuo**

```powershell
pnpm run flow:run-continuous
```

- [ ] **Step 3: Verificar primeiro ciclo**

- exatamente uma consulta DeskData;
- exatamente um PDF;
- PDF válido;
- classificação correta;
- anexo confirmado;
- campos CPI corretos;
- clique automático em Alterar;
- clique automático em OK;
- pesquisa removida da fila;
- DeskData retornada para Consultar pessoas.

- [ ] **Step 4: Verificar sequência**

Quando houver uma segunda pesquisa, confirmar que ela começa somente após o encerramento completo da primeira.

- [ ] **Step 5: Verificar ociosidade**

Quando a fila ficar vazia:

- o agente não encerra;
- o terminal informa estado ocioso;
- após 60 segundos ocorre novo clique em Mostrar Tudo.

- [ ] **Step 6: Verificar Ctrl+C**

Pressionar `Ctrl+C` enquanto o agente estiver ocioso e confirmar encerramento seguro sem iniciar nova pesquisa.

- [ ] **Step 7: Registrar resultado**

Não registrar CPF ou nome. Registrar apenas:

- quantidade de ciclos concluídos;
- classificações;
- caminhos técnicos dos PDFs;
- resultado da interrupção.

---

## Final Acceptance Checklist

- [ ] Não existe prompt `GRAVAR` no comando contínuo.
- [ ] O agente salva automaticamente na CPI.
- [ ] O alerta esperado é confirmado automaticamente.
- [ ] As pesquisas são executadas estritamente em sequência.
- [ ] A fila vazia é consultada a cada 60 segundos.
- [ ] Cada verificação clica em `Mostrar Tudo`.
- [ ] O agente permanece ocioso quando a fila está vazia.
- [ ] O agente retoma automaticamente quando surge pesquisa.
- [ ] Qualquer erro interrompe o processo inteiro.
- [ ] Nenhuma etapa crítica possui retry automático.
- [ ] Ctrl+C impede o início de um novo ciclo.
- [ ] CPF completo nunca aparece nos logs.
- [ ] `pnpm run validate` passa integralmente.
