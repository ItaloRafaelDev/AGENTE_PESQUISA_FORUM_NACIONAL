import { getCpiClassificationLabel } from '../../domain/research/get-cpi-classification-label'
import type { DeskDataInspectionClassification } from './deskdata-inspection-classifier'

export class DeskDataClassificationReportFormatter {
  format(result: DeskDataInspectionClassification): string[] {
    return [
      `Classificação técnica: ${result.classification}`,
      `Resultado destinado à CPI: ${getCpiClassificationLabel(result.classification)}`,
      `Possui processos: ${this.formatBoolean(result.summary.hasProcesses)}`,
      `Possui processos criminais: ${this.formatBoolean(result.summary.hasCriminalProcesses)}`,
      `Natureza identificável: ${this.formatBoolean(result.summary.isProcessNatureIdentifiable)}`,
      `Resultado válido: ${this.formatBoolean(result.summary.isResultValid)}`
    ]
  }

  private formatBoolean(value: boolean): string {
    return value ? 'Sim' : 'Não'
  }
}
