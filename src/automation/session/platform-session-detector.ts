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
  const hostname = url.hostname.toLowerCase()

  if (pathname.includes('/login') || pathname.includes('/entrar') || pathname.includes('/acesso')) {
    return 'WAITING_LOGIN'
  }

  const isNewApplication = hostname === 'app.deskdata.com.br'
  const isLegacyApplication = hostname === 'deskdata.com.br'

  if (
    isNewApplication &&
    (pathname === '/' ||
      pathname === '/painel' ||
      pathname === '/painel/' ||
      pathname === '/pessoas' ||
      pathname.startsWith('/pessoas/') ||
      pathname === '/historico' ||
      pathname.startsWith('/historico/'))
  ) {
    return 'AUTHENTICATED'
  }

  if (isLegacyApplication && (pathname === '/pessoas' || pathname.startsWith('/pessoas/'))) {
    return 'AUTHENTICATED'
  }

  return 'INDETERMINATE'
}
