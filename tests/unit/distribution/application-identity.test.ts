import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('application identity', () => {
  it('expõe a identidade canônica consumida pela aplicação distribuída', async () => {
    const { APPLICATION_IDENTITY } = await import('@/shared/config/application-identity')

    expect(APPLICATION_IDENTITY).toEqual({
      appId: 'com.agentecpi.desktop',
      productName: 'Agente CPI',
      executableName: 'AgenteCPI',
      artifactBaseName: 'Agente-CPI',
      legacyUserDataDirectoryName: 'agente-cpi'
    })
    expect(Object.isFrozen(APPLICATION_IDENTITY)).toBe(true)
  })

  it('mantém os valores de identidade somente no catálogo JSON', () => {
    const identityValues = Object.values(
      JSON.parse(readFileSync('build/application-identity.json', 'utf8')) as Record<string, string>
    )
    const applicationIdentitySource = readFileSync(
      'src/shared/config/application-identity.ts',
      'utf8'
    )

    expect(identityValues.filter((value) => applicationIdentitySource.includes(value))).toEqual([])
  })
})
