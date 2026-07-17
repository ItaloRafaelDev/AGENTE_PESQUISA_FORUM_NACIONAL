export const PDF_ACTION_STATUSES = ['OPENED', 'REVEALED', 'NOT_FOUND'] as const

export type PdfActionStatus = (typeof PDF_ACTION_STATUSES)[number]

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
