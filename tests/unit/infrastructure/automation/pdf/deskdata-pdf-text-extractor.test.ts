import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  getText: vi.fn(),
  destroy: vi.fn(),
  setWorker: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile
}))

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    static setWorker = mocks.setWorker

    getText = mocks.getText

    destroy = mocks.destroy
  }
}))

vi.mock('pdf-parse/worker', () => ({
  CanvasFactory: class {},
  getData: () => new Uint8Array()
}))

import {
  DeskDataPdfTextExtractionError,
  DeskDataPdfTextExtractor
} from '@/infrastructure/automation/pdf/deskdata-pdf-text-extractor'

beforeEach(() => {
  mocks.readFile.mockReset()
  mocks.getText.mockReset()
  mocks.destroy.mockReset()
  mocks.readFile.mockResolvedValue(Buffer.from('pdf'))
  mocks.destroy.mockResolvedValue(undefined)
})

describe('DeskDataPdfTextExtractor', () => {
  it('ordena páginas e compõe o texto integral', async () => {
    mocks.getText.mockResolvedValue({
      total: 2,
      pages: [
        { num: 2, text: 'segunda página' },
        { num: 1, text: 'primeira página' }
      ]
    })

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\resultado.pdf')).resolves.toEqual({
      totalPages: 2,
      pages: [
        { pageNumber: 1, text: 'primeira página' },
        { pageNumber: 2, text: 'segunda página' }
      ],
      text: 'primeira página\nsegunda página'
    })
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('rejeita PDF sem texto com mensagem legível em português', async () => {
    mocks.getText.mockResolvedValue({
      total: 1,
      pages: [{ num: 1, text: '   ' }]
    })

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\vazio.pdf')).rejects.toMatchObject({
      name: 'DeskDataPdfTextExtractionError',
      code: 'PDF_TEXT_EMPTY',
      message: 'O PDF da DeskData não possui texto extraível.'
    } satisfies Partial<DeskDataPdfTextExtractionError>)
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('rejeita quantidade incompleta de páginas e sempre destrói o parser', async () => {
    mocks.getText.mockResolvedValue({
      total: 2,
      pages: [{ num: 1, text: 'única página' }]
    })

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\incompleto.pdf')).rejects.toMatchObject({
      code: 'PDF_PAGE_COUNT_MISMATCH',
      message: 'A extração do PDF da DeskData não retornou todas as páginas.'
    })
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('converte falha técnica preservando a causa', async () => {
    const cause = new Error('arquivo ilegível')
    mocks.readFile.mockRejectedValue(cause)

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\falha.pdf')).rejects.toMatchObject({
      code: 'PDF_TEXT_EXTRACTION_FAILED',
      message: 'Não foi possível extrair o texto do PDF da DeskData.',
      cause
    })
    expect(mocks.destroy).not.toHaveBeenCalled()
  })

  it('destrói o parser quando a extração falha após a construção', async () => {
    const cause = new Error('falha interna do parser')
    mocks.getText.mockRejectedValue(cause)

    const extractor = new DeskDataPdfTextExtractor()

    await expect(extractor.extract('E:\\PDF-AGENTE-CPI\\falha-parser.pdf')).rejects.toMatchObject({
      code: 'PDF_TEXT_EXTRACTION_FAILED',
      message: 'Não foi possível extrair o texto do PDF da DeskData.',
      cause
    })
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })
})
