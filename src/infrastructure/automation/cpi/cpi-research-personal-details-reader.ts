import { isValidCpf } from '../../../domain/identity/cpf'
import type { ResearchDataFrame } from './cpi-research-identity-reader'
import {
  CPI_RESEARCH_DATA_SELECTORS,
  CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS
} from './cpi-selectors'

export interface CpiResearchPersonalDetails {
  fullName: string
  birthDate: string
}

export class CpiResearchPersonalDetailsReader {
  constructor(private readonly readTimeoutMs = 5_000) {}

  async read(frame: ResearchDataFrame, expectedCpf: string): Promise<CpiResearchPersonalDetails> {
    let path: string
    try {
      path = new URL(frame.url()).pathname.toLowerCase()
    } catch {
      throw new Error('O formulário da pesquisa CPI não está disponível.')
    }
    if (path !== '/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx') {
      throw new Error('O formulário da pesquisa CPI não está disponível.')
    }

    await this.assertSameCpf(frame, expectedCpf)
    const fullName = (await this.readField(frame, CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS.fullName))
      .replace(/\s+/g, ' ')
      .trim()
    const birthDate = (
      await this.readField(frame, CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS.birthDate)
    ).trim()

    if (!/^\p{L}[\p{L}\p{M}'’.-]*(?: [\p{L}\p{M}'’.-]+)+$/u.test(fullName)) {
      throw new Error('O nome completo da pesquisa CPI está ausente ou inválido.')
    }
    if (!this.isValidBirthDate(birthDate)) {
      throw new Error('A data de nascimento da pesquisa CPI está ausente ou inválida.')
    }

    await this.assertSameCpf(frame, expectedCpf)
    return { fullName, birthDate }
  }

  private async assertSameCpf(frame: ResearchDataFrame, expectedCpf: string): Promise<void> {
    const cpf = (await this.readField(frame, CPI_RESEARCH_DATA_SELECTORS.cpfValue)).replace(
      /\D/g,
      ''
    )
    if (!isValidCpf(cpf) || cpf !== expectedCpf.replace(/\D/g, '')) {
      throw new Error('O CPF da pesquisa CPI não corresponde à consulta em andamento.')
    }
  }

  private async readField(frame: ResearchDataFrame, selector: string): Promise<string> {
    try {
      const field = frame.locator(selector)
      if ((await field.count()) !== 1) {
        throw new Error('Campo ausente ou ambíguo')
      }
      return await field.innerText({ timeout: this.readTimeoutMs })
    } catch {
      throw new Error('Não foi possível ler os dados obrigatórios da pesquisa CPI.')
    }
  }

  private isValidBirthDate(value: string): boolean {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false
    const [day, month, year] = value.split('/').map(Number)
    const date = new Date(year, month - 1, day)
    return (
      year >= 1900 &&
      date <= new Date() &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    )
  }
}
