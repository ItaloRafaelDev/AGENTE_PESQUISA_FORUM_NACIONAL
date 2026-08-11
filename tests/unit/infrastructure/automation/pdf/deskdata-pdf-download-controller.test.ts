import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Download, Page } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKDATA_PDF_EXPORT_SELECTOR } from '@/infrastructure/automation/deskdata/deskdata-selectors'
import { DeskDataPdfDownloadController } from '@/infrastructure/automation/pdf/deskdata-pdf-download-controller'

type DownloadListener = (download: Download) => void
type PageListener = (page: Page) => void

interface TestPageContext {
  page: Page
  click: ReturnType<typeof vi.fn>
  emitDownload(download: Download): void
  downloadListenerCount(): number
}

interface TestBrowserContext {
  context: BrowserContext
  emitPage(page: Page): void
  pageListenerCount(): number
}

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agente-cpi-deskdata-'))

  temporaryDirectories.push(directory)

  return directory
}

function createTestPage(controlCount = 1): TestPageContext {
  const downloadListeners = new Set<DownloadListener>()
  const click = vi.fn(async () => undefined)

  const page = {
    locator: vi.fn((selector: string) => {
      if (selector !== DESKDATA_PDF_EXPORT_SELECTOR) {
        throw new Error('Seletor inesperado: ' + selector)
      }

      return {
        count: vi.fn(async () => controlCount),
        click
      }
    }),
    on: vi.fn((event: string, listener: unknown) => {
      if (event === 'download') {
        downloadListeners.add(listener as DownloadListener)
      }
    }),
    off: vi.fn((event: string, listener: unknown) => {
      if (event === 'download') {
        downloadListeners.delete(listener as DownloadListener)
      }
    })
  } as unknown as Page

  return {
    page,
    click,
    emitDownload(download: Download): void {
      downloadListeners.forEach((listener) => listener(download))
    },
    downloadListenerCount(): number {
      return downloadListeners.size
    }
  }
}

function createTestBrowserContext(pages: Page[]): TestBrowserContext {
  const pageListeners = new Set<PageListener>()

  const context = {
    pages: vi.fn(() => pages),
    on: vi.fn((event: string, listener: unknown) => {
      if (event === 'page') {
        pageListeners.add(listener as PageListener)
      }
    }),
    off: vi.fn((event: string, listener: unknown) => {
      if (event === 'page') {
        pageListeners.delete(listener as PageListener)
      }
    })
  } as unknown as BrowserContext

  return {
    context,
    emitPage(page: Page): void {
      pageListeners.forEach((listener) => listener(page))
    },
    pageListenerCount(): number {
      return pageListeners.size
    }
  }
}

function createDownload(content: string, onSaved?: (filePath: string) => void): Download {
  return {
    failure: vi.fn(async () => null),
    saveAs: vi.fn(async (filePath: string) => {
      onSaved?.(filePath)
      await writeFile(filePath, content)
    })
  } as unknown as Download
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, {
        recursive: true,
        force: true
      })
    })
  )
})

