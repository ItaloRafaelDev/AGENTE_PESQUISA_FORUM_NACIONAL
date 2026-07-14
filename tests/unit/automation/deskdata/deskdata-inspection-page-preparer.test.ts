import type { BrowserContext } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import {
  prepareDeskDataInspectionPages,
  type DeskDataInspectionPageManager
} from '@/automation/deskdata/deskdata-inspection-page-preparer'

describe('prepareDeskDataInspectionPages', () => {
  it('deve abrir as páginas das plataformas antes da inspeção', async () => {
    const context = {} as BrowserContext
    const ensurePages = vi.fn(async () => undefined)

    const pageManager: DeskDataInspectionPageManager = {
      ensurePages
    }

    await prepareDeskDataInspectionPages(context, pageManager)

    expect(ensurePages).toHaveBeenCalledTimes(1)
    expect(ensurePages).toHaveBeenCalledWith(context)
  })
})
