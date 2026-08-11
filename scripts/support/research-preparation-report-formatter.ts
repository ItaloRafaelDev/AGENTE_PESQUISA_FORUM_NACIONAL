import type { ResearchPreparationReportInput } from '../../src/application/research/research-preparation-model'
import { getCpiClassificationLabel } from '../../src/domain/research/get-cpi-classification-label'

export function formatResearchPreparationReport(input: ResearchPreparationReportInput): string[] {
  const { classification, evidence } = input.classification
  const normalizedSpheres =
    evidence.normalizedSpheres.length > 0
      ? evidence.normalizedSpheres.join(', ')
      : 'Nenhuma identificada'

  return [
    `Classificação técnica: ${evidence.result}`,
    `Resultado destinado à CPI: ${getCpiClassificationLabel(classification)}`,
    `Motivo técnico: ${evidence.reason}`,
    `Total de processos: ${evidence.totalProcesses}`,
    `Esferas normalizadas: ${normalizedSpheres}`
  ]
}
