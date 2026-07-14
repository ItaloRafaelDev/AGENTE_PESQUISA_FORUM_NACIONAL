import { describe, expect, it } from 'vitest'
import { AGENT_STATES } from '@/domain/agent/agent-state'

describe('AGENT_STATES', () => {
  it('deve definir todos os estados operacionais aprovados para o agente', () => {
    expect(AGENT_STATES).toEqual([
      'PARADO',
      'INICIALIZANDO',
      'AGUARDANDO_LOGIN',
      'PRONTO',
      'PROCESSANDO',
      'PAUSANDO',
      'PAUSADO',
      'AGUARDANDO_NOVA_PESQUISA',
      'ERRO_TEMPORARIO',
      'PAUSADO_POR_SEGURANCA',
      'ENCERRANDO'
    ])
  })
})
