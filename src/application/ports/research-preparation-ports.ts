import type { DeskDataProcessRecord } from '../../domain/research/deskdata-process-record'
import type {
  CpiDeskDataClassification,
  ResearchPreparationClassification
} from '../research/research-preparation-model'

export interface ResearchIdentity {
  cpf: string
  maskedCpf: string
}

export interface ReportArtifact {
  reference: string
  compatibilityPath: string
  sizeBytes: number
}

export interface DeskDataResearchPort {
  fillCpf(cpf: string): Promise<void>
  applyApprovedDatasets(): Promise<{ selectedCount: number }>
  submitOnce(): Promise<void>
  waitUntilResultReady(): Promise<void>
}

export interface ResearchReportPort {
  create(): Promise<ReportArtifact>
  readProcesses(reference: string): Promise<readonly DeskDataProcessRecord[]>
}

export interface CpiResearchPreparationPort {
  prepareAndAttach(
    classification: CpiDeskDataClassification,
    reportReference: string
  ): Promise<{
    attached: boolean
    requiredFieldsConfirmed: boolean
  }>
}

export interface PrepareResearchDependencies {
  deskData: DeskDataResearchPort
  report: ResearchReportPort
  cpi: CpiResearchPreparationPort
}

export interface PreparedResearch {
  maskedCpf: string
  selectedDatasetCount: number
  classification: ResearchPreparationClassification
  report: ReportArtifact
  attachmentConfirmed: true
  requiredFieldsConfirmed: true
}
