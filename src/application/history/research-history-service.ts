import { getCpiClassificationLabel } from '../../domain/research/get-cpi-classification-label'
import type { ApplicationClock } from '../ports/application-clock-port'
import type { ApplicationIdGenerator } from '../ports/application-id-generator-port'
import type { ResearchHistoryRepositoryPort } from '../ports/research-history-repository-port'
import type { SafeMessageSanitizer } from '../ports/safe-message-sanitizer-port'
import type { ResearchCycleResult } from '../research/research-cycle-model'
import type {
  ResearchHistoryEvent,
  ResearchHistoryEventListener,
  ResearchHistoryListInput,
  ResearchHistoryPage,
  ResearchHistoryRecord
} from './research-history-model'

export interface ResearchHistoryServiceDependencies {
  repository: ResearchHistoryRepositoryPort
  clock: ApplicationClock
  idGenerator: ApplicationIdGenerator
  sanitizer: SafeMessageSanitizer
}

interface ActiveResearchHistory {
  startedAt: Date
  maskedCpf: string
}

const UNKNOWN_MASKED_CPF = '***.***.***-00'

export class ResearchHistoryService {
  private readonly activeCycles = new Map<string, ActiveResearchHistory>()

  private readonly listeners = new Set<ResearchHistoryEventListener>()

  constructor(private readonly dependencies: ResearchHistoryServiceDependencies) {}

  beginCycle(): ResearchHistoryRecord {
    const startedAt = this.dependencies.clock.now()

    this.assertValidDate(startedAt)

    const id = this.dependencies.idGenerator.next()
    const timestamp = startedAt.toISOString()
    const record = this.dependencies.repository.create({
      id,
      maskedCpf: UNKNOWN_MASKED_CPF,
      status: 'EM_ANDAMENTO',
      startedAt: timestamp,
      createdAt: timestamp
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
    const record = this.dependencies.repository.setMaskedCpf(id, maskedCpf)

    activeCycle.maskedCpf = maskedCpf

    this.emit({
      type: 'UPDATED',
      record
    })

    return record
  }

  completeCycle(id: string, result: ResearchCycleResult): ResearchHistoryRecord {
    const finishedAt = this.dependencies.clock.now()

    this.assertValidDate(finishedAt)

    const activeCycle = this.getActiveCycle(id)

    try {
      const record = this.dependencies.repository.complete({
        id,
        maskedCpf: result.maskedCpf,
        classification: result.classification,
        cpiResult: getCpiClassificationLabel(result.classification),
        finishedAt: finishedAt.toISOString(),
        durationMs: this.calculateDuration(activeCycle.startedAt, finishedAt),
        pdfPath: result.pdfPath
      })

      this.emit({
        type: 'UPDATED',
        record
      })

      return record
    } finally {
      this.activeCycles.delete(id)
    }
  }

  failCycle(id: string, stage: string, error: unknown): ResearchHistoryRecord {
    const finishedAt = this.dependencies.clock.now()

    this.assertValidDate(finishedAt)

    const activeCycle = this.getActiveCycle(id)
    const errorMessage = this.dependencies.sanitizer.sanitize(
      error instanceof Error ? error.message : String(error)
    )

    try {
      const record = this.dependencies.repository.fail({
        id,
        maskedCpf: activeCycle.maskedCpf,
        finishedAt: finishedAt.toISOString(),
        durationMs: this.calculateDuration(activeCycle.startedAt, finishedAt),
        errorStage: this.dependencies.sanitizer.sanitize(stage),
        errorMessage
      })

      this.emit({
        type: 'UPDATED',
        record
      })

      return record
    } finally {
      this.activeCycles.delete(id)
    }
  }

  list(input: ResearchHistoryListInput): ResearchHistoryPage {
    return this.dependencies.repository.list(input)
  }

  clear(): void {
    if (this.activeCycles.size > 0) {
      throw new Error('Não é possível limpar o histórico durante uma pesquisa em andamento')
    }

    this.dependencies.repository.clear()

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
      try {
        if (event.type === 'CLEARED') {
          listener({ ...event })

          return
        }

        listener({
          ...event,
          record: {
            ...event.record
          }
        })
      } catch {
        // Observers cannot interrupt history persistence or subsequent observers.
      }
    })
  }
}
