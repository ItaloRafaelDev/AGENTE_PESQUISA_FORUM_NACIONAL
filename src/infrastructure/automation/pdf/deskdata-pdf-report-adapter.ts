import type { ResearchReportPort } from '../../../application/ports/research-preparation-ports'
import type { DeskDataProcessRecord } from '../../../domain/research/deskdata-process-record'
import type { BrowserContext, Page } from 'playwright'
import type { DeskDataPdfDownloadController } from './deskdata-pdf-download-controller'
import type { DeskDataPdfProcessReader } from './deskdata-pdf-process-reader'

export class DeskDataPdfReportAdapter implements ResearchReportPort {
  constructor(
    private readonly context: BrowserContext,
    private readonly resultPage: () => Page,
    private readonly downloader: Pick<DeskDataPdfDownloadController, 'downloadOnce'>,
    private readonly reader: Pick<DeskDataPdfProcessReader, 'read'>
  ) {}

  async create(): Promise<{
    reference: string
    compatibilityPath: string
    sizeBytes: number
  }> {
    const pdf = await this.downloader.downloadOnce(this.context, this.resultPage())

    return {
      reference: pdf.filePath,
      compatibilityPath: pdf.filePath,
      sizeBytes: pdf.sizeBytes
    }
  }

  readProcesses(reference: string): Promise<readonly DeskDataProcessRecord[]> {
    return this.reader.read(reference)
  }
}
