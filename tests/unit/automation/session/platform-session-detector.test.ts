import { describe, expect, it } from 'vitest'
import {
  detectCpiSession,
  detectDeskDataSession
} from '@/automation/session/platform-session-detector'

describe('detectCpiSession', () => {
  it('deve identificar a fila da CPI como autenticada', () => {
    expect(
      detectCpiSession({
        url: 'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
        hasVisiblePasswordInput: false
      })
    ).toBe('AUTHENTICATED')
  })

  it('deve identificar access_fault.aspx como aguardando login', () => {
    expect(
      detectCpiSession({
        url: 'https://adm.cpicentral.com.br/access_fault.aspx',
        hasVisiblePasswordInput: false
      })
    ).toBe('WAITING_LOGIN')
  })

  it('deve priorizar campo de senha visível', () => {
    expect(
      detectCpiSession({
        url: 'https://adm.cpicentral.com.br/qualquer-pagina',
        hasVisiblePasswordInput: true
      })
    ).toBe('WAITING_LOGIN')
  })

  it('deve considerar página desconhecida como indeterminada', () => {
    expect(
      detectCpiSession({
        url: 'https://adm.cpicentral.com.br/pagina-desconhecida',
        hasVisiblePasswordInput: false
      })
    ).toBe('INDETERMINATE')
  })
})

describe('detectDeskDataSession', () => {
  it('deve identificar /pessoas/ como autenticada', () => {
    expect(
      detectDeskDataSession({
        url: 'https://deskdata.com.br/pessoas/',
        hasVisiblePasswordInput: false
      })
    ).toBe('AUTHENTICATED')
  })

  it('deve identificar campo de senha visível como aguardando login', () => {
    expect(
      detectDeskDataSession({
        url: 'https://deskdata.com.br/login',
        hasVisiblePasswordInput: true
      })
    ).toBe('WAITING_LOGIN')
  })

  it('deve identificar rota de login como aguardando login', () => {
    expect(
      detectDeskDataSession({
        url: 'https://deskdata.com.br/login',
        hasVisiblePasswordInput: false
      })
    ).toBe('WAITING_LOGIN')
  })

  it('deve considerar página desconhecida como indeterminada', () => {
    expect(
      detectDeskDataSession({
        url: 'https://deskdata.com.br/pagina-desconhecida',
        hasVisiblePasswordInput: false
      })
    ).toBe('INDETERMINATE')
  })
})
