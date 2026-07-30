import { readFile } from 'node:fs/promises'
import { PDFParse } from 'pdf-parse'
import { CanvasFactory, getData } from 'pdf-parse/worker'
import type { DeskDataPdfTextSnapshot } from './deskdata-pdf-text-snapshot'

PDFParse.setWorker(getData())

export type DeskDataPdfTextExtractionErrorCode =
  'PDF_TEXT_EXTRACTION_FAILED' | 'PDF_TEXT_EMPTY' | 'PDF_PAGE_COUNT_MISMATCH'

export class DeskDataPdfTextExtractionError extends Error {
  constructor(
    readonly code: DeskDataPdfTextExtractionErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'DeskDataPdfTextExtractionError'
  }
}

export class DeskDataPdfTextExtractor {
  async extract(filePath: string): Promise<DeskDataPdfTextSnapshot> {
    let parser: PDFParse | undefined

    try {
      const data = await readFile(filePath)

      parser = new PDFParse({
        data,
        CanvasFactory
      })

      const result = await parser.getText()

      const pages = result.pages
        .map((page) => ({
          pageNumber: page.num,
          text: page.text
        }))
        .sort((left, right) => left.pageNumber - right.pageNumber)

      const text = pages
        .map((page) => page.text)
        .join('\n')
        .trim()

      if (!text) {
        throw new DeskDataPdfTextExtractionError(
          'PDF_TEXT_EMPTY',
          'O PDF da DeskData não possui texto extraível.'
        )
      }

      if (result.total < 1 || pages.length !== result.total) {
        throw new DeskDataPdfTextExtractionError(
          'PDF_PAGE_COUNT_MISMATCH',
          'A extração do PDF da DeskData não retornou todas as páginas.'
        )
      }

      return {
        totalPages: result.total,
        pages,
        text
      }
    } catch (error: unknown) {
      if (error instanceof DeskDataPdfTextExtractionError) {
        throw error
      }

      throw new DeskDataPdfTextExtractionError(
        'PDF_TEXT_EXTRACTION_FAILED',
        'Não foi possível extrair o texto do PDF da DeskData.',
        {
          cause: error
        }
      )
    } finally {
      if (parser) {
        await parser.destroy()
      }
    }
  }
}
