import { describe, expect, it } from 'vitest'
import {
  isCriminalSphere,
  normalizeProcessSphere
} from '../../../../src/domain/research/normalize-process-sphere'

describe('normalizeProcessSphere', () => {
  it.each([
    ['  ESPECIAL   CRIMINAL  ', 'especial criminal'],
    ['Criminal/Penal', 'criminal penal'],
    ['CÍVEL E CRIMINAL', 'civel e criminal'],
    ['Criminal & Civil', 'criminal civil'],
    ['Criminal-Militar', 'criminal militar'],
    ['\n Juizado Especial Criminal \n', 'juizado especial criminal'],
    [null, ''],
    [undefined, '']
  ])('normaliza %j para %j', (input, expected) => {
    expect(normalizeProcessSphere(input)).toBe(expected)
  })
})

describe('isCriminalSphere', () => {
  it.each([
    'Criminal',
    'Penal',
    'Criminal Militar',
    'Criminal/Penal',
    'Especial Criminal',
    'Juizado Especial Criminal',
    'Civil/Criminal',
    'Cível e Criminal',
    'Criminal e Civil'
  ])('reconhece %s como criminal', (sphere) => {
    expect(isCriminalSphere(sphere)).toBe(true)
  })

  it.each([
    'Civil',
    'Cível',
    'Trabalhista',
    'Eleitoral',
    'Administrativa',
    'penalidade administrativa',
    'criminalidade estatística',
    '',
    null,
    undefined
  ])('não reconhece %j como criminal', (sphere) => {
    expect(isCriminalSphere(sphere)).toBe(false)
  })
})
