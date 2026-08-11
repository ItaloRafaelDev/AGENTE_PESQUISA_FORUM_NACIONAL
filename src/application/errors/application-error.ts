import type { ContinuousResearchStage } from '../agent/continuous-research-stage'

export type ApplicationErrorCode =
  | 'VALIDATION'
  | 'INTEGRATION'
  | 'PREPARATION'
  | 'PERSISTENCE'
  | 'CANCELLED'
  | 'INVALID_STATE'
  | 'UNEXPECTED'

export interface ApplicationErrorOptions {
  code: ApplicationErrorCode
  message: string
  stage?: ContinuousResearchStage | 'CONTINUOUS_RUNNER'
  cause?: unknown
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode
  readonly stage: ContinuousResearchStage | 'CONTINUOUS_RUNNER' | null
  readonly cause: unknown

  constructor({ code, message, stage, cause }: ApplicationErrorOptions) {
    super(message)

    this.name = 'ApplicationError'
    this.code = code
    this.stage = stage ?? null
    this.cause = cause
  }
}
