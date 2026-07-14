import { describe, expect, it } from 'vitest'
import { parsePlatformUrls } from '@/automation/browser/platform-urls'

describe('parsePlatformUrls', () => {
  it('deve fornecer as páginas operacionais identificadas nos vídeos', () => {
    expect(parsePlatformUrls()).toEqual({
      cpiQueueUrl:
        'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
      deskDataPeopleUrl: 'https://deskdata.com.br/pessoas/'
    })
  })

  it('deve aceitar URLs HTTPS válidas', () => {
    expect(
      parsePlatformUrls({
        cpiQueueUrl: 'https://cpi.example.test/fila',
        deskDataPeopleUrl: 'https://deskdata.example.test/pessoas'
      })
    ).toEqual({
      cpiQueueUrl: 'https://cpi.example.test/fila',
      deskDataPeopleUrl: 'https://deskdata.example.test/pessoas'
    })
  })

  it('deve rejeitar URLs sem HTTPS', () => {
    expect(() =>
      parsePlatformUrls({
        cpiQueueUrl: 'http://cpi.example.test/fila',
        deskDataPeopleUrl: 'https://deskdata.example.test/pessoas'
      })
    ).toThrow()
  })
})
