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
  it('extrai todas as Esferas e encontra processo criminal', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Consulta realizada
        Processos

        Resumo
        NÃºmero 0012592-15.2015.5.15.0097
        Tipo Rito sumarissimo
        Assunto Indenizacao por dano moral
        Esfera Trabalhista
        Vara 4 Vara Do Trabalho

        Resumo
        NÃºmero 0017111-53.2017.8.26.0502
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

  it('nÃ£o usa Vara, Tipo ou Assunto criminal quando Esfera estÃ¡ vazia', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Processos

        Resumo
        NÃºmero 0082461-45.2018.3.00.0000
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

  it('classifica somente processo trabalhista como HÃ¡ InformaÃ§Ãµes', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(`
        Processos

        Resumo
        NÃºmero 0012952-98.2025.5.15.0096
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

  it('retorna lista vazia para ausÃªncia explÃ­cita de processos', () => {
    expect(
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Processos
          NÃ£o foram encontrados processos.
        `)
      )
    ).toEqual([])
  })

  it('acompanha processo que atravessa a quebra de pÃ¡gina', () => {
    const processes = new DeskDataPdfProcessParser().parse(
      snapshot(
        `
          Processos
          Resumo
        `,
        `
          NÃºmero 0244237-88.2017.3.00.0000
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

  it('falha quando a seÃ§Ã£o Processos nÃ£o existe', () => {
    expect(() =>
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Consulta realizada
          Dados bÃ¡sicos
        `)
      )
    ).toThrowError(
      expect.objectContaining<Partial<DeskDataPdfProcessParsingError>>({
        code: 'PDF_PROCESS_SECTION_NOT_FOUND'
      })
    )
  })

  it('falha quando a seÃ§Ã£o existe sem processo e sem mensagem de ausÃªncia', () => {
    expect(() =>
      new DeskDataPdfProcessParser().parse(
        snapshot(`
          Processos
          ConteÃºdo inesperado
        `)
      )
    ).toThrowError(
      expect.objectContaining<Partial<DeskDataPdfProcessParsingError>>({
        code: 'PDF_PROCESS_CONTENT_UNRECOGNIZED'
      })
    )
  })
})
