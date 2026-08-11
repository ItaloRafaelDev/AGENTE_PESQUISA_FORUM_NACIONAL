import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import { DeskDataPdfReportAdapter } from '@/infrastructure/automation/pdf/deskdata-pdf-report-adapter'

describe('DeskDataPdfReportAdapter', () => {
  it('downloads once and preserves the compatibility path', async () => {
    const context = { id: 'deskdata-context' } as unknown as BrowserContext
    const page = { id: 'deskdata-result-page' } as unknown as Page
    const downloadOnce = vi
      .fn()
      .mockResolvedValue({ filePath: 'C:\\safe\\report.pdf', sizeBytes: 42 })
    const read = vi.fn().mockResolvedValue([])
    const resultPage = vi.fn(() => page)
    const adapter = new DeskDataPdfReportAdapter(context, resultPage, { downloadOnce }, { read })

    await expect(adapter.create()).resolves.toEqual({
      reference: 'C:\\safe\\report.pdf',
      compatibilityPath: 'C:\\safe\\report.pdf',
      sizeBytes: 42
    })
    await expect(adapter.readProcesses('C:\\safe\\report.pdf')).resolves.toEqual([])
    expect(resultPage).toHaveBeenCalledTimes(1)
    expect(downloadOnce).toHaveBeenCalledTimes(1)
    expect(downloadOnce).toHaveBeenCalledWith(context, page)
    expect(read).toHaveBeenCalledWith('C:\\safe\\report.pdf')
  })

  it('propagates the safe unresolved-result error without downloading', async () => {
    const safeError = new Error('O resultado da DeskData não foi resolvido para gerar o relatório.')
    const resultPage = vi.fn(() => {
      throw safeError
    })
    const downloadOnce = vi.fn()
    const adapter = new DeskDataPdfReportAdapter(
      { id: 'deskdata-context' } as unknown as BrowserContext,
      resultPage,
      { downloadOnce },
      { read: vi.fn() }
    )

    await expect(adapter.create()).rejects.toBe(safeError)
    expect(resultPage).toHaveBeenCalledTimes(1)
    expect(downloadOnce).not.toHaveBeenCalled()
  })
})
