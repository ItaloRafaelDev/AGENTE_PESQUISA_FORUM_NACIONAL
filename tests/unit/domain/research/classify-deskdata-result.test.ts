import { describe, expect, it } from 'vitest'
import { classifyDeskDataResult } from '@/domain/research/classify-deskdata-result'

describe('classifyDeskDataResult', () => {
  it('deve classificar como CONSTA_RESTRICAO quando existir processo criminal', () => {
    expect(
      classifyDeskDataResult({
        hasProcesses: true,
        hasCriminalProcesses: true,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      })
    ).toBe('CONSTA_RESTRICAO')
  })

  it('deve classificar como HA_INFORMACOES quando existirem somente processos não criminais', () => {
    expect(
      classifyDeskDataResult({
        hasProcesses: true,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      })
    ).toBe('HA_INFORMACOES')
  })

  it('deve classificar como HA_INFORMACOES quando não existirem processos', () => {
    expect(
      classifyDeskDataResult({
        hasProcesses: false,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: true,
        isResultValid: true
      })
    ).toBe('HA_INFORMACOES')
  })

  it('deve classificar como INDEFINIDO quando houver processo com natureza não identificável', () => {
    expect(
      classifyDeskDataResult({
        hasProcesses: true,
        hasCriminalProcesses: false,
        isProcessNatureIdentifiable: false,
        isResultValid: true
      })
    ).toBe('INDEFINIDO')
  })

  it('deve priorizar INDEFINIDO quando o resultado não puder ser validado', () => {
    expect(
      classifyDeskDataResult({
        hasProcesses: true,
        hasCriminalProcesses: true,
        isProcessNatureIdentifiable: true,
        isResultValid: false
      })
    ).toBe('INDEFINIDO')
  })
})
