export interface DeskDataProcessRecord {
  processKey: string
  processNumber: string | null
  sphereRaw: string | null
  sourcePage: number
}

export type DeskDataResult = 'SIM_CONSTA_RESTRICAO' | 'HA_INFORMACOES'

export type DeskDataClassificationReason = 'CRIMINAL_SPHERE_FOUND' | 'NO_CRIMINAL_SPHERE'

export interface DeskDataClassification {
  result: DeskDataResult
  reason: DeskDataClassificationReason
  totalProcesses: number
  normalizedSpheres: string[]
}
