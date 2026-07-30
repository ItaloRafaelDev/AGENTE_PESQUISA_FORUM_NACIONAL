import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveWindowsOperationalConfig } from '../../../scripts/support/windows-operational-config'

describe('configuração operacional dos scripts Windows', () => {
  let originalAppData: string | undefined

  beforeEach(() => {
    originalAppData = process.env.APPDATA
  })

  afterEach(() => {
    if (originalAppData === undefined) {
      delete process.env.APPDATA

      return
    }

    process.env.APPDATA = originalAppData
  })

  it('resolve o perfil operacional pelo APPDATA informado', () => {
    expect(resolveWindowsOperationalConfig('C:\\Users\\Operador\\AppData\\Roaming')).toMatchObject({
      paths: {
        browserProfileDir: 'C:\\Users\\Operador\\AppData\\Roaming\\AgenteCPI\\browser-profile'
      }
    })
  })

  it('rejeita APPDATA ausente sem depender do ambiente da máquina', () => {
    delete process.env.APPDATA

    expect(() => resolveWindowsOperationalConfig(undefined)).toThrow(
      'APPDATA não está disponível no Windows'
    )
  })
})
