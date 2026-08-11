import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { evaluateCpiActionControls } from '@/infrastructure/automation/cpi/cpi-action-control-evaluator'
import { CPI_RESEARCH_RESULT_SELECTORS } from '@/infrastructure/automation/cpi/cpi-selectors'

describe('evaluateCpiActionControls', () => {
  it('deve identificar a ação Alterar usada para gravar a pesquisa', () => {
    const dom = new JSDOM(
      '<body><form name="form_cad"><a href="javascript://" class="button" onclick="javascript:upd_pesq();">Alterar</a></form></body>'
    )

    const result = evaluateCpiActionControls(
      dom.window.document.body,
      CPI_RESEARCH_RESULT_SELECTORS.save
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      tag: 'a',
      id: '',
      className: 'button',
      text: 'Alterar',
      href: 'javascript://',
      onclick: 'javascript:upd_pesq();',
      formName: 'form_cad'
    })
  })

  it('deve executar serializada sem escopo de módulo', () => {
    const dom = new JSDOM(
      '<body><form name="form_cad"><a href="javascript://" class="button" onclick="javascript:upd_pesq();">Alterar</a></form></body>'
    )
    const serializedEvaluator = new Function(
      `return (${evaluateCpiActionControls.toString()})`
    )() as (body: HTMLElement, selector: string) => ReturnType<typeof evaluateCpiActionControls>

    expect(
      serializedEvaluator(dom.window.document.body, CPI_RESEARCH_RESULT_SELECTORS.save)
    ).toEqual([
      {
        tag: 'a',
        id: '',
        className: 'button',
        text: 'Alterar',
        href: 'javascript://',
        onclick: 'javascript:upd_pesq();',
        formName: 'form_cad'
      }
    ])
  })
})
