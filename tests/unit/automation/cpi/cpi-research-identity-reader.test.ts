import { describe, expect, it } from 'vitest'
import {
  CPI_RESEARCH_DATA_SELECTORS,
  CpiResearchIdentityReader,
  type ResearchDataFrame,
  type ResearchDataLocator,
  type ResearchDataPage
} from '@/automation/cpi/cpi-research-identity-reader'

class FakeLocator implements ResearchDataLocator {
  public innerTextTimeoutMs: number | undefined
  private countIndex = 0

  constructor(
    private readonly counts: number[],
    private readonly text = ''
  ) {}

  count(): Promise<number> {
    const index = Math.min(this.countIndex, this.counts.length - 1)

    this.countIndex += 1

    return Promise.resolve(this.counts[index] ?? 0)
  }

  first(): ResearchDataLocator {
    return this
  }

  innerText(options?: { timeout?: number }): Promise<string> {
    this.innerTextTimeoutMs = options?.timeout

    return Promise.resolve(this.text)
  }
}

class FakeFrame implements ResearchDataFrame {
  constructor(
    private readonly frameUrl: string,
    private readonly controls = new Map<string, ResearchDataLocator>()
  ) {}

  url(): string {
    return this.frameUrl
  }

  locator(selector: string): ResearchDataLocator {
    return this.controls.get(selector) ?? new FakeLocator([0])
  }
}

class FakePage implements ResearchDataPage {
  constructor(private readonly frameList: ResearchDataFrame[]) {}

  frames(): ResearchDataFrame[] {
    return this.frameList
  }
}

const detailUrl =
  'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx?id_cadastro=123'

function createReader(readTimeoutMs = 4_321): CpiResearchIdentityReader {
  return new CpiResearchIdentityReader({
    searchAttempts: 3,
    searchIntervalMs: 1,
    readTimeoutMs
  })
}

describe('CpiResearchIdentityReader', () => {
  it('deve capturar e validar o CPF da pesquisa aberta', async () => {
    const frame = new FakeFrame(
      detailUrl,
      new Map([[CPI_RESEARCH_DATA_SELECTORS.cpfValue, new FakeLocator([1], '529.982.247-25')]])
    )
    const cpfLocator = frame.locator(CPI_RESEARCH_DATA_SELECTORS.cpfValue) as FakeLocator

    await expect(createReader().read(new FakePage([frame]))).resolves.toEqual({
      cpf: '52998224725',
      maskedCpf: '***.***.***-25',
      detailFramePath: '/zpersEspecial/pesquisas/upd_cad/mod_tt_pesq_upd.aspx'
    })

    expect(cpfLocator.innerTextTimeoutMs).toBe(4_321)
  })

  it('deve aguardar o campo CPF terminar de renderizar', async () => {
    const delayedCpf = new FakeLocator([0, 0, 1], '529.982.247-25')

    const frame = new FakeFrame(
      detailUrl,
      new Map([[CPI_RESEARCH_DATA_SELECTORS.cpfValue, delayedCpf]])
    )

    await expect(createReader().read(new FakePage([frame]))).resolves.toMatchObject({
      cpf: '52998224725',
      maskedCpf: '***.***.***-25'
    })
  })

  it('deve falhar quando o formulário não estiver aberto', async () => {
    await expect(createReader().read(new FakePage([]))).rejects.toThrow(
      'Formulário interno da pesquisa da CPI não encontrado'
    )
  })

  it('deve falhar quando o campo CPF não aparecer', async () => {
    const frame = new FakeFrame(
      detailUrl,
      new Map([[CPI_RESEARCH_DATA_SELECTORS.cpfValue, new FakeLocator([0, 0, 0])]])
    )

    await expect(createReader().read(new FakePage([frame]))).rejects.toThrow(
      'Campo CPF da pesquisa da CPI não encontrado'
    )
  })

  it('deve rejeitar um CPF inválido capturado na página', async () => {
    const frame = new FakeFrame(
      detailUrl,
      new Map([[CPI_RESEARCH_DATA_SELECTORS.cpfValue, new FakeLocator([1], '111.111.111-11')]])
    )

    await expect(createReader().read(new FakePage([frame]))).rejects.toThrow(
      'CPF capturado na CPI é inválido'
    )
  })
})
