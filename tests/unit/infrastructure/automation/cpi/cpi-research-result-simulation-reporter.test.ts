import { describe, expect, it } from 'vitest'
import { CpiResearchResultSimulationReporter } from '@/infrastructure/automation/cpi/cpi-research-result-simulation-reporter'
import type { PreparedCpiResearchResult } from '@/infrastructure/automation/cpi/cpi-research-result-controller'

describe('CpiResearchResultSimulationReporter', () => {
  it('deve gerar somente informações técnicas seguras da simulação', () => {
    const prepared: PreparedCpiResearchResult = {
      classification: 'CONSTA_RESTRICAO',
      selectedResultLabel: 'Sim, Consta Restrições',
      researcherLabel: 'Desk Data',
      primaryResearcherLabel: 'Desk Data',
      statusLabel: 'Respondida',
      responseChanged: false,
      saved: false
    }

    const lines = new CpiResearchResultSimulationReporter().format(prepared)

    expect(lines).toEqual([
      'Simulação preparada sem gravação.',
      'Classificação técnica: CONSTA_RESTRICAO',
      'Resultado selecionado: Sim, Consta Restrições',
      'Pesquisador/Fonte: Desk Data',
      'Pesquisador/Fonte 1º: Desk Data',
      'Status: Respondida',
      'Resposta alterada: Não',
      'Pesquisa gravada: Não',
      'O botão Alterar não foi acionado.'
    ])
  })
})
