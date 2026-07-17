import type { DeskDataFieldSnapshot } from './deskdata-sphere-extractor'

export interface DeskDataProcessCardSnapshot {
  processKey: string
  processNumber: string | null
  fields: DeskDataFieldSnapshot[]
}

export interface DeskDataProcessPageSnapshot {
  pageNumber: number
  pageSignature: string
  expectedProcessCount: number | null
  totalPages: number | null
  empty: boolean
  cards: DeskDataProcessCardSnapshot[]
  hasNextPage: boolean
}

export interface DeskDataProcessPagePort {
  waitUntilReady(): Promise<void>
  expandAllCards(): Promise<void>
  readCurrentPage(): Promise<DeskDataProcessPageSnapshot>
  goToNextPage(previousSignature: string): Promise<void>
}
