import type { BrowserContext } from 'playwright'
import { PlatformPageManager } from '../browser/platform-page-manager'

export interface DeskDataInspectionPageManager {
  ensurePages(context: BrowserContext): Promise<unknown>
}

export async function prepareDeskDataInspectionPages(
  context: BrowserContext,
  pageManager: DeskDataInspectionPageManager = new PlatformPageManager()
): Promise<void> {
  await pageManager.ensurePages(context)
}
