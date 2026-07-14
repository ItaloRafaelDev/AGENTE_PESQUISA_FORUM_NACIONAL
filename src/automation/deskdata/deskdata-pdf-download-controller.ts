import { randomBytes } from 'node:crypto'
import { mkdir, open, rm, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { BrowserContext, Download, Page } from 'playwright'

export const DESKDATA_PDF_EXPORT_SELECTOR =
  'form[method="POST"] input[type="submit"][name="export"][value="Exportar"][formtarget="_blank"]'

const DEFAULT_OUTPUT_DIRECTORY = 'E:\\PDF-AGENTE-CPI'

type DownloadState = 'IDLE' | 'DOWNLOADING' | 'DOWNLOADED'

export interface DeskDataPdfDownloadControllerOptions {
  outputDirectory?: string
  downloadTimeoutMs?: number
}

export interface DeskDataPdfDownloadResult {
  filePath: string
  sizeBytes: number
}

export class DeskDataPdfDownloadController {
  private readonly outputDirectory: string
  private readonly downloadTimeoutMs: number
  private state: DownloadState = 'IDLE'

  constructor(options: DeskDataPdfDownloadControllerOptions = {}) {
    this.outputDirectory = options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 30_000

    if (this.downloadTimeoutMs < 1) {
      throw new Error('O tempo limite do download deve ser maior que zero.')
    }
  }

  async downloadOnce(
    context: BrowserContext,
    sourcePage: Page
  ): Promise<DeskDataPdfDownloadResult> {
    if (this.state !== 'IDLE') {
      throw new Error('O PDF da DeskData já foi exportado ou está sendo exportado nesta execução.')
    }

    const exportControl = sourcePage.locator(DESKDATA_PDF_EXPORT_SELECTOR)

    const exportControlCount = await exportControl.count()

    if (exportControlCount !== 1) {
      throw new Error(
        'O botão Exportar deveria possuir exatamente um controle. Encontrados: ' +
          exportControlCount
      )
    }

    this.state = 'DOWNLOADING'

    let savedFilePath: string | undefined
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    let resolveDownload: (download: Download) => void

    const downloadPromise = new Promise<Download>((resolve) => {
      resolveDownload = resolve
    })

    let downloadCaptured = false

    const onDownload = (download: Download): void => {
      if (downloadCaptured) {
        return
      }

      downloadCaptured = true
      resolveDownload(download)
    }

    const registeredPages = new Set<Page>()

    const registerPage = (page: Page): void => {
      if (registeredPages.has(page)) {
        return
      }

      registeredPages.add(page)
      page.on('download', onDownload)
    }

    const onPage = (page: Page): void => {
      registerPage(page)
    }

    context.pages().forEach(registerPage)
    registerPage(sourcePage)
    context.on('page', onPage)

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('O download do PDF da DeskData não iniciou dentro do tempo limite.'))
        }, this.downloadTimeoutMs)
      })

      await exportControl.click({
        timeout: 10_000
      })

      const download = await Promise.race([downloadPromise, timeoutPromise])

      const downloadFailure = await download.failure()

      if (downloadFailure) {
        throw new Error('A DeskData informou falha no download do PDF: ' + downloadFailure)
      }

      await mkdir(this.outputDirectory, {
        recursive: true
      })

      savedFilePath = join(this.outputDirectory, this.createTechnicalFileName())

      await download.saveAs(savedFilePath)

      const sizeBytes = await this.validatePdf(savedFilePath)

      this.state = 'DOWNLOADED'

      return {
        filePath: savedFilePath,
        sizeBytes
      }
    } catch (error: unknown) {
      this.state = 'IDLE'

      if (savedFilePath) {
        await rm(savedFilePath, {
          force: true
        })
      }

      throw error
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }

      context.off('page', onPage)

      registeredPages.forEach((page) => {
        page.off('download', onDownload)
      })
    }
  }

  private createTechnicalFileName(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/\.\d{3}Z$/, '')
      .replace(/[-:]/g, '')
      .replace('T', '-')

    const token = randomBytes(4).toString('hex')

    return 'deskdata-' + timestamp + '-' + token + '.pdf'
  }

  private async validatePdf(filePath: string): Promise<number> {
    if (extname(filePath).toLowerCase() !== '.pdf') {
      throw new Error('O arquivo baixado não possui extensão PDF.')
    }

    const fileStat = await stat(filePath)

    if (!fileStat.isFile() || fileStat.size < 5) {
      throw new Error('O arquivo PDF baixado está vazio ou inválido.')
    }

    const signature = Buffer.alloc(5)
    const fileHandle = await open(filePath, 'r')

    try {
      const readResult = await fileHandle.read(signature, 0, signature.length, 0)

      if (readResult.bytesRead !== signature.length || signature.toString('ascii') !== '%PDF-') {
        throw new Error('O arquivo baixado não possui uma assinatura PDF válida.')
      }
    } finally {
      await fileHandle.close()
    }

    return fileStat.size
  }
}
