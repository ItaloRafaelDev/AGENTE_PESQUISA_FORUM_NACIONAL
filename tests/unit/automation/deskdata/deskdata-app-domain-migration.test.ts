import { describe, expect, it } from 'vitest'
import {
  DESKDATA_NEXT_SEARCH_SELECTORS,
  DESKDATA_PEOPLE_URL
} from '@/automation/deskdata/deskdata-next-search-controller'
import { detectDeskDataSession } from '@/automation/session/platform-session-detector'
import { parseAppConfig } from '@/infrastructure/config/app-config'

const APP_ORIGIN = 'https://app.deskdata.com.br'

describe('DeskData app domain migration', () => {
  it('uses the new Consultar pessoas URL', () => {
    expect(parseAppConfig().platform.deskDataPeopleUrl).toBe(APP_ORIGIN + '/pessoas/')

    expect(DESKDATA_PEOPLE_URL).toBe(APP_ORIGIN + '/pessoas/')
  })

  it('recognizes authenticated pages on app.deskdata.com.br', () => {
    const authenticatedUrls = [
      APP_ORIGIN + '/',
      APP_ORIGIN + '/painel',
      APP_ORIGIN + '/pessoas/',
      APP_ORIGIN + '/pessoas/resultado/?q=Q-TESTE',
      APP_ORIGIN + '/historico/',
      APP_ORIGIN + '/historico/detalhes/?q=Q-TESTE'
    ]

    for (const url of authenticatedUrls) {
      expect(
        detectDeskDataSession({
          url,
          hasVisiblePasswordInput: false
        })
      ).toBe('AUTHENTICATED')
    }
  })

  it('recognizes the new login route as waiting for manual login', () => {
    expect(
      detectDeskDataSession({
        url: APP_ORIGIN + '/entrar',
        hasVisiblePasswordInput: true
      })
    ).toBe('WAITING_LOGIN')
  })

  it('uses a visible Consultar pessoas link from the new application', () => {
    expect(DESKDATA_NEXT_SEARCH_SELECTORS.consultPeopleLink).toContain(
      'app.deskdata.com.br/pessoas'
    )

    expect(DESKDATA_NEXT_SEARCH_SELECTORS.consultPeopleLink).toContain(':visible')
  })
})
