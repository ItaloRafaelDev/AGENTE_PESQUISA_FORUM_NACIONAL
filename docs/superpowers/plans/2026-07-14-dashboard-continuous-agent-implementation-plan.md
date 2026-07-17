# Dashboard do agente contínuo — Plano de implementação

> **Execução:** aplicar este plano tarefa por tarefa, com TDD e validação após cada entrega. Não usar Git nesta fase.

**Objetivo:** integrar o fluxo automático contínuo já validado ao dashboard Electron, com controle de início, pausa, continuação, parada segura, login manual controlado, histórico persistente em SQLite e abertura segura dos PDFs.

**Arquitetura:** o renderer React será uma interface sem acesso direto a Node.js. O preload exporá contratos IPC estritamente tipados. O processo principal do Electron controlará Playwright, o runner contínuo, o estado público do agente, SQLite, histórico e ações de PDF. O fluxo `ContinuousResearchRunner`/`SingleResearchCycle` continuará sendo a fonte de verdade da execução.

**Stack:** Electron 39, electron-vite 5, React 19, TypeScript 5.9, Playwright 1.61, better-sqlite3 12, Zod 4, Vitest 4 e Testing Library.

## Restrições globais

- O agente inicia sempre em `PARADO`.
- Nenhuma pesquisa começa ao abrir o aplicativo.
- Uma única pesquisa pode ser processada por vez.
- O botão **Pausar** conclui o ciclo atual e pausa antes do próximo.
- O botão **Parar** conclui o ciclo atual, para o agente e mantém o navegador aberto.
- O navegador existente deve ser reutilizado quando estiver válido.
- Login expirado gera `AGUARDANDO_LOGIN`, não `ERRO_E1`.
- Erro operacional gera `ERRO_E1` e impede a próxima pesquisa.
- O banco não pode armazenar nome ou CPF completo.
- O renderer não pode receber nome ou CPF completo.
- O histórico persiste indefinidamente.
- Limpar histórico não remove PDFs.
- Apenas arquivos `.pdf` existentes podem ser abertos.
- O script `pnpm run flow:run-continuous` deve continuar funcional.
- Não executar pesquisa real antes da tarefa final de validação controlada.
- Não usar Git nesta fase.

---

## Estrutura de arquivos prevista

### Criar

```text
src/shared/types/agent-runtime-api.ts
src/shared/types/history-api.ts
src/shared/types/pdf-api.ts

src/automation/workflow/agent-public-state-store.ts

src/infrastructure/database/research-history-repository.ts
src/automation/history/research-history-service.ts

src/main/services/pdf-file-service.ts
src/main/ipc/register-history-ipc-handlers.ts
src/main/ipc/register-pdf-ipc-handlers.ts

src/renderer/src/components/agent/AgentControlPanel.tsx
src/renderer/src/components/agent/AgentStatusCard.tsx
src/renderer/src/components/agent/QueueCountdown.tsx
src/renderer/src/components/agent/AgentErrorPanel.tsx
src/renderer/src/components/history/ResearchHistoryTable.tsx
src/renderer/src/components/history/ResearchHistoryPagination.tsx
src/renderer/src/components/history/ClearHistoryDialog.tsx
src/renderer/src/components/history/PdfActionButtons.tsx

tests/unit/automation/workflow/agent-public-state-store.test.ts
tests/unit/infrastructure/database/research-history-repository.test.ts
tests/unit/automation/history/research-history-service.test.ts
tests/unit/main/services/pdf-file-service.test.ts
tests/unit/main/ipc/register-history-ipc-handlers.test.ts
tests/unit/main/ipc/register-pdf-ipc-handlers.test.ts
tests/unit/preload/agent-preload-api.test.ts
tests/unit/renderer/agent-control-panel.test.tsx
tests/unit/renderer/research-history-table.test.tsx
tests/unit/renderer/pdf-action-buttons.test.tsx
tests/integration/dashboard-continuous-agent.test.ts
```

### Modificar

```text
src/shared/types/agent-api.ts
src/shared/types/agent-control-api.ts

src/automation/browser/browser-workspace-service.ts
src/automation/flow/single-research-cycle.ts
src/automation/flow/continuous-research-runner.ts
src/automation/workflow/agent-runtime-service.ts

src/main/index.ts
src/main/ipc/register-agent-ipc-handlers.ts

src/preload/index.ts
src/preload/index.d.ts

src/renderer/src/components/AgentDashboard.tsx
src/renderer/src/assets/main.css

tests/unit/automation/browser/browser-workspace-service.test.ts
tests/unit/automation/flow/single-research-cycle.test.ts
tests/unit/automation/flow/continuous-research-runner.test.ts
tests/unit/automation/workflow/agent-runtime-service.test.ts
tests/unit/main/ipc/register-agent-ipc-handlers.test.ts
tests/unit/renderer/agent-dashboard.test.tsx
```

---

### Task 1: Contratos públicos do agente, histórico e PDF

**Arquivos:**

- Criar: `src/shared/types/agent-runtime-api.ts`
- Criar: `src/shared/types/history-api.ts`
- Criar: `src/shared/types/pdf-api.ts`
- Modificar: `src/shared/types/agent-control-api.ts`
- Modificar: `src/shared/types/agent-api.ts`
- Testar: `tests/unit/shared/types/dashboard-agent-contracts.test.ts`

**Produz:**

- `AgentPublicState`
- `ResearchHistoryRecord`
- `ResearchHistoryPage`
- `PdfActionResult`
- canais IPC e APIs tipadas

- [ ] **Passo 1: escrever o teste de contrato**

```ts
import { describe, expect, it } from 'vitest'
import {
  AGENT_PUBLIC_STATUSES,
  AGENT_QUEUE_STATUSES,
  AGENT_RUNTIME_IPC_CHANNELS
} from '@/shared/types/agent-runtime-api'
import { HISTORY_IPC_CHANNELS } from '@/shared/types/history-api'
import { PDF_IPC_CHANNELS } from '@/shared/types/pdf-api'

describe('contratos do dashboard contínuo', () => {
  it('deve expor somente os estados públicos aprovados', () => {
    expect(AGENT_PUBLIC_STATUSES).toEqual([
      'PARADO',
      'INICIANDO',
      'AGUARDANDO_LOGIN',
      'EXECUTANDO',
      'PAUSANDO',
      'PAUSADO',
      'PARANDO',
      'OCIOSO',
      'ERRO_E1'
    ])

    expect(AGENT_QUEUE_STATUSES).toEqual(['DESCONHECIDA', 'COM_PESQUISA', 'VAZIA'])
  })

  it('deve definir canais fixos sem comando arbitrário', () => {
    expect(AGENT_RUNTIME_IPC_CHANNELS.loginCompleted).toBe('agent:login-completed')
    expect(AGENT_RUNTIME_IPC_CHANNELS.stateChanged).toBe('agent:state-changed')
    expect(HISTORY_IPC_CHANNELS.list).toBe('history:list')
    expect(HISTORY_IPC_CHANNELS.clear).toBe('history:clear')
    expect(PDF_IPC_CHANNELS.open).toBe('pdf:open')
    expect(PDF_IPC_CHANNELS.reveal).toBe('pdf:reveal')
  })
})
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/shared/types/dashboard-agent-contracts.test.ts
```

