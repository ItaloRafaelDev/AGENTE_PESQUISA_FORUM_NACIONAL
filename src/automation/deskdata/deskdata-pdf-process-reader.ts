import type { DeskDataProcessRecord } from '../../domain/research/deskdata-process-record'
import {
  DeskDataPdfProcessParser,
  type DeskDataPdfProcessParsingError
} from './deskdata-pdf-process-parser'
import {
  DeskDataPdfTextExtractor,
  type DeskDataPdfTextExtractionError
} from './deskdata-pdf-text-extractor'
import type { DeskDataPdfTextSnapshot } from './deskdata-pdf-text-snapshot'

export interface DeskDataPdfTextExtractionPort {
  extract(filePath: string): Promise<DeskDataPdfTextSnapshot>
}

export interface DeskDataPdfProcessParsingPort {
  parse(snapshot: DeskDataPdfTextSnapshot): DeskDataProcessRecord[]
}

export type DeskDataPdfReadError = DeskDataPdfTextExtractionError | DeskDataPdfProcessParsingError

export class DeskDataPdfProcessReader {
  constructor(
    private readonly extractor: DeskDataPdfTextExtractionPort = new DeskDataPdfTextExtractor(),
    private readonly parser: DeskDataPdfProcessParsingPort = new DeskDataPdfProcessParser()
  ) {}

  async read(filePath: string): Promise<DeskDataProcessRecord[]> {
    const snapshot = await this.extractor.extract(filePath)

    return this.parser.parse(snapshot)
  }
}
