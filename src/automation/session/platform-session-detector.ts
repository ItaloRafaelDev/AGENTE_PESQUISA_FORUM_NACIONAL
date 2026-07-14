import type { PlatformSessionState } from '../../shared/types/session-api'

export interface PageSessionEvidence {
  url: string
  hasVisiblePasswordInput: boolean
}

export function detectCpiSession(evidence: PageSessionEvidence | null): PlatformSessionState {
  if (!evidence) {
    return 'INDETERMINATE'
  }

  if (evidence.hasVisiblePasswordInput) {
    return 'WAITING_LOGIN'
  }

  const url = new URL(evidence.url)

  if (url.pathname.toLowerCase().endsWith('/access_fault.aspx')) {
    return 'WAITING_LOGIN'
  }

  if (
    url.hostname === 'adm.cpicentral.com.br' &&
    url.pathname.toLowerCase().endsWith('/zpersespecial/pesquisas/aguardando/mod_t_aguardando.aspx')
  ) {
    return 'AUTHENTICATED'
  }

  return 'INDETERMINATE'
}

export function detectDeskDataSession(evidence: PageSessionEvidence | null): PlatformSessionState {
  if (!evidence) {
    return 'INDETERMINATE'
  }

  if (evidence.hasVisiblePasswordInput) {
    return 'WAITING_LOGIN'
  }

  const url = new URL(evidence.url)
  const pathname = url.pathname.toLowerCase()

  if (
    url.hostname === 'deskdata.com.br' &&
    (pathname === '/pessoas' || pathname.startsWith('/pessoas/'))
  ) {
    return 'AUTHENTICATED'
  }

  if (pathname.includes('/login') || pathname.includes('/entrar') || pathname.includes('/acesso')) {
    return 'WAITING_LOGIN'
  }

  return 'INDETERMINATE'
}
