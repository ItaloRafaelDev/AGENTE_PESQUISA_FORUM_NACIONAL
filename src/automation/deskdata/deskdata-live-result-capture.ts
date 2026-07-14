import { DeskDataProcessDomCapture } from './deskdata-process-dom-capture'
import type {
  DeskDataProcessCaptureLocator,
  DeskDataProcessCapturePage
} from './deskdata-process-dom-capture'
import {
  DeskDataProcessResultInspector,
  type DeskDataProcessInspection,
  type RawDeskDataInspectionCandidate,
  type RawDeskDataInspectionTable,
  type RawDeskDataProcessInspection
} from './deskdata-process-result-inspector'

export const DESKDATA_LIVE_RESULT_HEADING_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'legend',
  '[role="heading"]',
  '.card-header',
  '.panel-heading',
  '.accordion-button'
].join(', ')

export interface DeskDataLiveResultLocator extends DeskDataProcessCaptureLocator {
  allTextContents(): Promise<string[]>
}

export interface DeskDataLiveResultPage extends DeskDataProcessCapturePage {
  url(): string
  title(): Promise<string>
  locator(selector: string): DeskDataLiveResultLocator
}

export interface DeskDataLiveDomCapturePort {
  captureTables(page: DeskDataProcessCapturePage): Promise<RawDeskDataInspectionTable[]>

  captureCandidates(page: DeskDataProcessCapturePage): Promise<RawDeskDataInspectionCandidate[]>
}

export interface DeskDataLiveInspectorPort {
  build(raw: RawDeskDataProcessInspection): DeskDataProcessInspection
}

export class DeskDataLiveResultCapture {
  constructor(
    private readonly domCapture: DeskDataLiveDomCapturePort = new DeskDataProcessDomCapture(),
    private readonly inspector: DeskDataLiveInspectorPort = new DeskDataProcessResultInspector()
  ) {}

  async capture(page: DeskDataLiveResultPage): Promise<DeskDataProcessInspection> {
    const bodyText = await page.locator('body').innerText({
      timeout: 10_000
    })

    const headings = await page.locator(DESKDATA_LIVE_RESULT_HEADING_SELECTOR).allTextContents()

    const [tables, candidates] = await Promise.all([
      this.domCapture.captureTables(page),
      this.domCapture.captureCandidates(page)
    ])

    return this.inspector.build({
      scenario: 'fluxo-real',
      capturedAt: new Date().toISOString(),
      sourceUrl: page.url(),
      pageTitle: await page.title(),
      bodyText,
      headings,
      tables,
      candidates
    })
  }
}
