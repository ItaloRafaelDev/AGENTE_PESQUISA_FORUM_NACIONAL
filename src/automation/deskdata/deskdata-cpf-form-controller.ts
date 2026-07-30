import { isValidCpf, maskCpfForLog } from '../../shared/utils/cpf'

export const DESKDATA_SEARCH_SELECTORS = {
  form: 'form#form',

  cpfKeyButton: 'form#form button[title="CPF"]',

  cpfInput: 'form#form input#cpf[name="cpf"][type="text"]',

  searchButton: 'form#form input#search[name="submit"][type="submit"]'
} as const

export interface DeskDataSearchLocator {
  count(): Promise<number>

  fill(
    value: string,
    options?: {
      timeout?: number
    }
  ): Promise<void>

  inputValue(options?: { timeout?: number }): Promise<string>
}

export interface DeskDataSearchPage {
  locator(selector: string): DeskDataSearchLocator
}

export interface FilledDeskDataCpf {
  cpf: string
  maskedCpf: string
}

export interface DeskDataCpfFormControllerOptions {
  actionTimeoutMs?: number
  readTimeoutMs?: number
}

export class DeskDataCpfFormController {
  private readonly actionTimeoutMs: number
  private readonly readTimeoutMs: number

  constructor(options: DeskDataCpfFormControllerOptions = {}) {
    this.actionTimeoutMs = options.actionTimeoutMs ?? 10_000
    this.readTimeoutMs = options.readTimeoutMs ?? 5_000
  }

  async fillCpf(page: DeskDataSearchPage, rawCpf: string): Promise<FilledDeskDataCpf> {
    const cpf = rawCpf.replace(/\D/g, '')

    if (!isValidCpf(cpf)) {
      throw new Error('CPF informado para a DeskData é inválido')
    }

    const cpfInput = page.locator(DESKDATA_SEARCH_SELECTORS.cpfInput)

    if ((await cpfInput.count()) !== 1) {
      throw new Error('Campo CPF da DeskData não encontrado')
    }

    await cpfInput.fill(cpf, {
      timeout: this.actionTimeoutMs
    })

    const persistedCpf = (
      await cpfInput.inputValue({
        timeout: this.readTimeoutMs
      })
    ).replace(/\D/g, '')

    if (persistedCpf !== cpf) {
      throw new Error('A DeskData não manteve o CPF preenchido')
    }

    return {
      cpf,
      maskedCpf: maskCpfForLog(cpf)
    }
  }
}
