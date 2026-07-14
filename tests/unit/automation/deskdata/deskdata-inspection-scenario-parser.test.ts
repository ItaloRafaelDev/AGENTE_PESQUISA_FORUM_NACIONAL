import { describe, expect, it } from 'vitest'
import { parseDeskDataInspectionScenario } from '@/automation/deskdata/deskdata-inspection-scenario-parser'

describe('parseDeskDataInspectionScenario', () => {
  it('deve aceitar um cenário válido informado pela linha de comando', () => {
    const result = parseDeskDataInspectionScenario(['caso-a-criminal'])

    expect(result).toBe('caso-a-criminal')
  })
})
