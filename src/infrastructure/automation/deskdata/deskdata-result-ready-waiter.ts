import {
  DESKDATA_PDF_EXPORT_SELECTOR,
  DESKDATA_PROCESSES_SECTION_SELECTOR,
  DESKDATA_PROCESSES_UPDATED_SELECTOR
} from './deskdata-selectors'

export interface DeskDataResultReadyLocator {
  count(): Promise<number>
  textContent(): Promise<string | null>
}

export interface DeskDataResultReadyPage {
  url(): string
  locator(selector: string): DeskDataResultReadyLocator
  waitForTimeout(milliseconds: number): Promise<void>
}

export interface DeskDataResultReadyWaiterOptions {
  searchAttempts?: number
  searchIntervalMs?: number
  settledContentChecks?: number
}

export interface DeskDataResultReadySnapshot {
  status: 'READY'
  resultPath: string
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '')

  return normalized || '/'
}

const PROCESS_NUMBER_PATTERN = /\b\d{4,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/
const NO_PROCESSES_PATTERN = /\b(nao foram encontrados processos|nenhum processo encontrado)\b/
const DEFAULT_SETTLED_CONTENT_CHECKS = 11

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export class DeskDataResultReadyWaiter {
  private readonly searchAttempts: number
  private readonly searchIntervalMs: number
  private readonly settledContentChecks: number

  constructor(options: DeskDataResultReadyWaiterOptions = {}) {
    this.searchAttempts = options.searchAttempts ?? 180
    this.searchIntervalMs = options.searchIntervalMs ?? 500
    this.settledContentChecks = options.settledContentChecks ?? DEFAULT_SETTLED_CONTENT_CHECKS

    if (this.searchAttempts < 1) {
      throw new Error('O numero de tentativas do resultado deve ser maior que zero.')
    }

    if (this.searchIntervalMs < 0) {
      throw new Error('O intervalo de espera do resultado nao pode ser negativo.')
    }

    if (this.settledContentChecks < 1) {
      throw new Error('A quantidade de verificacoes estaveis deve ser maior que zero.')
    }
  }

  async waitUntilReady(page: DeskDataResultReadyPage): Promise<DeskDataResultReadySnapshot> {
    const exportControl = page.locator(DESKDATA_PDF_EXPORT_SELECTOR)
    const processesSection = page.locator(DESKDATA_PROCESSES_SECTION_SELECTOR)
    const processesUpdatedNotice = page.locator(DESKDATA_PROCESSES_UPDATED_SELECTOR)
    let processesUpdateConfirmed = false
    let lastTerminalContent = ''
    let settledChecks = 0

    for (let attempt = 0; attempt < this.searchAttempts; attempt += 1) {
      const resultPath = this.extractPath(page.url())
      const exportCount = await exportControl.count().catch(() => 0)

      if (exportCount > 1) {
        throw new Error(
          'O botao Exportar deveria possuir exatamente um controle. Encontrados: ' + exportCount
        )
      }

      if (this.isSupportedResultPath(resultPath) && exportCount === 1) {
        const processesUpdatedCount = await processesUpdatedNotice.count().catch(() => 0)
        const processesCount = await processesSection.count().catch(() => 0)

        processesUpdateConfirmed ||= processesUpdatedCount > 0

        if (processesCount > 1) {
          throw new Error(
            'A secao Processos deveria possuir exatamente um elemento. Encontrados: ' +
              processesCount
          )
        }

        const processesContent =
          processesCount === 1 ? await processesSection.textContent().catch(() => null) : null

        const normalizedProcessesContent = normalizeText(processesContent ?? '')
        const hasTerminalProcessesContent =
          PROCESS_NUMBER_PATTERN.test(processesContent ?? '') ||
          NO_PROCESSES_PATTERN.test(normalizedProcessesContent)

        if (processesUpdateConfirmed && hasTerminalProcessesContent) {
          if (normalizedProcessesContent === lastTerminalContent) {
            settledChecks += 1
          } else {
            lastTerminalContent = normalizedProcessesContent
            settledChecks = 1
          }

          if (settledChecks >= this.settledContentChecks) {
            return {
              status: 'READY',
              resultPath
            }
          }
        } else {
          lastTerminalContent = ''
          settledChecks = 0
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
