import { describe, expect, it } from 'vitest'
import { findDeskDataPeoplePage } from '@/automation/deskdata/deskdata-page-finder'

interface FakePage {
  url(): string
}

function createPage(url: string): FakePage {
  return {
    url: () => url
  }
}

describe('findDeskDataPeoplePage', () => {
  it('deve localizar a página de consulta de pessoas da DeskData', () => {
    const cpiPage = createPage('https://cliente.cpicentral.com.br/fila')
    const deskDataPage = createPage('https://app.deskdata.com.br/pessoas/')
    const unrelatedPage = createPage('about:blank')

    const result = findDeskDataPeoplePage([cpiPage, unrelatedPage, deskDataPage])

    expect(result).toBe(deskDataPage)
  })
})
