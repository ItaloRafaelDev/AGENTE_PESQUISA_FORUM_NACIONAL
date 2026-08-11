import { DESKDATA_PDF_EXPORT_SELECTOR } from './deskdata-selectors'

export interface DeskDataResultReadyLocator {
  count(): Promise<number>
}

export interface DeskDataResultReadyPage {
  url(): string
  locator(selector: string): DeskDataResultReadyLocator
  waitForTimeout(milliseconds: number): Promise<void>
}

export interface DeskDataResultReadyWaiterOptions {
  searchAttempts?: number
  searchIntervalMs?: number
}

export interface DeskDataResultReadySnapshot {
  status: 'READY'
  resultPath: string
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')

  return normalized || '/'
}

export class DeskDataResultReadyWaiter {
  private readonly searchAttempts: number
  private readonly searchIntervalMs: number

  constructor(options: DeskDataResultReadyWaiterOptions = {}) {
    this.searchAttempts = options.searchAttempts ?? 180
    this.searchIntervalMs = options.searchIntervalMs ?? 500

    if (this.searchAttempts < 1) {
      throw new Error('O numero de tentativas do resultado deve ser maior que zero.')
    }

    if (this.searchIntervalMs < 0) {
      throw new Error('O intervalo de espera do resultado nao pode ser negativo.')
    }
  }

  async waitUntilReady(page: DeskDataResultReadyPage): Promise<DeskDataResultReadySnapshot> {
    const exportControl = page.locator(DESKDATA_PDF_EXPORT_SELECTOR)

    for (let attempt = 0; attempt < this.searchAttempts; attempt += 1) {
      const resultPath = this.extractPath(page.url())
      const exportCount = await exportControl.count().catch(() => 0)

      if (exportCount > 1) {
        throw new Error(
          'O botao Exportar deveria possuir exatamente um controle. Encontrados: ' + exportCount
        )
      }

      if (this.isSupportedResultPath(resultPath) && exportCount === 1) {
        return {
          status: 'READY',
          resultPath
        }
      }

      if (attempt < this.searchAttempts - 1) {
        await page.waitForTimeout(this.searchIntervalMs)
      }
    }

    throw new Error('O resultado da DeskData nao ficou disponivel dentro do tempo limite.')
  }

  private isSupportedResultPath(resultPath: string): boolean {
    const normalizedPath = normalizePath(resultPath)

    return (
      normalizedPath === '/pessoas/resultado' ||
      normalizedPath.startsWith('/pessoas/resultado/') ||
      normalizedPath === '/historico/detalhes'
    )
  }

  private extractPath(pageUrl: string): string {
    try {
      return new URL(pageUrl).pathname
    } catch {
      return ''
    }
  }
}
