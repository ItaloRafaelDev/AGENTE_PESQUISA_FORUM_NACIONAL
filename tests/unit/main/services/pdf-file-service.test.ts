import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PdfFileService,
  type PdfFileSystemPort,
  type PdfShellPort
} from '@/main/services/pdf-file-service'

class FakeFileSystem implements PdfFileSystemPort {
  constructor(private readonly behavior: 'FILE' | 'DIRECTORY' | 'MISSING' | 'ERROR') {}

  async stat(): Promise<{
    isFile(): boolean
  }> {
    if (this.behavior === 'MISSING') {
      const error = new Error('Arquivo não encontrado') as NodeJS.ErrnoException

      error.code = 'ENOENT'

      throw error
    }

    if (this.behavior === 'ERROR') {
      const error = new Error('Falha de acesso') as NodeJS.ErrnoException

      error.code = 'EACCES'

      throw error
    }

    return {
      isFile: () => this.behavior === 'FILE'
    }
  }
}

class FakeShell implements PdfShellPort {
  public openedPaths: string[] = []
  public revealedPaths: string[] = []

  constructor(private readonly openError = '') {}

  async openPath(path: string): Promise<string> {
    this.openedPaths.push(path)

    return this.openError
  }

  showItemInFolder(path: string): void {
    this.revealedPaths.push(path)
  }
}

const validPdfPath = 'E:\\PDF-AGENTE-CPI\\resultado.pdf'

describe('PdfFileService', () => {
  it('abre um PDF existente usando o aplicativo padrão do Windows', async () => {
    const shell = new FakeShell()
    const service = new PdfFileService(shell, new FakeFileSystem('FILE'))

    await expect(service.open(validPdfPath)).resolves.toEqual({
      status: 'OPENED'
    })

    expect(shell.openedPaths).toEqual([validPdfPath])
  })

  it('revela um PDF existente no Explorer', async () => {
    const shell = new FakeShell()
    const service = new PdfFileService(shell, new FakeFileSystem('FILE'))

    await expect(service.reveal(validPdfPath)).resolves.toEqual({
      status: 'REVEALED'
    })

    expect(shell.revealedPaths).toEqual([validPdfPath])
  })

  it('retorna NOT_FOUND quando o PDF não existe', async () => {
    const shell = new FakeShell()
    const service = new PdfFileService(shell, new FakeFileSystem('MISSING'))

    await expect(service.open(validPdfPath)).resolves.toEqual({
      status: 'NOT_FOUND'
    })

    expect(shell.openedPaths).toEqual([])
  })

  it('rejeita caminho relativo', async () => {
    const service = new PdfFileService(new FakeShell(), new FakeFileSystem('FILE'))

    await expect(service.open('resultado.pdf')).rejects.toThrow('Caminho de PDF inválido')
  })

  it('rejeita extensão diferente de PDF', async () => {
    const service = new PdfFileService(new FakeShell(), new FakeFileSystem('FILE'))

    await expect(service.open('E:\\PDF-AGENTE-CPI\\resultado.exe')).rejects.toThrow(
      'Caminho de PDF inválido'
    )
  })

  it('rejeita diretório mesmo quando termina com .pdf', async () => {
    const service = new PdfFileService(new FakeShell(), new FakeFileSystem('DIRECTORY'))

    await expect(service.open(validPdfPath)).rejects.toThrow(
      'O caminho informado não é um arquivo PDF'
    )
  })

  it('propaga erro de acesso diferente de arquivo ausente', async () => {
    const service = new PdfFileService(new FakeShell(), new FakeFileSystem('ERROR'))

    await expect(service.open(validPdfPath)).rejects.toThrow('Falha de acesso')
  })

  it('propaga erro retornado pelo aplicativo padrão', async () => {
    const service = new PdfFileService(
      new FakeShell('Nenhum aplicativo associado'),
      new FakeFileSystem('FILE')
    )

    await expect(service.open(validPdfPath)).rejects.toThrow(
      'Falha ao abrir o PDF: Nenhum aplicativo associado'
    )
  })

  it('não usa execução arbitrária de shell', () => {
    const source = readFileSync('src/main/services/pdf-file-service.ts', 'utf8')

    expect(source).not.toContain('child_process')

    expect(source).not.toMatch(/\bexec\s*\(/)

    expect(source).not.toMatch(/\bspawn\s*\(/)
  })
})
