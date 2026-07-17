import type { DeskDataClassification, DeskDataProcessRecord } from './deskdata-process-record'
import { isCriminalSphere, normalizeProcessSphere } from './normalize-process-sphere'

export function classifyDeskDataResult(
  processes: readonly DeskDataProcessRecord[]
): DeskDataClassification {
  const normalizedSpheres = processes
    .map((process) => normalizeProcessSphere(process.sphereRaw))
    .filter(Boolean)

  const criminalFound = processes.some((process) => isCriminalSphere(process.sphereRaw))

  return {
    result: criminalFound ? 'SIM_CONSTA_RESTRICAO' : 'HA_INFORMACOES',
    reason: criminalFound ? 'CRIMINAL_SPHERE_FOUND' : 'NO_CRIMINAL_SPHERE',
    totalProcesses: processes.length,
    normalizedSpheres
  }
}
