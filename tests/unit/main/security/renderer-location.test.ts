import { describe, expect, it } from 'vitest'
import {
  isApprovedRendererUrl,
  resolveApprovedRendererUrl
} from '@/main/security/renderer-location'

describe('resolveApprovedRendererUrl', () => {
  it.each([
    {
      developmentUrl: 'http://127.0.0.1:5173/',
      productionHtmlPath: 'C:\\app\\out\\renderer\\index.html',
      expectedHref: 'http://127.0.0.1:5173/'
    },
    {
      developmentUrl: undefined,
      productionHtmlPath: 'C:\\app\\out\\renderer\\index.html',
      expectedProtocol: 'file:'
    }
  ])('resolve a localização aprovada para $developmentUrl', (input) => {
    const approved = resolveApprovedRendererUrl(input)

    if ('expectedHref' in input) {
      expect(approved.href).toBe(input.expectedHref)
    } else {
      expect(approved.protocol).toBe(input.expectedProtocol)
    }
  })

  it.each(['', 'not a url'])(
    'rejeita a URL de desenvolvimento inválida %j sem expor o erro do parser',
    (developmentUrl) => {
      expect(() =>
        resolveApprovedRendererUrl({
          developmentUrl,
          productionHtmlPath: 'C:\\app\\out\\renderer\\index.html'
        })
      ).toThrow('URL de desenvolvimento do renderer inválida.')
    }
  )
})

describe('isApprovedRendererUrl', () => {
  const approved = new URL('http://127.0.0.1:5173/')

  it.each([
    ['http://127.0.0.1:5173/', true],
    ['http://127.0.0.1:5173/other', false],
    ['not a url', false]
  ])('retorna %s para a candidata %s', (candidate, expected) => {
    expect(isApprovedRendererUrl(candidate, approved)).toBe(expected)
  })
})
