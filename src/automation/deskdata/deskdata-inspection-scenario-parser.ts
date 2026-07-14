import type { DeskDataInspectionScenario } from './deskdata-process-result-inspector'

const SUPPORTED_SCENARIOS: readonly DeskDataInspectionScenario[] = [
  'caso-a-criminal',
  'caso-b-sem-processos',
  'caso-c-nao-criminal'
]

export function parseDeskDataInspectionScenario(
  args: readonly string[]
): DeskDataInspectionScenario {
  const scenario = args[0] as DeskDataInspectionScenario | undefined

  if (!scenario || !SUPPORTED_SCENARIOS.includes(scenario)) {
    throw new Error(`Cenário inválido. Use: ${SUPPORTED_SCENARIOS.join(', ')}.`)
  }

  return scenario
}
