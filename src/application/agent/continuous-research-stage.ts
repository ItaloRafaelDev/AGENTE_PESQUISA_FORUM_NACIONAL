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

export class ContinuousResearchStageError extends Error {
  constructor(
    readonly stage: ContinuousResearchStage,
    readonly cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : String(cause))

    this.name = 'ContinuousResearchStageError'
  }
}
