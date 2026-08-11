import type { BrowserContext } from 'playwright'

export interface DeskDataInspectionPageManager {
  ensurePages(context: BrowserContext): Promise<unknown>
}

export async function prepareDeskDataInspectionPages(
  context: BrowserContext,
  pageManager: DeskDataInspectionPageManager
): Promise<void> {
  await pageManager.ensurePages(context)
}
