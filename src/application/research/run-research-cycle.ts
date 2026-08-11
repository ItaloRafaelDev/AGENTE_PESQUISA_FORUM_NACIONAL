import type { ExecutionToken } from '../agent/execution-control'
import {
  ContinuousResearchStageError,
  type ContinuousResearchStage
} from '../agent/continuous-research-stage'
import { ApplicationError } from '../errors/application-error'
import type {
  ResearchCycleHooks,
  RunResearchCycleDependencies
} from '../ports/research-cycle-ports'
import type { PreparedResearch } from '../ports/research-preparation-ports'
import type { ResearchCycleResult } from './research-cycle-model'

const MASKED_CPF_PATTERN = /^\*{3}\.\*{3}\.\*{3}-\d{2}$/

export class RunResearchCycle {
  constructor(private readonly dependencies: RunResearchCycleDependencies) {}

  async execute(input: {
    token: ExecutionToken
    hooks?: ResearchCycleHooks
  }): Promise<ResearchCycleResult> {
    this.assertCanStart(input.token)

    await this.runStage('OPENING_CPI_RESEARCH', () => this.dependencies.cpi.openNext(), input.hooks)

    const preparation = await this.prepareCurrentResearch(input.hooks)

    input.hooks?.onIdentity?.(preparation.maskedCpf)

    await this.runStage(
      'SAVING_CPI',
      async () => {
        const result = await this.dependencies.cpi.saveOnce()

        if (!result.saved || !result.confirmationAccepted) {
          throw new Error('A gravação da pesquisa não foi confirmada.')
        }

        return result
      },
      input.hooks
    )

    await this.runStage(
      'PREPARING_NEXT_SEARCH',
      async () => {
        await this.dependencies.deskData.closeHistoricalResult()
        await this.dependencies.deskData.prepareNextSearch()
      },
      input.hooks
    )

    await this.runStage(
      'RETURNING_TO_QUEUE',
      () => this.dependencies.cpi.returnToQueue(),
      input.hooks
    )

    return {
      maskedCpf: preparation.maskedCpf,
      selectedDatasetCount: preparation.selectedDatasetCount,
      classification: preparation.classification.classification,
      pdfPath: preparation.report.compatibilityPath,
      pdfSizeBytes: preparation.report.sizeBytes,
      saved: true,
      confirmationAccepted: true
    }
  }

  private async prepareCurrentResearch(hooks?: ResearchCycleHooks): Promise<PreparedResearch> {
    const identity = await this.runStage(
      'READING_CPI_IDENTITY',
      () => this.dependencies.cpi.readIdentity(),
      hooks
    )

    // Preserve the characterized second identity-resolution notification and bind the frame there.
    await this.runStage(
      'READING_CPI_IDENTITY',
      () => this.dependencies.cpi.bindCurrentResearch(),
      hooks
    )

    await this.runStage(
      'PREPARING_DESKDATA',
      () => this.dependencies.deskData.prepareNextSearch(),
      hooks
    )

    return this.runStage(
      'PREPARING_CPI_RESULT',
      async () => {
        const result = await this.dependencies.preparation.execute(identity)
        this.assertMaskedIdentity(result.maskedCpf)
        return result
      },
      hooks
    )
  }

  private assertCanStart(token: ExecutionToken): void {
    if (!token.isCancellationRequested) {
      return
    }

    throw new ApplicationError({
      code: 'CANCELLED',
      message: 'A execução foi interrompida antes do início da pesquisa.',
      stage: 'OPENING_CPI_RESEARCH'
    })
  }

  private assertMaskedIdentity(maskedCpf: string): void {
    if (MASKED_CPF_PATTERN.test(maskedCpf)) {
      return
    }

    throw new ApplicationError({
      code: 'PREPARATION',
      message: 'O CPF produzido pelo fluxo não está mascarado.',
      stage: 'PREPARING_CPI_RESULT'
    })
  }

  private async runStage<T>(
    stage: ContinuousResearchStage,
    operation: () => Promise<T>,
    hooks?: ResearchCycleHooks
  ): Promise<T> {
    try {
      hooks?.onStage?.(stage)
      return await operation()
    } catch (error: unknown) {
      if (ContinuousResearchStageError.isPublic(error)) {
        throw error
      }

      if (error instanceof ApplicationError) {
        throw error
      }

      throw new ApplicationError({
        code: 'INTEGRATION',
        message: 'Não foi possível concluir a etapa do ciclo de pesquisa.',
        stage,
        cause: error
      })
    }
  }
}
