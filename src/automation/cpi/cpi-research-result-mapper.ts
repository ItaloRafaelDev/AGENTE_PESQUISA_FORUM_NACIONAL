import type { ResearchClassification } from '../../domain/research/research-classification'

export interface CpiResearchResultOption {
  selector: string
  label: string
}

const CPI_RESEARCH_RESULT_OPTIONS: Record<ResearchClassification, CpiResearchResultOption> = {
  CONSTA_RESTRICAO: {
    selector: '#consta3',
    label: 'Sim, Consta Restrições'
  },
  HA_INFORMACOES: {
    selector: '#consta2',
    label: 'Há Informações'
  },
  NADA_CONSTA: {
    selector: '#consta1',
    label: 'Nada Consta'
  },
  INDEFINIDO: {
    selector: '#consta2',
    label: 'Há Informações'
  }
}

export function mapResearchClassificationToCpiResult(
  classification: ResearchClassification
): CpiResearchResultOption {
  return CPI_RESEARCH_RESULT_OPTIONS[classification]
}
