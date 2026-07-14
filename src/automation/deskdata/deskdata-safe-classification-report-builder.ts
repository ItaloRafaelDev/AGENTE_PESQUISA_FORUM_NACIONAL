import { DeskDataClassificationReportFormatter } from './deskdata-classification-report-formatter'
import { DeskDataInspectionClassifier } from './deskdata-inspection-classifier'
import type { DeskDataProcessInspection } from './deskdata-process-result-inspector'

export class DeskDataSafeClassificationReportBuilder {
  private readonly classifier = new DeskDataInspectionClassifier()
  private readonly formatter = new DeskDataClassificationReportFormatter()

  build(inspection: DeskDataProcessInspection): string[] {
    const classification = this.classifier.classify(inspection)

    return this.formatter.format(classification)
  }
}