describe('DeskDataPdfDownloadController', () => {
  it('deve rejeitar tempo limite de ação igual a zero', () => {
    expect(() => new DeskDataPdfDownloadController({ actionTimeoutMs: 0 })).toThrowError(
      new Error('O tempo limite da ação deve ser maior que zero.')
    )
  })

  it('deve capturar o download iniciado na nova aba', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage()
    const popup = createTestPage()
    const browser = createTestBrowserContext([source.page])

    const download = createDownload('%PDF-1.7\nconteudo de teste')

    source.click.mockImplementation(async () => {
      browser.emitPage(popup.page)
      popup.emitDownload(download)
    })

    const result = await new DeskDataPdfDownloadController({
      outputDirectory,
      downloadTimeoutMs: 1_000,
      actionTimeoutMs: 12_345
    }).downloadOnce(browser.context, source.page)

    expect(source.click).toHaveBeenCalledTimes(1)
    expect(source.click).toHaveBeenCalledWith({
      timeout: 12_345
    })
    expect(result.filePath).toMatch(/deskdata-\d{8}-\d{6}-[a-f0-9]{8}\.pdf$/)
    expect(result.sizeBytes).toBeGreaterThan(5)
    expect(await readFile(result.filePath, 'utf8')).toContain('%PDF-')
    expect(browser.pageListenerCount()).toBe(0)
    expect(source.downloadListenerCount()).toBe(0)
    expect(popup.downloadListenerCount()).toBe(0)
  })

  it('deve bloquear uma segunda exportação na mesma execução', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage()
    const browser = createTestBrowserContext([source.page])
    const download = createDownload('%PDF-1.7\narquivo')

    source.click.mockImplementation(async () => {
      source.emitDownload(download)
    })

    const controller = new DeskDataPdfDownloadController({
      outputDirectory,
      downloadTimeoutMs: 1_000
    })

    await controller.downloadOnce(browser.context, source.page)

    await expect(controller.downloadOnce(browser.context, source.page)).rejects.toThrow(
      'O PDF da DeskData já foi exportado ou está sendo exportado nesta execução.'
    )

    expect(source.click).toHaveBeenCalledTimes(1)
  })

  it('deve rejeitar quando o botão Exportar não for único', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage(0)
    const browser = createTestBrowserContext([source.page])

    await expect(
      new DeskDataPdfDownloadController({
        outputDirectory
      }).downloadOnce(browser.context, source.page)
    ).rejects.toThrow('O botão Exportar deveria possuir exatamente um controle. Encontrados: 0')

    expect(source.click).not.toHaveBeenCalled()
  })

  it('deve rejeitar e remover um arquivo que não seja PDF', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage()
    const browser = createTestBrowserContext([source.page])
    let savedPath = ''

    const download = createDownload('arquivo inválido', (filePath) => {
      savedPath = filePath
    })

    source.click.mockImplementation(async () => {
      source.emitDownload(download)
    })

    await expect(
      new DeskDataPdfDownloadController({
        outputDirectory,
        downloadTimeoutMs: 1_000
      }).downloadOnce(browser.context, source.page)
    ).rejects.toThrow('O arquivo baixado não possui uma assinatura PDF válida.')

    expect(savedPath).not.toBe('')
    await expect(access(savedPath)).rejects.toThrow()
    expect(browser.pageListenerCount()).toBe(0)
    expect(source.downloadListenerCount()).toBe(0)
  })

  it('deve remover listeners do contexto, página origem e popup quando o download falhar', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage()
    const popup = createTestPage()
    const browser = createTestBrowserContext([source.page])
    const failedDownload = {
      failure: vi.fn(async () => 'falha remota'),
      saveAs: vi.fn()
    } as unknown as Download

    source.click.mockImplementation(async () => {
      browser.emitPage(popup.page)
      popup.emitDownload(failedDownload)
    })

    await expect(
      new DeskDataPdfDownloadController({ outputDirectory, downloadTimeoutMs: 1_000 }).downloadOnce(
        browser.context,
        source.page
      )
    ).rejects.toThrow('A DeskData informou falha no download do PDF: falha remota')

    expect(browser.pageListenerCount()).toBe(0)
    expect(source.downloadListenerCount()).toBe(0)
    expect(popup.downloadListenerCount()).toBe(0)
  })

  it('deve remover listeners quando o download não inicia dentro do tempo limite', async () => {
    const outputDirectory = await createTemporaryDirectory()
    const source = createTestPage()
    const browser = createTestBrowserContext([source.page])

    await expect(
      new DeskDataPdfDownloadController({ outputDirectory, downloadTimeoutMs: 10 }).downloadOnce(
        browser.context,
        source.page
      )
    ).rejects.toThrow('O download do PDF da DeskData não iniciou dentro do tempo limite.')

    expect(browser.pageListenerCount()).toBe(0)
    expect(source.downloadListenerCount()).toBe(0)
  })
})
