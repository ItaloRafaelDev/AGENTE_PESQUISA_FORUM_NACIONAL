import { describe, expect, it } from 'vitest'
import {
  DESKDATA_SEARCH_SELECTORS,
  DeskDataCpfFormController,
  type DeskDataSearchLocator,
  type DeskDataSearchPage
} from '@/automation/deskdata/deskdata-cpf-form-controller'

class FakeLocator implements DeskDataSearchLocator {
  public readonly filledValues: string[] = []
  private currentValue: string

  constructor(
    private readonly elementCount: number,
    initialValue = ''
  ) {
    this.currentValue = initialValue
  }

  count(): Promise<number> {
    return Promise.resolve(this.elementCount)
  }

  async fill(value: string): Promise<void> {
    this.filledValues.push(value)
    this.currentValue = value
  }

  inputValue(): Promise<string> {
    return Promise.resolve(this.currentValue)
  }
}

class FakePage implements DeskDataSearchPage {
  constructor(private readonly controls: Map<string, DeskDataSearchLocator>) {}

  locator(selector: string): DeskDataSearchLocator {
    return this.controls.get(selector) ?? new FakeLocator(0)
  }
}

describe('DeskDataCpfFormController', () => {
  it('deve preencher o CPF validado no formulário da DeskData', async () => {
    const cpfInput = new FakeLocator(1)

    const page = new FakePage(new Map([[DESKDATA_SEARCH_SELECTORS.cpfInput, cpfInput]]))

    const controller = new DeskDataCpfFormController()

    await expect(controller.fillCpf(page, '529.982.247-25')).resolves.toEqual({
      cpf: '52998224725',
      maskedCpf: '***.***.***-25'
    })

    expect(cpfInput.filledValues).toEqual(['52998224725'])
  })

  it('deve rejeitar um CPF inválido', async () => {
    const controller = new DeskDataCpfFormController()

    const page = new FakePage(new Map())

    await expect(controller.fillCpf(page, '111.111.111-11')).rejects.toThrow(
      'CPF informado para a DeskData é inválido'
    )
  })

  it('deve falhar quando o campo CPF não existir', async () => {
    const controller = new DeskDataCpfFormController()

    const page = new FakePage(new Map())

    await expect(controller.fillCpf(page, '52998224725')).rejects.toThrow(
      'Campo CPF da DeskData não encontrado'
    )
  })

  it('deve confirmar que o CPF permaneceu preenchido', async () => {
    class RejectingLocator implements DeskDataSearchLocator {
      count(): Promise<number> {
        return Promise.resolve(1)
      }

      fill(): Promise<void> {
        return Promise.resolve()
      }

      inputValue(): Promise<string> {
        return Promise.resolve('')
      }
    }

    const page = new FakePage(
      new Map([[DESKDATA_SEARCH_SELECTORS.cpfInput, new RejectingLocator()]])
    )

    const controller = new DeskDataCpfFormController()

    await expect(controller.fillCpf(page, '52998224725')).rejects.toThrow(
      'A DeskData não manteve o CPF preenchido'
    )
  })
})
