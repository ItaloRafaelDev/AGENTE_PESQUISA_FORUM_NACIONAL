import { describe, expect, it } from 'vitest'
import { classifyDeskDataSpheres } from '@/domain/research/classify-deskdata-spheres'
import {
  DeskDataPdfProcessParser,
  DeskDataPdfProcessParsingError
} from '@/automation/deskdata/deskdata-pdf-process-parser'
import type { DeskDataPdfTextSnapshot } from '@/automation/deskdata/deskdata-pdf-text-snapshot'

function snapshot(...pages: string[]): DeskDataPdfTextSnapshot {
  return {
    totalPages: pages.length,
    pages: pages.map((text, index) => ({
      pageNumber: index + 1,
      text
    })),
    text: pages.join('\n')
  }
}

describe('DeskDataPdfProcessParser', () => {
  it('extracts every sphere and detects a criminal process', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Consulta realizada
        Processos

        Resumo
        N\u00famero 0012592-15.2015.5.15.0097
        Tipo Rito sumarissimo
        Assunto Indenizacao por dano moral
        Esfera Trabalhista
        Vara 4 Vara Do Trabalho

        Resumo
        N\u00famero 0017111-53.2017.8.26.0502
        Tipo Execucao de pena
        Assunto Aberto
        Esfera Criminal
        Vara Vara Do Juri
      `)
    )

    expect(processes).toHaveLength(2)
    expect(processes.map((process) => process.sphereRaw)).toEqual(['Trabalhista', 'Criminal'])

    expect(classifyDeskDataSpheres(processes)).toMatchObject({
      result: 'SIM_CONSTA_RESTRICAO',
      reason: 'CRIMINAL_SPHERE_FOUND',
      totalProcesses: 2
    })
  })

  it('does not use Vara, Tipo or Assunto when Esfera is empty', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Processos

        Resumo
        N\u00famero 0082461-45.2018.3.00.0000
        Tipo Habeas corpus criminal
        Assunto Direito penal
        Esfera
        Vara 3 Vara Criminal
        Status Arquivado
      `)
    )

    expect(processes).toHaveLength(1)
    expect(processes[0].sphereRaw).toBeNull()

    expect(classifyDeskDataSpheres(processes)).toMatchObject({
      result: 'HA_INFORMACOES',
      reason: 'NO_CRIMINAL_SPHERE'
    })
  })

  it('classifies only Trabalhista as Ha Informacoes', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Processos

        Resumo
        N\u00famero 0012952-98.2025.5.15.0096
        Tipo Rito ordinario
        Assunto Acumulo de funcao
        Esfera Trabalhista
        Vara Con1 - Jundiai
      `)
    )

    expect(classifyDeskDataSpheres(processes)).toMatchObject({
      result: 'HA_INFORMACOES',
      reason: 'NO_CRIMINAL_SPHERE',
      totalProcesses: 1,
      normalizedSpheres: ['trabalhista']
    })
  })

  it('returns an empty list for an explicit no-process message', () => {
    expect(
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Processos
          N\u00e3o foram encontrados processos.
        `)
      )
    ).toEqual([])
  })

  it('tracks a process that crosses a page break', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(
        `
          Processos
          Resumo
        `,
        `
          N\u00famero 0244237-88.2017.3.00.0000
          Tipo Habeas corpus
          Tribunal STJ
          Esfera
          Vara Tribunal De Justica
        `
      )
    )

    expect(processes).toEqual([
      expect.objectContaining({
        processNumber: '0244237-88.2017.3.00.0000',
        sphereRaw: null,
        sourcePage: 2
      })
    ])
  })

  it('fails when the Processos section does not exist', () => {
    expect(() =>
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Consulta realizada
          Dados basicos
        `)
      )
    ).toThrowError(
      expect.objectContaining<Partial<DeskDataPdfProcessParsingError>>({
        code: 'PDF_PROCESS_SECTION_NOT_FOUND'
      })
    )
  })

  it('fails when Processos has no process and no explicit empty message', () => {
    expect(() =>
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Processos
          Conteudo inesperado
        `)
      )
    ).toThrowError(
      expect.objectContaining<Partial<DeskDataPdfProcessParsingError>>({
        code: 'PDF_PROCESS_CONTENT_UNRECOGNIZED'
      })
    )
  })
})
