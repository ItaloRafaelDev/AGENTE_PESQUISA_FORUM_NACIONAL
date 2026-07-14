import { setTimeout as wait } from 'node:timers/promises'
import type { ResearchClassification } from '../../domain/research/research-classification'
import { mapResearchClassificationToCpiResult } from './cpi-research-result-mapper'

export interface CpiResearchResultLocator {
  count(): Promise<number>
  click?(): Promise<unknown>
  isChecked?(): Promise<boolean>
  selectOption?(option: { label: string }): Promise<unknown>
  innerText?(options?: { timeout?: number }): Promise<string>
}

export interface CpiResearchResultFrame {
  locator(selector: string): CpiResearchResultLocator
}

export interface CpiResearchResultControllerOptions {
  resultSearchAttempts?: number
  resultSearchIntervalMs?: number
  stabilizationAttempts?: number
}

export interface PreparedCpiResearchResult {
  classification: ResearchClassification
  selectedResultLabel: string
  researcherLabel: string
  primaryResearcherLabel: string
  statusLabel: string
  responseChanged: false
  saved: false
}

const RESEARCHER_SELECTOR = 'select[name="id_pesquisador"]'

const PRIMARY_RESEARCHER_SELECTOR = 'select[name="id_pesquisador_prim"]'

const STATUS_SELECTOR = 'select[name="id_pesq_status"]'

const RESEARCHER_LABEL = 'Desk Data'
const STATUS_LABEL = 'Respondida'

export class CpiResearchResultController {
  private readonly resultSearchAttempts: number
  private readonly resultSearchIntervalMs: number
  private readonly stabilizationAttempts: number

  constructor(options: CpiResearchResultControllerOptions = {}) {
    this.resultSearchAttempts = options.resultSearchAttempts ?? 40

    this.resultSearchIntervalMs = options.resultSearchIntervalMs ?? 250

    this.stabilizationAttempts = options.stabilizationAttempts ?? 3

    if (this.resultSearchAttempts < 1) {
      throw new Error('Número de tentativas deve ser maior que zero.')
    }

    if (this.resultSearchIntervalMs < 0) {
      throw new Error('Intervalo de busca não pode ser negativo.')
    }

    if (this.stabilizationAttempts < 1) {
      throw new Error('Número de estabilizações deve ser maior que zero.')
    }
  }

  async prepare(
    frame: CpiResearchResultFrame,
    classification: ResearchClassification
  ): Promise<PreparedCpiResearchResult> {
    const resultOption = mapResearchClassificationToCpiResult(classification)

    for (let attempt = 0; attempt < this.stabilizationAttempts; attempt += 1) {
      await this.selectByLabel(frame, STATUS_SELECTOR, STATUS_LABEL, 'Status')

      const resultRadio = await this.waitForSingleControl(
        frame,
        resultOption.selector,
        'Opção de resultado da CPI'
      )

      const resultId = resultOption.selector.replace(/^#/, '')

      const resultLabel = await this.waitForSingleControl(
        frame,
        'label[for="' + resultId + '"]',
        'Rótulo visível da opção de resultado da CPI'
      )

      await this.selectByLabel(frame, RESEARCHER_SELECTOR, RESEARCHER_LABEL, 'Pesquisador/Fonte')

      await this.selectByLabel(
        frame,
        PRIMARY_RESEARCHER_SELECTOR,
        RESEARCHER_LABEL,
        'Pesquisador/Fonte 1º'
      )

      if (!resultLabel.click) {
        throw new Error('O rótulo da opção de resultado não permite clique.')
      }

      await resultLabel.click()

      if (await this.isPreparedState(frame, resultRadio, resultOption.label)) {
        return {
          classification,
          selectedResultLabel: resultOption.label,
          researcherLabel: RESEARCHER_LABEL,
          primaryResearcherLabel: RESEARCHER_LABEL,
          statusLabel: STATUS_LABEL,
          responseChanged: false,
          saved: false
        }
      }

      if (attempt < this.stabilizationAttempts - 1) {
        await wait(this.resultSearchIntervalMs)
      }
    }

    throw new Error('Os campos da CPI não permaneceram estáveis. ' + 'A gravação foi bloqueada.')
  }

  private async selectByLabel(
    frame: CpiResearchResultFrame,
    selector: string,
    label: string,
    fieldName: string
  ): Promise<void> {
    const control = await this.waitForSingleControl(frame, selector, fieldName)

    if (!control.selectOption) {
      throw new Error(fieldName + ' não permite seleção.')
    }

    await control.selectOption({ label })
  }

  private async isPreparedState(
    frame: CpiResearchResultFrame,
    resultRadio: CpiResearchResultLocator,
    expectedResultLabel: string
  ): Promise<boolean> {
    const [statusOk, researcherOk, primaryResearcherOk] = await Promise.all([
      this.hasSelectedLabel(frame, STATUS_SELECTOR, STATUS_LABEL, 'Status'),
      this.hasSelectedLabel(frame, RESEARCHER_SELECTOR, RESEARCHER_LABEL, 'Pesquisador/Fonte'),
      this.hasSelectedLabel(
        frame,
        PRIMARY_RESEARCHER_SELECTOR,
        RESEARCHER_LABEL,
        'Pesquisador/Fonte 1º'
      )
    ])

    if (!resultRadio.isChecked) {
      throw new Error('Não foi possível confirmar a opção de resultado.')
    }

    const resultOk = await resultRadio.isChecked()

    return (
      statusOk && researcherOk && primaryResearcherOk && resultOk && expectedResultLabel.length > 0
    )
  }

  private async hasSelectedLabel(
    frame: CpiResearchResultFrame,
    selector: string,
    expectedLabel: string,
    fieldName: string
  ): Promise<boolean> {
    const selectedOption = frame.locator(selector + ' option:checked')

    const selectedCount = await selectedOption.count().catch(() => 0)

    if (selectedCount === 0) {
      return false
    }

    if (selectedCount !== 1) {
      throw new Error(
        fieldName +
          ' deveria possuir exatamente uma opção selecionada. Encontradas: ' +
          selectedCount
      )
    }

    if (!selectedOption.innerText) {
      throw new Error('Não foi possível ler a opção selecionada de ' + fieldName + '.')
    }

    const selectedLabel = this.normalizeLabel(
      await selectedOption.innerText({
        timeout: 5_000
      })
    )

    return selectedLabel === this.normalizeLabel(expectedLabel)
  }

  private normalizeLabel(value: string): string {
    return value.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  }

  private async waitForSingleControl(
    frame: CpiResearchResultFrame,
    selector: string,
    fieldName: string
  ): Promise<CpiResearchResultLocator> {
    const control = frame.locator(selector)

    for (let attempt = 0; attempt < this.resultSearchAttempts; attempt += 1) {
      const count = await control.count()

      if (count === 1) {
        return control
      }

      if (count > 1) {
        throw new Error(
          fieldName + ' deveria possuir exatamente um controle. Encontrados: ' + count
        )
      }

      if (attempt < this.resultSearchAttempts - 1) {
        await wait(this.resultSearchIntervalMs)
      }
    }

    throw new Error(fieldName + ' não apareceu após aguardar a renderização.')
  }
}
