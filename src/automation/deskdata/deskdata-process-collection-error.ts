export type DeskDataProcessCollectionErrorCode =
  | 'PROCESS_SECTION_NOT_FOUND'
  | 'PROCESS_SECTION_NOT_READY'
  | 'PROCESS_CARD_EXPANSION_FAILED'
  | 'PROCESS_CARD_STRUCTURE_INVALID'
  | 'PROCESS_PAGINATION_STALLED'
  | 'PROCESS_PAGINATION_LOOP'
  | 'PROCESS_COUNT_MISMATCH'
  | 'PROCESS_COLLECTION_INCOMPLETE'

export class DeskDataProcessCollectionError extends Error {
  constructor(
    readonly code: DeskDataProcessCollectionErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'DeskDataProcessCollectionError'
  }
}
