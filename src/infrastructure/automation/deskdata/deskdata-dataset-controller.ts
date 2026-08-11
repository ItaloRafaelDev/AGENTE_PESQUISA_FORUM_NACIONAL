import { DESKDATA_DATASET_SELECTORS } from './deskdata-selectors'

export const APPROVED_DESKDATA_DATASET_IDS = [
  'basic_data',
  'emails_extended',
  'addresses_extended',
  'phones_extended',
  'occupation_data',
  'processes'
] as const

export interface DeskDataDatasetLocator {
  count(): Promise<number>

  nth(index: number): DeskDataDatasetLocator

  getAttribute(name: string): Promise<string | null>

  isChecked(): Promise<boolean>

  evaluate(
    callback: (element: Element, shouldBeChecked: boolean) => void,
    shouldBeChecked: boolean
  ): Promise<void>
}

export interface DeskDataDatasetPage {
  locator(selector: string): DeskDataDatasetLocator
}

export interface DeskDataDatasetSnapshot {
  selectedIds: string[]
  selectedCount: number
}

export class DeskDataDatasetController {
  applyApprovedDatasets(page: DeskDataDatasetPage): Promise<DeskDataDatasetSnapshot> {
    return this.applyDatasetIds(page, APPROVED_DESKDATA_DATASET_IDS)
  }

  async applyDatasetIds(
    page: DeskDataDatasetPage,
    requestedIds: readonly string[]
  ): Promise<DeskDataDatasetSnapshot> {
    const selectedIds = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))]

    if (selectedIds.length === 0) {
      throw new Error('Informe pelo menos um conjunto de dados da DeskData')
    }

    const checkboxes = page.locator(DESKDATA_DATASET_SELECTORS.allCheckboxes)

    const checkboxCount = await checkboxes.count()

    if (checkboxCount === 0) {
      throw new Error('Nenhum conjunto de dados foi encontrado na DeskData')
    }

    const selectedIdSet = new Set(selectedIds)
    const foundIds = new Set<string>()

    for (let index = 0; index < checkboxCount; index += 1) {
      const checkbox = checkboxes.nth(index)
      const checkboxId = await checkbox.getAttribute('id')

      if (!checkboxId) {
        continue
      }

      const shouldBeChecked = selectedIdSet.has(checkboxId)

      if (shouldBeChecked) {
        foundIds.add(checkboxId)
      }

      await checkbox.evaluate((element, targetState) => {
        const input = element as HTMLInputElement

        if (input.checked === targetState) {
          return
        }

        input.checked = targetState

        input.dispatchEvent(
          new Event('input', {
            bubbles: true
          })
        )

        input.dispatchEvent(
          new Event('change', {
            bubbles: true
          })
        )
      }, shouldBeChecked)

      if ((await checkbox.isChecked()) !== shouldBeChecked) {
        throw new Error(`A DeskData não manteve o estado do conjunto ${checkboxId}`)
      }
    }

    const missingIds = selectedIds.filter((id) => !foundIds.has(id))

    if (missingIds.length > 0) {
      throw new Error(
        `Conjuntos obrigatórios não encontrados na DeskData: ${missingIds.join(', ')}`
      )
    }

    return {
      selectedIds,
      selectedCount: selectedIds.length
    }
  }
}
