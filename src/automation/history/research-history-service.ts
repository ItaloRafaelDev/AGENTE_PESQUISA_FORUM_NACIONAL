import { randomUUID } from 'node:crypto'
import type { SingleResearchCycleResult } from '../flow/single-research-cycle'
import { mapResearchClassificationToCpiResult } from '../cpi/cpi-research-result-mapper'
import { SafeResearchLogger } from '../logging/safe-research-logger'
import type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from '../../application/history/research-history-model'
import type { ResearchHistoryRepositoryPort } from '../../application/ports/research-history-repository-port'

export type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener
} from '../../application/history/research-history-model'

export interface ResearchHistoryServiceOptions {
  idFactory?: () => string
  logger?: SafeResearchLogger
}

interface ActiveResearchHistory {
  startedAt: Date
  maskedCpf: string
}

const UNKNOWN_MASKED_CPF = '***.***.***-00'

export class ResearchHistoryService {
  private readonly idFactory: () => string

  private readonly logger: SafeResearchLogger

  private readonly activeCycles = new Map<string, ActiveResearchHistory>()

  private readonly listeners = new Set<ResearchHistoryEventListener>()

  constructor(
    private readonly repository: ResearchHistoryRepositoryPort,
    options: ResearchHistoryServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID

    this.logger = options.logger ?? new SafeResearchLogger(() => undefined)
  }

  beginCycle(startedAt: Date = new Date()): ResearchHistoryRecord {
    this.assertValidDate(startedAt)

    const id = this.idFactory()

    const record = this.repository.create({
      id,
      maskedCpf: UNKNOWN_MASKED_CPF,
      status: 'EM_ANDAMENTO',
      startedAt: startedAt.toISOString(),
      createdAt: startedAt.toISOString()
    })

    this.activeCycles.set(id, {
      startedAt: new Date(startedAt),
      maskedCpf: UNKNOWN_MASKED_CPF
    })

    this.emit({
      type: 'CREATED',
      record
    })

    return record
  }

  setMaskedCpf(id: string, maskedCpf: string): ResearchHistoryRecord {
    const activeCycle = this.getActiveCycle(id)

    const record = this.repository.setMaskedCpf(id, maskedCpf)

    activeCycle.maskedCpf = maskedCpf

    this.emit({
      type: 'UPDATED',
      record
    })

    return record
  }

  completeCycle(
    id: string,
    result: SingleResearchCycleResult,
    finishedAt: Date = new Date()
  ): ResearchHistoryRecord {
    this.assertValidDate(finishedAt)

    const activeCycle = this.getActiveCycle(id)

    const cpiResult = mapResearchClassificationToCpiResult(result.classification)

    const record = this.repository.complete({
      id,
      maskedCpf: result.maskedCpf,
      classification: result.classification,
      cpiResult: cpiResult.label,
      finishedAt: finishedAt.toISOString(),
      durationMs: this.calculateDuration(activeCycle.startedAt, finishedAt),
      pdfPath: result.pdfPath
    })

    this.activeCycles.delete(id)

    this.emit({
      type: 'UPDATED',
      record
    })

    return record
  }

  failCycle(
    id: string,
    stage: string,
    error: unknown,
    finishedAt: Date = new Date()
  ): ResearchHistoryRecord {
    this.assertValidDate(finishedAt)

    const activeCycle = this.getActiveCycle(id)

    const errorMessage = this.logger.sanitizeMessage(
      error instanceof Error ? error.message : String(error)
    )

    const record = this.repository.fail({
      id,
      maskedCpf: activeCycle.maskedCpf,
      finishedAt: finishedAt.toISOString(),
      durationMs: this.calculateDuration(activeCycle.startedAt, finishedAt),
      errorStage: this.logger.sanitizeMessage(stage),
      errorMessage
    })

    this.activeCycles.delete(id)

    this.emit({
      type: 'UPDATED',
      record
    })

    return record
  }

  list(input: ResearchHistoryListInput): ResearchHistoryPage {
    return this.repository.list(input)
  }

  clear(): void {
    if (this.activeCycles.size > 0) {
      throw new Error('Não é possível limpar o histórico durante uma pesquisa em andamento')
    }

    this.repository.clear()

    this.emit({
      type: 'CLEARED'
    })
  }

  subscribe(listener: ResearchHistoryEventListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private getActiveCycle(id: string): ActiveResearchHistory {
    const activeCycle = this.activeCycles.get(id)

    if (!activeCycle) {
      throw new Error(`Ciclo de histórico ativo não encontrado: ${id}`)
    }

    return activeCycle
  }

  private calculateDuration(startedAt: Date, finishedAt: Date): number {
    return Math.max(0, Math.trunc(finishedAt.getTime() - startedAt.getTime()))
  }

  private assertValidDate(date: Date): void {
    if (!Number.isFinite(date.getTime())) {
      throw new Error('Data do histórico inválida')
    }
  }

  private emit(event: ResearchHistoryEvent): void {
    this.listeners.forEach((listener) => {
      if (event.type === 'CLEARED') {
        listener(event)

        return
      }

      listener({
        ...event,
        record: {
          ...event.record
        }
      })
    })
  }
}
