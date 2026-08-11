import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { evaluateCpiFieldStructures } from '@/infrastructure/automation/cpi/cpi-field-structure-evaluator'

describe('evaluateCpiFieldStructures', () => {
  it('deve ser serializável sem depender do helper __name', () => {
    expect(evaluateCpiFieldStructures.toString()).not.toContain('__name')
  })

  it('deve localizar a estrutura associada ao rótulo informado', () => {
    const dom = new JSDOM(
      '<body><div class="linha"><div id="rotulo-status">Status:</div><div id="campo-status">Aberto</div></div></body>'
    )

    const result = evaluateCpiFieldStructures(dom.window.document.body, ['Status'])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      label: 'Status',
      id: 'rotulo-status',
      nextSiblingId: 'campo-status'
    })
  })
})
