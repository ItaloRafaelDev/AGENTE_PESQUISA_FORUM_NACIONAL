import { extname, isAbsolute } from 'node:path'
import type { PdfActionResult } from '../../shared/types/pdf-api'

export interface PdfShellPort {
  openPath(path: string): Promise<string>
  showItemInFolder(path: string): void
}

export interface PdfFileSystemPort {
  stat(path: string): Promise<{
    isFile(): boolean
  }>
}

const PDF_EXTENSION = '.pdf'

export class PdfFileService {
  constructor(
    private readonly shell: PdfShellPort,
    private readonly fileSystem: PdfFileSystemPort
  ) {}

  async open(path: string): Promise<PdfActionResult> {
    const validation = await this.validateExistingPdf(path)

    if (validation === 'NOT_FOUND') {
      return {
        status: 'NOT_FOUND'
      }
    }

    const openError = await this.shell.openPath(path)

    if (openError) {
      throw new Error(`Falha ao abrir o PDF: ${openError}`)
    }

    return {
      status: 'OPENED'
    }
  }

  async reveal(path: string): Promise<PdfActionResult> {
    const validation = await this.validateExistingPdf(path)

    if (validation === 'NOT_FOUND') {
      return {
        status: 'NOT_FOUND'
      }
    }

    this.shell.showItemInFolder(path)

    return {
      status: 'REVEALED'
    }
  }

  private async validateExistingPdf(path: string): Promise<'VALID' | 'NOT_FOUND'> {
    this.assertPdfPath(path)

    try {
      const file = await this.fileSystem.stat(path)

      if (!file.isFile()) {
        throw new Error('O caminho informado não é um arquivo PDF')
      }

      return 'VALID'
    } catch (error: unknown) {
      if (this.isMissingFileError(error)) {
        return 'NOT_FOUND'
      }

      throw error
    }
  }

  private assertPdfPath(path: string): void {
    if (!path.trim() || !isAbsolute(path) || extname(path).toLowerCase() !== PDF_EXTENSION) {
      throw new Error('Caminho de PDF inválido')
    }
  }

  private isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
  }
}
