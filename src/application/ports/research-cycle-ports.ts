import type { ContinuousResearchStage } from '../agent/continuous-research-stage'
import type { PreparedResearch, ResearchIdentity } from './research-preparation-ports'

export interface ResearchCycleHooks {
  onStage?(stage: ContinuousResearchStage): void
  onIdentity?(maskedCpf: string): void
}

export interface CpiResearchCyclePort {
  openNext(): Promise<void>
  readIdentity(): Promise<ResearchIdentity>
  bindCurrentResearch(): Promise<void>
  saveOnce(): Promise<{ saved: boolean; confirmationAccepted: boolean }>
  returnToQueue(): Promise<void>
}

export interface DeskDataCyclePort {
  prepareNextSearch(): Promise<void>
  closeHistoricalResult(): Promise<void>
}

export interface ResearchPreparationPort {
  execute(identity: ResearchIdentity): Promise<PreparedResearch>
}

export interface RunResearchCycleDependencies {
  cpi: CpiResearchCyclePort
  deskData: DeskDataCyclePort
  preparation: ResearchPreparationPort
}