Resultado esperado: falha por módulos ainda inexistentes.

- [ ] **Passo 3: criar `agent-runtime-api.ts`**

```ts
import type { ContinuousResearchStage } from '../../automation/flow/continuous-research-stage'

export const AGENT_PUBLIC_STATUSES = [
  'PARADO',
  'INICIANDO',
  'AGUARDANDO_LOGIN',
  'EXECUTANDO',
  'PAUSANDO',
  'PAUSADO',
  'PARANDO',
  'OCIOSO',
  'ERRO_E1'
] as const

export type AgentPublicStatus = (typeof AGENT_PUBLIC_STATUSES)[number]

export const AGENT_QUEUE_STATUSES = ['DESCONHECIDA', 'COM_PESQUISA', 'VAZIA'] as const

export type AgentQueueStatus = (typeof AGENT_QUEUE_STATUSES)[number]

export interface AgentPublicError {
  stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  message: string
  occurredAt: string
}

export interface AgentPublicState {
  status: AgentPublicStatus
  currentStage: ContinuousResearchStage | 'WAITING_QUEUE' | null
  completedCycles: number
  queueStatus: AgentQueueStatus
  nextCheckAt: string | null
  remainingSeconds: number | null
  currentMaskedCpf: string | null
  lastError: AgentPublicError | null
}

export const AGENT_RUNTIME_IPC_CHANNELS = {
  getState: 'agent:get-state',
  start: 'agent:start',
  pause: 'agent:pause',
  resume: 'agent:resume',
  stop: 'agent:stop',
  loginCompleted: 'agent:login-completed',
  stateChanged: 'agent:state-changed'
} as const

export interface AgentRuntimeApi {
  getState(): Promise<AgentPublicState>
  start(): Promise<AgentPublicState>
  pause(): Promise<AgentPublicState>
  resume(): Promise<AgentPublicState>
  stop(): Promise<AgentPublicState>
  loginCompleted(): Promise<AgentPublicState>
  onStateChanged(listener: (state: AgentPublicState) => void): () => void
}
```

- [ ] **Passo 4: criar `history-api.ts`**

```ts
import type { ResearchClassification } from '../../domain/research/research-classification'

export const RESEARCH_HISTORY_STATUSES = [
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'ERRO_E1',
  'INTERROMPIDO'
] as const

export type ResearchHistoryStatus = (typeof RESEARCH_HISTORY_STATUSES)[number]

export interface ResearchHistoryRecord {
  id: string
  maskedCpf: string
  classification: ResearchClassification | null
  cpiResult: string | null
  status: ResearchHistoryStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  pdfPath: string | null
  errorStage: string | null
  errorMessage: string | null
  createdAt: string
}

export interface ResearchHistoryListInput {
  page: number
  pageSize: number
}

export interface ResearchHistoryPage {
  items: ResearchHistoryRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const HISTORY_IPC_CHANNELS = {
  list: 'history:list',
  clear: 'history:clear',
  recordCreated: 'history:record-created',
  recordUpdated: 'history:record-updated',
  cleared: 'history:cleared'
} as const

export interface HistoryApi {
  list(input: ResearchHistoryListInput): Promise<ResearchHistoryPage>
  clear(): Promise<void>
  onRecordCreated(listener: (record: ResearchHistoryRecord) => void): () => void
  onRecordUpdated(listener: (record: ResearchHistoryRecord) => void): () => void
  onCleared(listener: () => void): () => void
}
```

- [ ] **Passo 5: criar `pdf-api.ts`**

```ts
export type PdfActionStatus = 'OPENED' | 'REVEALED' | 'NOT_FOUND'

export interface PdfActionResult {
  status: PdfActionStatus
}

export const PDF_IPC_CHANNELS = {
  open: 'pdf:open',
  reveal: 'pdf:reveal'
} as const

export interface PdfApi {
  open(path: string): Promise<PdfActionResult>
  reveal(path: string): Promise<PdfActionResult>
}
```

- [ ] **Passo 6: atualizar `agent-control-api.ts`**

Substituir o contrato antigo por uma reexportação compatível:

```ts
export { AGENT_RUNTIME_IPC_CHANNELS as AGENT_IPC_CHANNELS } from './agent-runtime-api'

export type {
  AgentPublicState as AgentControlSnapshot,
  AgentRuntimeApi as AgentControlApi
} from './agent-runtime-api'
```

- [ ] **Passo 7: atualizar `agent-api.ts`**

```ts
import type { AgentRuntimeApi } from './agent-runtime-api'
import type { BrowserApi } from './browser-api'
import type { HistoryApi } from './history-api'
import type { PdfApi } from './pdf-api'
import type { SessionApi } from './session-api'

export interface AgentApi {
  browser: BrowserApi
  control: AgentRuntimeApi
  sessions: SessionApi
  history: HistoryApi
  pdf: PdfApi
}
```

- [ ] **Passo 8: validar**

```powershell
pnpm exec vitest run tests/unit/shared/types/dashboard-agent-contracts.test.ts
pnpm run typecheck
```

Resultado esperado: testes e typecheck aprovados após os consumidores antigos serem ajustados nas tarefas seguintes. Durante esta tarefa, erros de consumidores legados são aceitáveis; o teste direcionado deve passar.

---

### Task 2: Estado público observável do agente

**Arquivos:**

- Criar: `src/automation/workflow/agent-public-state-store.ts`
- Criar: `tests/unit/automation/workflow/agent-public-state-store.test.ts`

**Produz:**

- `AgentPublicStateStore`
- `getSnapshot()`
- `patch()`
- `subscribe()`

- [ ] **Passo 1: escrever os testes**

