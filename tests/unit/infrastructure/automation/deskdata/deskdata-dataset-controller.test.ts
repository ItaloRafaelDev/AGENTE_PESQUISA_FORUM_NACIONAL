import { describe, expect, it } from 'vitest'
import { DESKDATA_DATASET_SELECTORS } from '@/infrastructure/automation/deskdata/deskdata-selectors'
import {
  APPROVED_DESKDATA_DATASET_IDS,
  DeskDataDatasetController,
  type DeskDataDatasetLocator,
  type DeskDataDatasetPage
} from '@/infrastructure/automation/deskdata/deskdata-dataset-controller'

interface CheckboxState {
  id: string
  checked: boolean
}

class FakeCheckbox implements DeskDataDatasetLocator {
  constructor(public readonly state: CheckboxState) {}

  count(): Promise<number> {
    return Promise.resolve(1)
  }

  nth(): DeskDataDatasetLocator {
    return this
  }

  getAttribute(name: string): Promise<string | null> {
    return Promise.resolve(name === 'id' ? this.state.id : null)
  }

  isChecked(): Promise<boolean> {
    return Promise.resolve(this.state.checked)
  }

  async evaluate(_callback: unknown, shouldBeChecked: boolean): Promise<void> {
    this.state.checked = shouldBeChecked
  }
}

class FakeCheckboxCollection implements DeskDataDatasetLocator {
  constructor(private readonly checkboxes: FakeCheckbox[]) {}

  count(): Promise<number> {
    return Promise.resolve(this.checkboxes.length)
  }

  nth(index: number): DeskDataDatasetLocator {
    const checkbox = this.checkboxes[index]

    if (!checkbox) {
      throw new Error(`Checkbox inexistente: ${index}`)
    }

    return checkbox
  }

  getAttribute(): Promise<null> {
    return Promise.resolve(null)
  }

  isChecked(): Promise<boolean> {
    return Promise.resolve(false)
  }

  evaluate(): Promise<void> {
    return Promise.resolve()
  }
}

class FakePage implements DeskDataDatasetPage {
  constructor(private readonly locatorResult: DeskDataDatasetLocator) {}

  locator(selector: string): DeskDataDatasetLocator {
    if (selector !== DESKDATA_DATASET_SELECTORS.allCheckboxes) {
      throw new Error(`Seletor inesperado: ${selector}`)
    }

    return this.locatorResult
  }
}

function createCheckboxes(missingId?: string): FakeCheckbox[] {
  const states = [
    ...APPROVED_DESKDATA_DATASET_IDS.filter((id) => id !== missingId).map((id) => ({
      id,
      checked: false
    })),
    {
      id: 'related_people',
      checked: true
    },
    {
      id: 'financial_data',
      checked: true
    },
    {
      id: 'dados-pessoais-todos',
      checked: true
    }
  ]

  return states.map((state) => new FakeCheckbox(state))
}

describe('DeskDataDatasetController', () => {
  it('deve selecionar somente os seis conjuntos aprovados', async () => {
    const checkboxes = createCheckboxes()
    const controller = new DeskDataDatasetController()

    const result = await controller.applyApprovedDatasets(
      new FakePage(new FakeCheckboxCollection(checkboxes))
    )

    expect(result).toEqual({
      selectedIds: [
        'basic_data',
        'emails_extended',
        'addresses_extended',
        'phones_extended',
        'occupation_data',
        'processes'
      ],
      selectedCount: 6
    })

    for (const checkbox of checkboxes) {
      const shouldBeChecked = APPROVED_DESKDATA_DATASET_IDS.includes(
        checkbox.state.id as (typeof APPROVED_DESKDATA_DATASET_IDS)[number]
      )

      expect(checkbox.state.checked).toBe(shouldBeChecked)
    }
  })

  it('deve selecionar somente Processos', async () => {
    const checkboxes = createCheckboxes()
    const controller = new DeskDataDatasetController()

    const result = await controller.applyDatasetIds(
      new FakePage(new FakeCheckboxCollection(checkboxes)),
      ['processes']
    )

    expect(result).toEqual({
      selectedIds: ['processes'],
      selectedCount: 1
    })

    for (const checkbox of checkboxes) {
      expect(checkbox.state.checked).toBe(checkbox.state.id === 'processes')
    }
  })

  it('deve falhar quando um conjunto solicitado não existir', async () => {
    const controller = new DeskDataDatasetController()

    await expect(
      controller.applyDatasetIds(
        new FakePage(new FakeCheckboxCollection(createCheckboxes('processes'))),
        ['processes']
      )
    ).rejects.toThrow('Conjuntos obrigatórios não encontrados na DeskData: processes')
  })

  it('deve falhar quando nenhum checkbox existir', async () => {
    const controller = new DeskDataDatasetController()

    await expect(
      controller.applyDatasetIds(new FakePage(new FakeCheckboxCollection([])), ['processes'])
    ).rejects.toThrow('Nenhum conjunto de dados foi encontrado na DeskData')
  })

  it('deve rejeitar uma seleção vazia', async () => {
    const controller = new DeskDataDatasetController()

    await expect(
      controller.applyDatasetIds(new FakePage(new FakeCheckboxCollection(createCheckboxes())), [])
    ).rejects.toThrow('Informe pelo menos um conjunto de dados da DeskData')
  })
})
