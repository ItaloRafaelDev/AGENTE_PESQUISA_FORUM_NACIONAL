import {
  classifyDeskDataResult,
  type DeskDataResultSummary
} from '../../domain/research/classify-deskdata-result'
import type { ResearchClassification } from '../../domain/research/research-classification'
import { DeskDataProcessResultAnalyzer } from './deskdata-process-result-analyzer'
import type { DeskDataProcessInspection } from './deskdata-process-result-inspector'

export interface DeskDataInspectionClassification {
  summary: DeskDataResultSummary
  classification: ResearchClassification
}

export class DeskDataInspectionClassifier {
  private readonly analyzer = new DeskDataProcessResultAnalyzer()

  classify(inspection: DeskDataProcessInspection): DeskDataInspectionClassification {
    const summary = this.analyzer.analyze(inspection)

    return {
      summary,
      classification: classifyDeskDataResult(summary)
    }
  }
}
