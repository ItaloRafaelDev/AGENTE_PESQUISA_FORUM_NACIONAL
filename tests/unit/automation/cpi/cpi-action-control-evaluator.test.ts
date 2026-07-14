import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { evaluateCpiActionControls } from '@/automation/cpi/cpi-action-control-evaluator'

describe('evaluateCpiActionControls', () => {
  it('deve identificar a ação Alterar usada para gravar a pesquisa', () => {
    const dom = new JSDOM(
      '<body><form name="form_cad"><a href="javascript://" class="button" onclick="javascript:upd_pesq();">Alterar</a></form></body>'
    )

    const result = evaluateCpiActionControls(dom.window.document.body)

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

  it('deve ser serializável pelo Playwright sem depender de __name', () => {
    expect(evaluateCpiActionControls.toString()).not.toContain('__name')
  })
})