```ts
import { describe, expect, it, vi } from 'vitest'
import { AgentPublicStateStore } from '@/automation/workflow/agent-public-state-store'

describe('AgentPublicStateStore', () => {
  it('deve iniciar parado e sem dados pessoais', () => {
    const store = new AgentPublicStateStore()

    expect(store.getSnapshot()).toEqual({
      status: 'PARADO',
      currentStage: null,
      completedCycles: 0,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  })

  it('deve emitir cópia imutável após alteração', () => {
    const store = new AgentPublicStateStore()
    const listener = vi.fn()

    const unsubscribe = store.subscribe(listener)

    store.patch({
      status: 'OCIOSO',
      queueStatus: 'VAZIA',
      remainingSeconds: 60
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OCIOSO',
        queueStatus: 'VAZIA',
        remainingSeconds: 60
      })
    )

    unsubscribe()

    store.patch({ status: 'PAUSADO' })

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('deve rejeitar CPF não mascarado', () => {
    const store = new AgentPublicStateStore()

    expect(() =>
      store.patch({
        currentMaskedCpf: '12345678901'
      })
    ).toThrow('CPF público precisa estar mascarado')
  })
})
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/workflow/agent-public-state-store.test.ts
```

- [ ] **Passo 3: implementar**

```ts
import type { AgentPublicState, AgentPublicStatus } from '../../shared/types/agent-runtime-api'

type AgentStateListener = (state: AgentPublicState) => void

const INITIAL_STATE: AgentPublicState = {
  status: 'PARADO',
  currentStage: null,
  completedCycles: 0,
  queueStatus: 'DESCONHECIDA',
  nextCheckAt: null,
  remainingSeconds: null,
  currentMaskedCpf: null,
  lastError: null
}

export class AgentPublicStateStore {
  private state: AgentPublicState = { ...INITIAL_STATE }
  private readonly listeners = new Set<AgentStateListener>()

  getSnapshot(): AgentPublicState {
    return {
      ...this.state,
      lastError: this.state.lastError ? { ...this.state.lastError } : null
    }
  }

  getStatus(): AgentPublicStatus {
    return this.state.status
  }

  patch(patch: Partial<AgentPublicState>): AgentPublicState {
    if (
      patch.currentMaskedCpf !== undefined &&
      patch.currentMaskedCpf !== null &&
      !/^\*{3}\.\*{3}\.\*{3}-\d{2}$/.test(patch.currentMaskedCpf)
    ) {
      throw new Error('CPF público precisa estar mascarado')
    }

    this.state = {
      ...this.state,
      ...patch
    }

    const snapshot = this.getSnapshot()

    this.listeners.forEach((listener) => {
      listener(snapshot)
    })

    return snapshot
  }

  resetForStart(): AgentPublicState {
    return this.patch({
      status: 'INICIANDO',
      currentStage: null,
      queueStatus: 'DESCONHECIDA',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  }

  subscribe(listener: AgentStateListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}
```

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/automation/workflow/agent-public-state-store.test.ts
```

---

### Task 3: Repositório SQLite do histórico

**Arquivos:**

- Criar: `src/infrastructure/database/research-history-repository.ts`
- Criar: `tests/unit/infrastructure/database/research-history-repository.test.ts`

**Interfaces:**

```ts
export interface CreateResearchHistoryInput {
  id: string
  maskedCpf: string
  status: ResearchHistoryStatus
  startedAt: string
  createdAt: string
}

export interface CompleteResearchHistoryInput {
  id: string
  maskedCpf: string
  classification: ResearchClassification
  cpiResult: string
  finishedAt: string
  durationMs: number
  pdfPath: string
}

export interface FailResearchHistoryInput {
  id: string
  maskedCpf: string
  finishedAt: string
  durationMs: number
  errorStage: string
  errorMessage: string
}
```

- [ ] **Passo 1: escrever testes com banco em memória**

Cobrir:

```ts
it('deve criar a tabela sem colunas de nome ou CPF completo')
it('deve inserir e atualizar o mesmo registro')
it('deve listar do mais recente para o mais antigo')
it('deve paginar com 50 registros por padrão')
it('deve limpar somente os registros')
it('deve marcar registros EM_ANDAMENTO como INTERROMPIDO na inicialização')
```

A asserção estrutural obrigatória:

```ts
const columns = repository.listColumnNames()

