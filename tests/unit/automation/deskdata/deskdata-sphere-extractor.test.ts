import { describe, expect, it } from 'vitest'
import { extractSphereFromFields } from '../../../../src/automation/deskdata/deskdata-sphere-extractor'
import { DeskDataProcessCollectionError } from '../../../../src/automation/deskdata/deskdata-process-collection-error'

describe('extractSphereFromFields', () => {
  it('extrai somente o valor do campo Esfera', () => {
    const result = extractSphereFromFields([
      {
        label: 'Vara',
        value: 'Juizado Especial Cível e Criminal'
      },
      {
        label: 'Esfera',
        value: 'Civil'
      },
      {
        label: 'Assunto',
        value: 'Matéria criminal citada no título'
      }
    ])

    expect(result).toBe('Civil')
  })

  it.each([
    {
      label: 'ESFERA',
      value: 'Especial Criminal'
    },
    {
      label: '  Esféra  ',
      value: 'Penal'
    }
  ])('normaliza somente o rótulo $label', (field) => {
    expect(extractSphereFromFields([field])).toBe(field.value)
  })

  it('não aceita rótulo apenas semelhante', () => {
    expect(
      extractSphereFromFields([
        {
          label: 'Esfera processual complementar',
          value: 'Criminal'
        }
      ])
    ).toBeNull()
  })

  it('retorna null quando Esfera está ausente', () => {
    expect(
      extractSphereFromFields([
        {
          label: 'Vara',
          value: 'Criminal'
        }
      ])
    ).toBeNull()
  })

  it('retorna null quando Esfera está vazia', () => {
    expect(
      extractSphereFromFields([
        {
          label: 'Esfera',
          value: '   '
        }
      ])
    ).toBeNull()
  })

  it('aceita ocorrências duplicadas com o mesmo valor normalizado', () => {
    expect(
      extractSphereFromFields([
        {
          label: 'Esfera',
          value: 'Cível'
        },
        {
          label: 'ESFERA',
          value: '  CÍVEL  '
        }
      ])
    ).toBe('Cível')
  })

  it('rejeita valores conflitantes no mesmo cartão', () => {
    expect(() =>
      extractSphereFromFields([
        {
          label: 'Esfera',
          value: 'Civil'
        },
        {
          label: 'Esfera',
          value: 'Criminal'
        }
      ])
    ).toThrowError(DeskDataProcessCollectionError)

    try {
      extractSphereFromFields([
        {
          label: 'Esfera',
          value: 'Civil'
        },
        {
          label: 'Esfera',
          value: 'Criminal'
        }
      ])

      throw new Error('Era esperado erro de conflito.')
    } catch (error) {
      expect(error).toMatchObject({
        code: 'PROCESS_CARD_STRUCTURE_INVALID'
      })
    }
  })
})
