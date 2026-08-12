import { describe, expect, it } from 'vitest'
import { NavigationSecurityPolicy } from '@/main/security/navigation-security-policy'

describe('NavigationSecurityPolicy', () => {
  const approved = new URL('http://127.0.0.1:5173/')
  const policy = new NavigationSecurityPolicy(approved)

  it('permite apenas a localização exata do renderer', () => {
    expect(policy.isApprovedRendererNavigation(approved.href)).toBe(true)
    expect(policy.isApprovedRendererNavigation(`${approved.href}other`)).toBe(false)
  })

  it('libera apenas URLs HTTPS válidas para abertura externa', () => {
    expect(policy.getApprovedExternalUrl('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1'
    )
  })

  it.each([
    'http://example.com',
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'mailto:test@example.com',
    'custom:payload',
    'not a url'
  ])('recusa URL externa não HTTPS: %s', (rawUrl) => {
    expect(policy.getApprovedExternalUrl(rawUrl)).toBeNull()
  })
})