expect(columns).not.toContain('name')
expect(columns).not.toContain('full_name')
expect(columns).not.toContain('cpf')
expect(columns).not.toContain('full_cpf')
expect(columns).toContain('masked_cpf')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/infrastructure/database/research-history-repository.test.ts
```

- [ ] **Passo 3: implementar o schema**

```sql
CREATE TABLE IF NOT EXISTS research_history (
  id TEXT PRIMARY KEY,
  masked_cpf TEXT NOT NULL,
  classification TEXT,
  cpi_result TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  pdf_path TEXT,
  error_stage TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_history_started_at
ON research_history(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_history_status
ON research_history(status);

CREATE INDEX IF NOT EXISTS idx_research_history_classification
ON research_history(classification);
```

- [ ] **Passo 4: implementar a classe**

A classe deve:

```ts
export class ResearchHistoryRepository {
  constructor(private readonly database: Database.Database) {
    this.migrate()
  }

  static open(filePath: string): ResearchHistoryRepository
  static inMemory(): ResearchHistoryRepository

  create(input: CreateResearchHistoryInput): ResearchHistoryRecord
  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
  complete(input: CompleteResearchHistoryInput): ResearchHistoryRecord
  fail(input: FailResearchHistoryInput): ResearchHistoryRecord
  list(input: ResearchHistoryListInput): ResearchHistoryPage
  clear(): void
  markUnfinishedAsInterrupted(finishedAt: string): number
  close(): void
}
```

Regras obrigatórias:

```ts
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 50
const UNKNOWN_MASKED_CPF = '***.***.***-00'
```

A consulta de paginação deve usar parâmetros preparados:

```sql
SELECT *
FROM research_history
ORDER BY started_at DESC
LIMIT ? OFFSET ?
```

- [ ] **Passo 5: validar**

```powershell
pnpm exec vitest run tests/unit/infrastructure/database/research-history-repository.test.ts
pnpm exec eslint src/infrastructure/database/research-history-repository.ts tests/unit/infrastructure/database/research-history-repository.test.ts
```

---

### Task 4: Serviço de histórico e eventos

**Arquivos:**

- Criar: `src/automation/history/research-history-service.ts`
- Criar: `tests/unit/automation/history/research-history-service.test.ts`

**Produz:**

```ts
beginCycle(startedAt?: Date): ResearchHistoryRecord
setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
completeCycle(id: string, result: SingleResearchCycleResult, finishedAt?: Date): ResearchHistoryRecord
failCycle(id: string, stage: string, error: unknown, finishedAt?: Date): ResearchHistoryRecord
list(input: ResearchHistoryListInput): ResearchHistoryPage
clear(): void
subscribe(listener: ResearchHistoryEventListener): () => void
```

- [ ] **Passo 1: escrever testes**

Cobrir:

```ts
it('deve criar um único registro e atualizá-lo ao concluir')
it('deve mapear classificação para o rótulo CPI')
it('deve sanitizar erro antes de persistir')
it('deve emitir CREATED, UPDATED e CLEARED')
it('não deve persistir CPF completo presente em mensagem de erro')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/history/research-history-service.test.ts
```

- [ ] **Passo 3: implementar**

Usar:

```ts
import { randomUUID } from 'node:crypto'
import { mapResearchClassificationToCpiResult } from '../cpi/cpi-research-result-mapper'
import { SafeResearchLogger } from '../logging/safe-research-logger'
```

Contrato de evento:

```ts
export type ResearchHistoryEvent =
  | { type: 'CREATED'; record: ResearchHistoryRecord }
  | { type: 'UPDATED'; record: ResearchHistoryRecord }
  | { type: 'CLEARED' }
```

A mensagem de erro deve passar por:

```ts
const safeMessage = this.logger.sanitizeMessage(
  error instanceof Error ? error.message : String(error)
)
```

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/automation/history/research-history-service.test.ts
```

---

### Task 5: Reutilização segura do navegador

**Arquivos:**

- Modificar: `src/automation/browser/browser-workspace-service.ts`
- Modificar: `tests/unit/automation/browser/browser-workspace-service.test.ts`

**Produz:**

```ts
ensureStarted(): Promise<BrowserManagerSnapshot>
getContext(): ManagedBrowserContext
```

- [ ] **Passo 1: adicionar testes**

```ts
it('deve reutilizar o navegador já aberto sem lançar uma segunda instância')
it('deve preparar novamente as páginas ao reutilizar')
it('deve iniciar um novo navegador quando estiver parado')
```

Teste principal:

```ts
await service.ensureStarted()
await service.ensureStarted()

expect(browserManager.startCalls).toBe(1)
expect(pageManager.calls).toBe(2)
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/browser/browser-workspace-service.test.ts
```

- [ ] **Passo 3: implementar**

```ts
async ensureStarted(): Promise<BrowserManagerSnapshot> {
  const current = this.browserManager.getSnapshot()

  const snapshot =
    current.state === 'RUNNING'
      ? current
      : await this.browserManager.start()

  try {
    await this.pageManager.ensurePages(
      this.browserManager.getContext()
    )

    return snapshot
  } catch (error) {
    if (current.state !== 'RUNNING') {
      await this.browserManager.stop().catch(() => undefined)
    }

    throw error
  }
}

getContext(): ManagedBrowserContext {
  return this.browserManager.getContext()
}
```

Manter `start()` como alias de `ensureStarted()` para compatibilidade:

```ts
async start(): Promise<BrowserManagerSnapshot> {
  return this.ensureStarted()
}
```

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/automation/browser/browser-workspace-service.test.ts
```

---

### Task 6: Eventos de etapa e identidade no ciclo único

**Arquivos:**

- Modificar: `src/automation/flow/single-research-cycle.ts`
- Modificar: `tests/unit/automation/flow/single-research-cycle.test.ts`

**Produz:**

```ts
export interface SingleResearchCycleHooks {
  onStage?(stage: ContinuousResearchStage): void
  onIdentity?(maskedCpf: string): void
}
```

Adicionar ao input:

```ts
hooks?: SingleResearchCycleHooks
```

- [ ] **Passo 1: escrever testes**

```ts
it('deve informar cada etapa antes de executá-la')
it('deve informar somente o CPF mascarado após ler a identidade')
it('não deve informar CPF completo')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/flow/single-research-cycle.test.ts
```

- [ ] **Passo 3: instrumentar `runStage`**

```ts
private async runStage<T>(
  stage: ContinuousResearchStage,
  operation: () => Promise<T>,
  hooks?: SingleResearchCycleHooks
): Promise<T> {
  hooks?.onStage?.(stage)

  try {
    return await operation()
  } catch (error: unknown) {
    if (error instanceof ContinuousResearchStageError) {
      throw error
    }

    throw new ContinuousResearchStageError(stage, error)
  }
}
```

Após a leitura da identidade:

```ts
const identity = await this.runStage(
  'READING_CPI_IDENTITY',
  () => this.dependencies.identityReader.read(input.cpiPage),
  input.hooks
)

input.hooks?.onIdentity?.(identity.maskedCpf)
```

Todos os `runStage` devem receber `input.hooks`.

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/automation/flow/single-research-cycle.test.ts
```

---

### Task 7: Parada na fronteira entre ciclos no runner contínuo

**Arquivos:**

- Modificar: `src/automation/flow/continuous-research-runner.ts`
- Modificar: `tests/unit/automation/flow/continuous-research-runner.test.ts`

**Produz:**

Adicionar ao input:

```ts
shouldStopBeforeNextCycle?: () => boolean
onCycleStage?: (
  cycle: number,
  stage: ContinuousResearchStage
) => void
onCycleIdentity?: (
  cycle: number,
  maskedCpf: string
) => void
```

Alterar o estado concluído:

```ts
{
  type: 'CYCLE_COMPLETED'
  cycle: number
  result: SingleResearchCycleResult
}
```

- [ ] **Passo 1: escrever testes**

```ts
it('deve concluir o ciclo atual e parar antes do próximo quando solicitado')
it('deve encaminhar etapas e CPF mascarado do ciclo')
it('deve incluir o resultado completo em CYCLE_COMPLETED')
it('não deve iniciar outro monitor após solicitação de parada')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/flow/continuous-research-runner.test.ts
```

- [ ] **Passo 3: implementar a fronteira segura**

No início do `while`:

```ts
if (input.shouldStopBeforeNextCycle?.()) {
  break
}
```

Ao criar o ciclo:

```ts
const result = await cycle.run({
  context: input.context,
  cpiPage: input.cpiPage,
  deskDataPage: input.deskDataPage,
  signal: input.signal,
  hooks: {
    onStage: (stage) => {
      input.onCycleStage?.(cycleNumber, stage)
    },
    onIdentity: (maskedCpf) => {
      input.onCycleIdentity?.(cycleNumber, maskedCpf)
    }
  }
})
```

Emitir:

```ts
input.onState?.({
  type: 'CYCLE_COMPLETED',
  cycle: completedCycles,
  result
})
```

Após o evento concluído:

```ts
if (input.shouldStopBeforeNextCycle?.()) {
  break
}
```

- [ ] **Passo 4: regressão completa do runner**

```powershell
pnpm exec vitest run `
  tests/unit/automation/flow/continuous-research-runner.test.ts `
  tests/unit/automation/flow/continuous-safety-guard.test.ts `
  tests/unit/automation/flow/automatic-save-guard.test.ts
```

---

### Task 8: Runtime real do dashboard

**Arquivos:**

- Modificar: `src/automation/workflow/agent-runtime-service.ts`
- Modificar: `tests/unit/automation/workflow/agent-runtime-service.test.ts`

**Dependências:**

```ts
AgentPublicStateStore
BrowserWorkspaceService
PlatformSessionService
CpiQueueFilterController
ContinuousResearchRunner
ResearchHistoryService
SafeResearchLogger
```

**Produz:**

```ts
start(): Promise<AgentPublicState>
pause(): Promise<AgentPublicState>
resume(): Promise<AgentPublicState>
stop(): Promise<AgentPublicState>
loginCompleted(): Promise<AgentPublicState>
shutdown(): Promise<void>
getSnapshot(): AgentPublicState
subscribe(listener): () => void
```

- [ ] **Passo 1: substituir os testes legados por testes do comportamento aprovado**

Cobrir obrigatoriamente:

```ts
it('deve iniciar parado')
it('deve abrir ou reutilizar o navegador ao iniciar')
it('deve entrar em AGUARDANDO_LOGIN sem gerar E1')
it('deve continuar após login confirmado')
it('deve bloquear duas execuções simultâneas')
it('deve refletir OCIOSO e a próxima verificação')
it('deve refletir EXECUTANDO e a etapa atual')
it('deve concluir o ciclo antes de pausar')
it('deve pausar imediatamente quando estiver ocioso')
it('deve concluir o ciclo antes de parar')
it('deve manter o navegador aberto após parar')
it('deve reutilizar o navegador ao iniciar novamente')
it('deve persistir o resultado do ciclo')
it('deve entrar em ERRO_E1 e bloquear o próximo ciclo')
it('deve sanitizar o erro e o CPF')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/automation/workflow/agent-runtime-service.test.ts
```

- [ ] **Passo 3: definir portas do serviço**

```ts
export interface AgentRuntimeBrowser {
  ensureStarted(): Promise<BrowserManagerSnapshot>
  getSnapshot(): BrowserManagerSnapshot
  getContext(): BrowserContext
}

export interface AgentRuntimeSessions {
  getSnapshot(): Promise<PlatformSessionsSnapshot>
}

export interface AgentRuntimeFilter {
  applyCriminalForumFilter(page: Page): Promise<void>
}

export interface AgentRuntimeRunner {
  run(input: ContinuousResearchRunnerInput): Promise<ContinuousResearchRunResult>
}

export interface AgentRuntimeHistory {
  beginCycle(startedAt?: Date): ResearchHistoryRecord
  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord
  completeCycle(
    id: string,
    result: SingleResearchCycleResult,
    finishedAt?: Date
  ): ResearchHistoryRecord
  failCycle(id: string, stage: string, error: unknown, finishedAt?: Date): ResearchHistoryRecord
}
```

- [ ] **Passo 4: controlar a solicitação pendente**

```ts
type RequestedExit = 'NONE' | 'PAUSE' | 'STOP'

private requestedExit: RequestedExit = 'NONE'
private runnerPromise: Promise<void> | null = null
private abortController: AbortController | null = null
private cycleActive = false
private currentHistoryId: string | null = null
```

- [ ] **Passo 5: implementar o início**

Fluxo obrigatório:

```ts
this.assertCanStart()
this.stateStore.resetForStart()
await this.browser.ensureStarted()

const sessions = await this.sessions.getSnapshot()

if (!sessions.allAuthenticated) {
  return this.stateStore.patch({
    status: 'AGUARDANDO_LOGIN'
  })
}

await this.startRunner()
return this.getSnapshot()
```

`startRunner()` deve:

1. localizar CPI e DeskData;
2. aplicar filtro 29;
3. criar `AbortController`;
4. mudar para `OCIOSO`;
5. iniciar `ContinuousResearchRunner` sem bloquear o retorno de `start`;
6. capturar rejeição e aplicar E1;
7. finalizar em `PAUSADO` ou `PARADO` conforme `requestedExit`.

- [ ] **Passo 6: mapear estados do runner**

```ts
case 'WAITING_QUEUE':
  stateStore.patch({
    status: 'OCIOSO',
    currentStage: 'WAITING_QUEUE',
    queueStatus: 'DESCONHECIDA'
  })
  break

case 'IDLE':
  stateStore.patch({
    status: 'OCIOSO',
    currentStage: 'WAITING_QUEUE',
    queueStatus: 'VAZIA',
    nextCheckAt: new Date(
      clock.now().getTime() + state.nextCheckInMs
    ).toISOString(),
    remainingSeconds: state.nextCheckInMs / 1000
  })
  break

case 'RESEARCH_AVAILABLE':
  currentHistoryId = history.beginCycle(clock.now()).id
  cycleActive = true
  stateStore.patch({
    status: 'EXECUTANDO',
    queueStatus: 'COM_PESQUISA',
    nextCheckAt: null,
    remainingSeconds: null
  })
  break

case 'CYCLE_COMPLETED':
  history.completeCycle(
    requiredCurrentHistoryId(),
    state.result,
    clock.now()
  )
  currentHistoryId = null
  cycleActive = false
  stateStore.patch({
    completedCycles: state.cycle,
    currentMaskedCpf: null
  })
  break
```

- [ ] **Passo 7: implementar pausa e parada P1/S2**

Pausa durante ciclo:

```ts
this.requestedExit = 'PAUSE'
this.stateStore.patch({ status: 'PAUSANDO' })
await this.runnerPromise
return this.getSnapshot()
```

Pausa ociosa:

```ts
this.requestedExit = 'PAUSE'
this.stateStore.patch({ status: 'PAUSANDO' })
this.abortController?.abort()
await this.runnerPromise
return this.getSnapshot()
```

Parada usa o mesmo padrão com `STOP` e `PARANDO`.

O finalizador deve aplicar:

```ts
const finalStatus = this.requestedExit === 'PAUSE' ? 'PAUSADO' : 'PARADO'
```

O serviço não pode chamar `browser.stop()` em `stop()`.

- [ ] **Passo 8: implementar login controlado**

```ts
async loginCompleted(): Promise<AgentPublicState> {
  if (this.stateStore.getStatus() !== 'AGUARDANDO_LOGIN') {
    throw new Error(
      'O agente não está aguardando confirmação de login'
    )
  }

  const sessions = await this.sessions.getSnapshot()

  if (!sessions.allAuthenticated) {
    throw new Error(
      'CPI Central e DeskData ainda não estão autenticadas'
    )
  }

  await this.startRunner()

  return this.getSnapshot()
}
```

- [ ] **Passo 9: aplicar E1**

```ts
private handleRunnerError(error: unknown): void {
  const stage =
    error instanceof ContinuousResearchStageError
      ? error.stage
      : 'CONTINUOUS_RUNNER'

  if (this.currentHistoryId) {
    this.history.failCycle(
      this.currentHistoryId,
      stage,
      error,
      this.clock.now()
    )
  }

  this.stateStore.patch({
    status: 'ERRO_E1',
    currentStage: stage,
    nextCheckAt: null,
    remainingSeconds: null,
    lastError: {
      stage,
      message: this.logger.sanitizeMessage(
        error instanceof Error
          ? error.message
          : String(error)
      ),
      occurredAt: this.clock.now().toISOString()
    }
  })
}
```

- [ ] **Passo 10: validar**

```powershell
pnpm exec vitest run tests/unit/automation/workflow/agent-runtime-service.test.ts
```

---

### Task 9: IPC do agente e eventos em tempo real

**Arquivos:**

- Modificar: `src/main/ipc/register-agent-ipc-handlers.ts`
- Modificar: `tests/unit/main/ipc/register-agent-ipc-handlers.test.ts`

**Produz:**

- `agent:get-state`
- `agent:start`
- `agent:pause`
- `agent:resume`
- `agent:stop`
- `agent:login-completed`
- emissão `agent:state-changed`

- [ ] **Passo 1: escrever testes**

Cobrir:

```ts
it('deve registrar todos os comandos')
it('deve encaminhar loginCompleted')
it('deve emitir somente AgentPublicState')
it('deve remover inscrições anteriores ao registrar novamente')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/main/ipc/register-agent-ipc-handlers.test.ts
```

- [ ] **Passo 3: implementar**

Contrato:

```ts
export interface AgentIpcEventSender {
  send(channel: string, payload: unknown): void
}

export interface AgentControlService {
  start(): Promise<AgentPublicState>
  pause(): Promise<AgentPublicState>
  resume(): Promise<AgentPublicState>
  stop(): Promise<AgentPublicState>
  loginCompleted(): Promise<AgentPublicState>
  getSnapshot(): AgentPublicState
  subscribe(listener: (state: AgentPublicState) => void): () => void
}
```

`registerAgentIpcHandlers` deve retornar uma função de descarte:

```ts
export function registerAgentIpcHandlers(
  ipcMain: AgentIpcMainRegistrar,
  agentService: AgentControlService,
  eventSender: AgentIpcEventSender
): () => void
```

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/main/ipc/register-agent-ipc-handlers.test.ts
```

---

### Task 10: IPC do histórico

**Arquivos:**

- Criar: `src/main/ipc/register-history-ipc-handlers.ts`
- Criar: `tests/unit/main/ipc/register-history-ipc-handlers.test.ts`

- [ ] **Passo 1: escrever testes**

Cobrir validação de:

```ts
{ page: 1, pageSize: 50 }
{ page: 0, pageSize: 50 } // rejeitar
{ page: 1, pageSize: 101 } // rejeitar
```

Cobrir eventos:

```text
history:record-created
history:record-updated
history:cleared
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/main/ipc/register-history-ipc-handlers.test.ts
```

- [ ] **Passo 3: implementar com Zod**

```ts
const listInputSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100)
})
```

O handler nunca recebe SQL.

- [ ] **Passo 4: validar**

```powershell
pnpm exec vitest run tests/unit/main/ipc/register-history-ipc-handlers.test.ts
```

---

### Task 11: Serviço e IPC seguro de PDF

**Arquivos:**

- Criar: `src/main/services/pdf-file-service.ts`
- Criar: `src/main/ipc/register-pdf-ipc-handlers.ts`
- Criar: `tests/unit/main/services/pdf-file-service.test.ts`
- Criar: `tests/unit/main/ipc/register-pdf-ipc-handlers.test.ts`

- [ ] **Passo 1: escrever testes do serviço**

Cobrir:

```ts
it('deve abrir PDF existente')
it('deve revelar PDF existente')
it('deve retornar NOT_FOUND quando o arquivo não existir')
it('deve rejeitar extensão diferente de PDF')
it('deve rejeitar diretório')
it('não deve executar comandos de shell arbitrários')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run `
  tests/unit/main/services/pdf-file-service.test.ts `
  tests/unit/main/ipc/register-pdf-ipc-handlers.test.ts
```

- [ ] **Passo 3: implementar o serviço**

```ts
export interface PdfShellPort {
  openPath(path: string): Promise<string>
  showItemInFolder(path: string): void
}

export interface PdfFileSystemPort {
  stat(path: string): Promise<{
    isFile(): boolean
  }>
}

export class PdfFileService {
  async open(path: string): Promise<PdfActionResult>
  async reveal(path: string): Promise<PdfActionResult>
}
```

Validação obrigatória:

```ts
if (!isAbsolute(path) || extname(path).toLowerCase() !== '.pdf') {
  throw new Error('Caminho de PDF inválido')
}
```

- [ ] **Passo 4: implementar IPC com Zod**

```ts
const pdfPathSchema = z.string().trim().min(1)
```

- [ ] **Passo 5: validar**

```powershell
pnpm exec vitest run `
  tests/unit/main/services/pdf-file-service.test.ts `
  tests/unit/main/ipc/register-pdf-ipc-handlers.test.ts
```

---

### Task 12: Preload seguro

**Arquivos:**

- Modificar: `src/preload/index.ts`
- Modificar: `src/preload/index.d.ts`
- Criar: `tests/unit/preload/agent-preload-api.test.ts`

- [ ] **Passo 1: escrever teste estático e comportamental**

Verificar:

```ts
expect(source).not.toContain('child_process')
expect(source).not.toContain('exec(')
expect(source).not.toContain('spawn(')
expect(source).toContain('onStateChanged')
expect(source).toContain('history')
expect(source).toContain('pdf')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/preload/agent-preload-api.test.ts
```

- [ ] **Passo 3: criar helper de inscrição**

```ts
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}
```

- [ ] **Passo 4: expor APIs**

```ts
control: {
  getState: () =>
    ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.getState),
  start: () =>
    ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.start),
  pause: () =>
    ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.pause),
  resume: () =>
    ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.resume),
  stop: () =>
    ipcRenderer.invoke(AGENT_RUNTIME_IPC_CHANNELS.stop),
  loginCompleted: () =>
    ipcRenderer.invoke(
      AGENT_RUNTIME_IPC_CHANNELS.loginCompleted
    ),
  onStateChanged: (listener) =>
    subscribe(
      AGENT_RUNTIME_IPC_CHANNELS.stateChanged,
      listener
    )
}
```

Adicionar `history` e `pdf` usando os contratos definidos.

- [ ] **Passo 5: validar**

```powershell
pnpm exec vitest run tests/unit/preload/agent-preload-api.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```

---

### Task 13: Composição no processo principal

**Arquivos:**

- Modificar: `src/main/index.ts`
- Criar: `tests/unit/main/main-composition-guard.test.ts`

- [ ] **Passo 1: escrever o guard**

Verificar que `main/index.ts`:

```text
usa app.getPath('userData') para agente-cpi.sqlite
cria ResearchHistoryRepository
marca EM_ANDAMENTO como INTERROMPIDO
cria ResearchHistoryService
cria AgentPublicStateStore
cria AgentRuntimeService com ContinuousResearchRunner
registra IPC de agente, histórico e PDF
não executa pnpm ou PowerShell
mantém contextIsolation true
mantém nodeIntegration false
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/main/main-composition-guard.test.ts
```

- [ ] **Passo 3: compor os serviços**

Banco:

```ts
const databaseFile = join(app.getPath('userData'), 'agente-cpi.sqlite')

const historyRepository = ResearchHistoryRepository.open(databaseFile)

historyRepository.markUnfinishedAsInterrupted(new Date().toISOString())

const historyService = new ResearchHistoryService(historyRepository)
```

Eventos para todas as janelas:

```ts
const eventSender = {
  send(channel: string, payload: unknown): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    })
  }
}
```

- [ ] **Passo 4: ajustar o encerramento do aplicativo**

No `before-quit`:

1. aguardar `agentRuntimeService.shutdown()`;
2. fechar o navegador;
3. fechar o repositório SQLite;
4. encerrar o aplicativo.

O botão dashboard `agent:stop` não fecha o navegador.

- [ ] **Passo 5: validar**

```powershell
pnpm exec vitest run tests/unit/main/main-composition-guard.test.ts
pnpm run typecheck:node
```

---

### Task 14: Controles e status do dashboard

**Arquivos:**

- Criar: `src/renderer/src/components/agent/AgentControlPanel.tsx`
- Criar: `src/renderer/src/components/agent/AgentStatusCard.tsx`
- Criar: `src/renderer/src/components/agent/QueueCountdown.tsx`
- Criar: `src/renderer/src/components/agent/AgentErrorPanel.tsx`
- Criar: `tests/unit/renderer/agent-control-panel.test.tsx`
- Modificar: `src/renderer/src/components/AgentDashboard.tsx`
- Modificar: `tests/unit/renderer/agent-dashboard.test.tsx`

- [ ] **Passo 1: escrever testes dos controles**

Matriz obrigatória:

```text
PARADO              -> Iniciar habilitado
INICIANDO           -> controles bloqueados
AGUARDANDO_LOGIN    -> Login concluído habilitado
EXECUTANDO          -> Pausar e Parar habilitados
PAUSANDO            -> controles bloqueados
PAUSADO             -> Continuar e Parar habilitados
PARANDO             -> controles bloqueados
OCIOSO              -> Pausar e Parar habilitados
ERRO_E1             -> Iniciar habilitado
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run tests/unit/renderer/agent-control-panel.test.tsx
```

- [ ] **Passo 3: implementar `AgentControlPanel`**

Props:

```ts
interface AgentControlPanelProps {
  state: AgentPublicState
  busyAction: string | null
  onStart(): Promise<void>
  onPause(): Promise<void>
  onResume(): Promise<void>
  onStop(): Promise<void>
  onLoginCompleted(): Promise<void>
}
```

- [ ] **Passo 4: implementar `QueueCountdown`**

O componente recebe `nextCheckAt` e calcula localmente a contagem a cada segundo. Ele deve limpar o intervalo ao desmontar.

- [ ] **Passo 5: implementar `AgentErrorPanel`**

Exibir somente:

```text
etapa
mensagem segura
data/hora
```

Não renderizar conteúdo bruto.

- [ ] **Passo 6: atualizar `AgentDashboard`**

Carregamento inicial:

```ts
const [browserSnapshot, agentSnapshot, sessionSnapshot, historyPage] = await Promise.all([
  window.agent.browser.getStatus(),
  window.agent.control.getState(),
  window.agent.sessions.getStatus(),
  window.agent.history.list({
    page: 1,
    pageSize: 50
  })
])
```

Inscrição:

```ts
const unsubscribeState = window.agent.control.onStateChanged(setAgent)
```

Remover o polling de três segundos para o estado do agente. Manter atualização de sessões apenas quando:

- iniciar;
- confirmar login;
- receber `AGUARDANDO_LOGIN`;
- clicar em atualizar sessões.

- [ ] **Passo 7: validar**

```powershell
pnpm exec vitest run `
  tests/unit/renderer/agent-control-panel.test.tsx `
  tests/unit/renderer/agent-dashboard.test.tsx
```

---

### Task 15: Histórico, paginação, limpeza e PDFs no dashboard

**Arquivos:**

- Criar: `src/renderer/src/components/history/ResearchHistoryTable.tsx`
- Criar: `src/renderer/src/components/history/ResearchHistoryPagination.tsx`
- Criar: `src/renderer/src/components/history/ClearHistoryDialog.tsx`
- Criar: `src/renderer/src/components/history/PdfActionButtons.tsx`
- Criar: `tests/unit/renderer/research-history-table.test.tsx`
- Criar: `tests/unit/renderer/pdf-action-buttons.test.tsx`
- Modificar: `src/renderer/src/components/AgentDashboard.tsx`

- [ ] **Passo 1: escrever testes**

Cobrir:

```ts
it('deve listar registros do mais recente para o mais antigo')
it('deve exibir CPF somente mascarado')
it('deve exibir classificação, resultado, status e duração')
it('deve paginar em grupos de 50')
it('deve atualizar registro recebido por evento')
it('deve limpar a lista após confirmação explícita')
it('deve informar que PDFs não serão removidos')
it('deve abrir PDF')
it('deve abrir pasta')
it('deve mostrar PDF não encontrado')
```

- [ ] **Passo 2: confirmar a falha**

```powershell
pnpm exec vitest run `
  tests/unit/renderer/research-history-table.test.tsx `
  tests/unit/renderer/pdf-action-buttons.test.tsx
```

- [ ] **Passo 3: implementar tabela**

Colunas:

```text
Data/hora
CPF
Classificação
Resultado CPI
Status
Duração
PDF
Erro
```

Não criar coluna de nome.

- [ ] **Passo 4: implementar confirmação da limpeza**

Texto exato:

```text
Esta ação excluirá o histórico do dashboard.
Os arquivos PDF não serão excluídos.
```

- [ ] **Passo 5: implementar eventos**

Ao receber `record-created`:

```ts
setHistory((current) => ({
  ...current,
  items: [record, ...current.items.filter((item) => item.id !== record.id)].slice(
    0,
    current.pageSize
  )
}))
```

Ao receber `record-updated`, substituir pelo mesmo `id`.

Ao receber `cleared`, zerar itens e total.

- [ ] **Passo 6: validar**

```powershell
pnpm exec vitest run `
  tests/unit/renderer/research-history-table.test.tsx `
  tests/unit/renderer/pdf-action-buttons.test.tsx `
  tests/unit/renderer/agent-dashboard.test.tsx
```

---

### Task 16: Layout e acessibilidade

**Arquivos:**

- Modificar: `src/renderer/src/assets/main.css`
- Criar: `tests/unit/renderer/dashboard-accessibility-guard.test.tsx`

- [ ] **Passo 1: escrever o guard**

Verificar:

```text
tabela possui caption ou nome acessível
botões têm nomes explícitos
diálogo usa role="dialog"
mensagem de erro usa role="alert"
status dinâmico usa aria-live="polite"
foco retorna ao botão Limpar histórico após fechar o diálogo
```

- [ ] **Passo 2: implementar o layout**

Estrutura:

```text
Cabeçalho
Resumo do agente
Controles
Sessões CPI/DeskData
Erro E1
Histórico
Paginação
Log operacional seguro
```

Manter a identidade visual escura já existente e adaptar para largura mínima de 900 px.

- [ ] **Passo 3: validar**

```powershell
pnpm exec vitest run tests/unit/renderer/dashboard-accessibility-guard.test.tsx
pnpm run typecheck:web
```

---

### Task 17: Integração completa sem consulta real

**Arquivos:**

- Criar: `tests/integration/dashboard-continuous-agent.test.ts`
- Modificar somente se o teste revelar falha real.

- [ ] **Passo 1: criar integração com fakes**

Cenário:

1. dashboard inicia `PARADO`;
2. Iniciar reutiliza navegador fake;
3. sessões autenticadas;
4. runner anuncia fila vazia;
5. runner anuncia pesquisa;
6. histórico cria `EM_ANDAMENTO`;
7. CPF mascarado é atualizado;
8. ciclo conclui;
9. histórico vira `CONCLUIDO`;
10. pausa impede segundo ciclo;
11. continuar retoma;
12. erro no ciclo seguinte gera `ERRO_E1`;
13. nenhuma terceira pesquisa inicia.

- [ ] **Passo 2: executar**

```powershell
pnpm exec vitest run tests/integration/dashboard-continuous-agent.test.ts
```

- [ ] **Passo 3: executar regressão do fluxo contínuo**

```powershell
pnpm exec vitest run `
  tests/unit/automation/flow/automatic-save-guard.test.ts `
  tests/unit/automation/flow/continuous-safety-guard.test.ts `
  tests/unit/automation/cpi/cpi-queue-continuous-polling.test.ts `
  tests/unit/scripts/run-continuous-auto-research.test.ts
```

Resultado esperado: o comando de terminal continua sem `GRAVAR`, com gravação única e política E1.

---

### Task 18: Validação técnica consolidada

- [ ] **Passo 1: formatação**

```powershell
pnpm run format
pnpm run format:check
```

- [ ] **Passo 2: lint**

```powershell
pnpm run lint
```

- [ ] **Passo 3: typecheck**

```powershell
pnpm run typecheck
```

- [ ] **Passo 4: testes**

```powershell
pnpm test
```

- [ ] **Passo 5: build Electron**

```powershell
pnpm run build
```

- [ ] **Passo 6: validação global**

```powershell
pnpm run validate
```

Nenhuma consulta real deve ocorrer nesta tarefa.

---

### Task 19: Teste real controlado pelo dashboard

Esta tarefa só começa após todas as anteriores passarem.

- [ ] **Passo 1: iniciar o aplicativo**

```powershell
pnpm run dev
```

- [ ] **Passo 2: confirmar estado inicial**

Verificar:

```text
Agente: PARADO
Nenhuma pesquisa iniciada
Navegador não aberto automaticamente
Histórico carregado do SQLite
```

- [ ] **Passo 3: iniciar pelo dashboard**

Clicar em **Iniciar agente**.

Verificar:

```text
navegador aberto ou reutilizado
abas CPI e DeskData disponíveis
AGUARDANDO_LOGIN quando necessário
botão Login concluído — continuar disponível
```

- [ ] **Passo 4: validar um ciclo real**

Após autenticar:

```text
filtro 29 aplicado
uma pesquisa processada
Alterar acionado uma vez
confirmação OK aceita
PDF persistido
histórico atualizado para CONCLUIDO
CPF exibido somente mascarado
```

- [ ] **Passo 5: validar pausa P1**

Durante um ciclo:

1. clicar **Pausar**;
2. observar `PAUSANDO`;
3. confirmar conclusão do ciclo;
4. confirmar `PAUSADO`;
5. confirmar ausência de nova pesquisa.

- [ ] **Passo 6: validar continuação**

Clicar **Continuar** e confirmar retomada da fila sem abrir novo navegador.

- [ ] **Passo 7: validar parada S2**

Durante um ciclo:

1. clicar **Parar**;
2. observar `PARANDO`;
3. confirmar conclusão do ciclo;
4. confirmar `PARADO`;
5. confirmar navegador ainda aberto.

- [ ] **Passo 8: validar reutilização R1**

Clicar **Iniciar agente** novamente e confirmar que não foi criada segunda instância do navegador.

- [ ] **Passo 9: validar histórico e PDFs**

Verificar:

```text
Abrir PDF
Abrir pasta
PDF não encontrado quando arquivo for movido em teste controlado
paginação
persistência após reiniciar aplicativo
```

- [ ] **Passo 10: validar limpeza X1**

Clicar **Limpar histórico**, confirmar o diálogo e verificar:

```text
registros removidos
PDFs permanecem no disco
agente não muda de estado
```

---

## Critério final de conclusão

O trabalho estará concluído somente quando:

```text
pnpm run validate
pnpm run build
```

terminarem com código zero e o teste real da Task 19 confirmar:

- início manual;
- histórico persistente;
- pausa P1;
- parada S2;
- reutilização R1;
- login L1;
- PDF D1;
- limpeza X1;
- política E1;
- nenhum nome ou CPF completo no SQLite, renderer ou logs.
