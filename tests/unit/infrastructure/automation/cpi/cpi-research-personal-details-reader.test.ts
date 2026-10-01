import { describe, expect, it, vi } from 'vitest'
import { CpiResearchPersonalDetailsReader } from '@/infrastructure/automation/cpi/cpi-research-personal-details-reader'
import {
  CPI_RESEARCH_DATA_SELECTORS,
  CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS
} from '@/infrastructure/automation/cpi/cpi-selectors'
import type { ResearchDataFrame } from '@/infrastructure/automation/cpi/cpi-research-identity-reader'

function frame(
  values: { cpf?: string; name?: string; birthdate?: string } = {}
): ResearchDataFrame {
  const fields = new Map([
    [CPI_RESEARCH_DATA_SELECTORS.cpfValue, values.cpf ?? '529.982.247-25'],
    [
      CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS.fullName,
      values.name ?? '  Pessoa   Fictícia Teste  '
    ],
    [CPI_RESEARCH_PERSONAL_DETAILS_SELECTORS.birthDate, values.birthdate ?? '29/02/2012']
  ])
  return {
    url: () => 'https://cpi.test/zpersespecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx',
    locator: (selector) => {
      const locator = {
        count: async () => (fields.has(selector) ? 1 : 0),
        first: () => locator,
        innerText: async () => fields.get(selector) ?? ''
      }
      return locator
    }
  }
}

describe('dados pessoais da pesquisa CPI vinculada', () => {
  it('normaliza o nome e mantém a data brasileira da mesma pesquisa', async () => {
    await expect(
      new CpiResearchPersonalDetailsReader().read(frame(), '52998224725')
    ).resolves.toEqual({
      fullName: 'Pessoa Fictícia Teste',
      birthDate: '29/02/2012'
    })
  })

  it.each(['', '31/02/2012', '29/02/2011', '2012-02-29', '01/01/2999'])(
    'rejeita nascimento inválido: %s',
    async (birthdate) => {
      await expect(
        new CpiResearchPersonalDetailsReader().read(frame({ birthdate }), '52998224725')
      ).rejects.toThrow(/nascimento/)
    }
  )

  it('rejeita nome vazio', async () => {
    await expect(
      new CpiResearchPersonalDetailsReader().read(frame({ name: ' ' }), '52998224725')
    ).rejects.toThrow(/nome/)
  })

  it('não consulta dados de outro CPF', async () => {
    await expect(
      new CpiResearchPersonalDetailsReader().read(frame({ cpf: '111.111.111-11' }), '52998224725')
    ).rejects.toThrow(/CPF/)
  })

  it('rejeita frame que não pertence aos detalhes da pesquisa', async () => {
    const current = frame()
    current.url = () => 'https://cpi.test/fila'
    await expect(
      new CpiResearchPersonalDetailsReader().read(current, '52998224725')
    ).rejects.toThrow(/formulário/)
  })

  it('não inclui conteúdo pessoal em erros de leitura', async () => {
    const current = frame()
    current.locator = vi.fn(() => {
      throw new Error('Conteúdo pessoal de teste')
    })
    await expect(
      new CpiResearchPersonalDetailsReader().read(current, '52998224725')
    ).rejects.toThrow('Não foi possível ler')
  })
})
