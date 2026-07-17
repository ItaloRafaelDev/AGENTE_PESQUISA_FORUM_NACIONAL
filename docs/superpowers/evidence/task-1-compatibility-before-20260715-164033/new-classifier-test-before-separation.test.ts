import { describe, expect, it } from 'vitest'
import { classifyDeskDataResult } from '../../../../src/domain/research/classify-deskdata-result'
import type { DeskDataProcessRecord } from '../../../../src/domain/research/deskdata-process-record'

let sequence = 0

function process(
  sphereRaw: string | null,
  overrides: Partial<DeskDataProcessRecord> = {}
): DeskDataProcessRecord {
  sequence += 1

  return {
    processKey: overrides.processKey ?? `key-${sequence}`,
    processNumber: overrides.processNumber ?? null,
    sphereRaw,
    sourcePage: overrides.sourcePage ?? 1
  }
}

describe('classifyDeskDataResult', () => {
  it('retorna Há Informações sem processos', () => {
    expect(classifyDeskDataResult([])).toEqual({
      result: 'HA_INFORMACOES',
      reason: 'NO_CRIMINAL_SPHERE',
      totalProcesses: 0,
      normalizedSpheres: []
    })
  })

  it.each([
    'Civil',
    'Cível',
    'Trabalhista',
    'Eleitoral',
    'Administrativa',
    'Valor desconhecido',
    '',
    null
  ])('retorna Há Informações para Esfera %j', (sphere) => {
    expect(classifyDeskDataResult([process(sphere)]).result).toBe('HA_INFORMACOES')
  })

  it.each([
    'Criminal',
    'Penal',
    'Criminal Militar',
    'Especial Criminal',
    'Juizado Especial Criminal',
    'Civil/Criminal',
    'Cível e Criminal',
    'Criminal e Civil'
  ])('retorna restrição para Esfera %s', (sphere) => {
    expect(classifyDeskDataResult([process(sphere)])).toMatchObject({
      result: 'SIM_CONSTA_RESTRICAO',
      reason: 'CRIMINAL_SPHERE_FOUND',
      totalProcesses: 1
    })
  })

  it('faz prevalecer uma Esfera criminal em qualquer página', () => {
    const result = classifyDeskDataResult([
      process('Civil', {
        processKey: '1',
        sourcePage: 1
      }),
      process('Trabalhista', {
        processKey: '2',
        sourcePage: 1
      }),
      process('Especial Criminal', {
        processKey: '3',
        sourcePage: 3
      })
    ])

    expect(result.result).toBe('SIM_CONSTA_RESTRICAO')

    expect(result.normalizedSpheres).toEqual(['civil', 'trabalhista', 'especial criminal'])
  })

  it('ignora status porque ele não faz parte do contrato', () => {
    const record: DeskDataProcessRecord = {
      processKey: 'criminal-arquivado',
      processNumber: null,
      sphereRaw: 'Criminal',
      sourcePage: 1
    }

    expect(Object.keys(record).sort()).toEqual([
      'processKey',
      'processNumber',
      'sourcePage',
      'sphereRaw'
    ])

    expect(classifyDeskDataResult([record]).result).toBe('SIM_CONSTA_RESTRICAO')
  })
})
