import type { PreparedCpiResearchResult } from './cpi-research-result-controller'

export class CpiResearchResultSimulationReporter {
  format(result: PreparedCpiResearchResult): string[] {
    return [
      'Simulação preparada sem gravação.',
      'Classificação técnica: ' + result.classification,
      'Resultado selecionado: ' + result.selectedResultLabel,
      'Pesquisador/Fonte: ' + result.researcherLabel,
      'Pesquisador/Fonte 1º: ' + result.primaryResearcherLabel,
      'Status: ' + result.statusLabel,
      'Resposta alterada: ' + this.formatBoolean(result.responseChanged),
      'Pesquisa gravada: ' + this.formatBoolean(result.saved),
      'O botão Alterar não foi acionado.'
    ]
  }

  private formatBoolean(value: boolean): string {
    return value ? 'Sim' : 'Não'
  }
}
