export interface DeskDataPdfTextPage {
  pageNumber: number
  text: string
}

export interface DeskDataPdfTextSnapshot {
  totalPages: number
  pages: DeskDataPdfTextPage[]
  text: string
}
