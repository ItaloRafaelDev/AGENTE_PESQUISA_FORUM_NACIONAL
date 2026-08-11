export const CONTINUOUS_RESEARCH_STAGES = [
  'WAITING_QUEUE',
  'OPENING_CPI_RESEARCH',
  'READING_CPI_IDENTITY',
  'PREPARING_DESKDATA',
  'SUBMITTING_DESKDATA',
  'WAITING_DESKDATA_RESULT',
  'CLASSIFYING_RESULT',
  'DOWNLOADING_PDF',
  'PREPARING_CPI_RESULT',
  'ATTACHING_PDF',
  'SAVING_CPI',
  'PREPARING_NEXT_SEARCH',
  'RETURNING_TO_QUEUE'
] as const

export type ContinuousResearchStage = (typeof CONTINUOUS_RESEARCH_STAGES)[number]

const PUBLIC_STAGE_ERRORS = new WeakSet<ContinuousResearchStageError>()

export class ContinuousResearchStageError extends Error {
  static fromPublicMessage(
    stage: ContinuousResearchStage,
    message: string
  ): ContinuousResearchStageError {
    const error = new ContinuousResearchStageError(stage, new Error(message))
    PUBLIC_STAGE_ERRORS.add(error)
    return error
  }

  static isPublic(error: unknown): error is ContinuousResearchStageError {
    return error instanceof ContinuousResearchStageError && PUBLIC_STAGE_ERRORS.has(error)
  }

  constructor(
    readonly stage: ContinuousResearchStage,
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause))

    this.name = 'ContinuousResearchStageError'
  }
}
