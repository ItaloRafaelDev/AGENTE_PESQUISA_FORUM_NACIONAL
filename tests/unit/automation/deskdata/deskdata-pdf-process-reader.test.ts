import { describe, expect, it, vi } from 'vitest'
import {
  DeskDataPdfProcessReader,
  type DeskDataPdfProcessParsingPort,
  type DeskDataPdfTextExtractionPort
} from '@/automation/deskdata/deskdata-pdf-process-reader'
import type { DeskDataPdfTextSnapshot } from '@/automation/deskdata/deskdata-pdf-text-snapshot'

const snapshot: DeskDataPdfTextSnapshot = {
  totalPages: 1,
  pages: [
    {
      pageNumber: 1,
      text: 'Numero 0000000-00.2026.0.00.0000\nEsfera Criminal'
    }
  ],
  text: 'Numero 0000000-00.2026.0.00.0000\nEsfera Criminal'
}

describe('DeskDataPdfProcessReader', () => {
  it('encaminha o snapshot extraído ao parser sem alterar os dados', async () => {
    const records = [
      {
        processKey: '0000000-00.2026.0.00.0000',
        processNumber: '0000000-00.2026.0.00.0000',
        sphereRaw: 'Criminal',
        sourcePage: 1
      }
    ]
    const extractor: DeskDataPdfTextExtractionPort = {
      extract: vi.fn().mockResolvedValue(snapshot)
    }
    const parser: DeskDataPdfProcessParsingPort = {
      parse: vi.fn().mockReturnValue(records)
    }
    const reader = new DeskDataPdfProcessReader(extractor, parser)

    await expect(reader.read('E:\\PDF-AGENTE-CPI\\resultado.pdf')).resolves.toEqual(records)
    expect(extractor.extract).toHaveBeenCalledOnce()
    expect(extractor.extract).toHaveBeenCalledWith('E:\\PDF-AGENTE-CPI\\resultado.pdf')
    expect(parser.parse).toHaveBeenCalledOnce()
    expect(parser.parse).toHaveBeenCalledWith(snapshot)
    expect(vi.mocked(parser.parse).mock.calls[0]?.[0]).toBe(snapshot)
  })

  it('propaga a falha do extrator sem executar o parser', async () => {
    const extractionError = new Error('Falha de extração')
    const extractor: DeskDataPdfTextExtractionPort = {
      extract: vi.fn().mockRejectedValue(extractionError)
    }
    const parser: DeskDataPdfProcessParsingPort = {
      parse: vi.fn()
    }
    const reader = new DeskDataPdfProcessReader(extractor, parser)

    await expect(reader.read('E:\\PDF-AGENTE-CPI\\resultado.pdf')).rejects.toBe(extractionError)
    expect(parser.parse).not.toHaveBeenCalled()
  })

  it('propaga a falha do parser sem alterar o erro', async () => {
    const parsingError = new Error('Falha de parsing')
    const extractor: DeskDataPdfTextExtractionPort = {
      extract: vi.fn().mockResolvedValue(snapshot)
    }
    const parser: DeskDataPdfProcessParsingPort = {
      parse: vi.fn().mockImplementation(() => {
        throw parsingError
      })
    }
    const reader = new DeskDataPdfProcessReader(extractor, parser)

    await expect(reader.read('E:\\PDF-AGENTE-CPI\\resultado.pdf')).rejects.toBe(parsingError)
    expect(extractor.extract).toHaveBeenCalledOnce()
  })
})
