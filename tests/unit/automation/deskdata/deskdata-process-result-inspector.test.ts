import { describe, expect, it } from 'vitest'
import {
  DeskDataProcessResultInspector,
  type RawDeskDataProcessInspection
} from '@/automation/deskdata/deskdata-process-result-inspector'

describe('DeskDataProcessResultInspector', () => {
  it('deve remover CPF e manter somente linhas relevantes', () => {
    const raw: RawDeskDataProcessInspection = {
      scenario: 'caso-a-criminal',
      capturedAt: '2026-07-14T12:00:00.000Z',
      sourceUrl: 'https://app.deskdata.com.br/pessoas/resultado/?cpf=52998224725',
      pageTitle: 'Resultado 529.982.247-25',
      bodyText: [
        'Nome da pessoa',
        'CPF 529.982.247-25',
        'Informação irrelevante',
        'Processos encontrados',
        'Processo 0001234-56.2024.8.26.0001',
        'Classe: Ação Penal'
      ].join('\n'),
      headings: ['Resultado', 'Processos'],
      tables: [
        {
          index: 0,
          text: 'Processo 0001234-56.2024.8.26.0001 CPF 52998224725',
          html: '<table data-cpf="52998224725"><tr><td>Processo</td></tr></table>'
        }
      ],
      candidates: [
        {
          index: 0,
          tagName: 'div',
          id: 'processos',
          className: 'card',
          text: 'Processo 0001234-56.2024.8.26.0001 Ação Penal',
          html: '<div id="processos" data-cpf="52998224725">Ação Penal</div>'
        },
        {
          index: 1,
          tagName: 'div',
          id: '',
          className: 'card',
          text: 'Processo 0001234-56.2024.8.26.0001 Ação Penal',
          html: '<div>Ação Penal</div>'
        }
      ]
    }

    const inspector = new DeskDataProcessResultInspector()

    const result = inspector.build(raw)
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('52998224725')
    expect(serialized).not.toContain('529.982.247-25')

    expect(result.sourcePath).toBe('/pessoas/resultado/')

    expect(result.relevantBodyLines).toContain('Processos encontrados')

    expect(result.relevantBodyLines).not.toContain('Informação irrelevante')

    expect(result.candidates).toHaveLength(1)
  })

  it('deve produzir relatório TXT sem dados do CPF', () => {
    const inspector = new DeskDataProcessResultInspector()

    const result = inspector.build({
      scenario: 'caso-b-sem-processos',
      capturedAt: '2026-07-14T12:00:00.000Z',
      sourceUrl: 'https://app.deskdata.com.br/pessoas/resultado/',
      pageTitle: 'Resultado',
      bodyText: 'Nenhum processo encontrado para 529.982.247-25',
      headings: ['Processos'],
      tables: [],
      candidates: []
    })

    const text = inspector.toText(result)

    expect(text).toContain('Cenário: caso-b-sem-processos')

    expect(text).toContain('Nenhum processo encontrado')

    expect(text).not.toContain('529.982.247-25')
  })
})
