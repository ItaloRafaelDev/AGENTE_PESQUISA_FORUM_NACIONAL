import { describe, expect, it, vi } from 'vitest'
import {
  installWindowSecurity,
  type WindowSecurityTarget
} from '@/main/security/install-window-security'
import { NavigationSecurityPolicy } from '@/main/security/navigation-security-policy'

type NavigationEvent = {
  preventDefault(): void
  readonly url: string
}
type NavigationListener = (event: NavigationEvent) => void
type WindowOpenHandler = (details: { url: string }) => { action: 'deny' }
type PermissionRequestHandler = (
  webContents: unknown,
  permission: string,
  callback: (permissionGranted: boolean) => void,
  details: unknown
) => void
type PermissionCheckHandler = (
  webContents: unknown,
  permission: string,
  requestingOrigin: string,
  details: unknown
) => boolean

interface WindowSecurityHarness {
  target: WindowSecurityTarget
  navigationListeners: Map<'will-navigate' | 'will-redirect', NavigationListener>
  getWindowOpenHandler(): WindowOpenHandler
  getPermissionCheckHandler(): PermissionCheckHandler
  getPermissionRequestHandler(): PermissionRequestHandler
}

function createWindowSecurityHarness(): WindowSecurityHarness {
  const navigationListeners = new Map<'will-navigate' | 'will-redirect', NavigationListener>()
  let windowOpenHandler: WindowOpenHandler | undefined
  let permissionCheckHandler: PermissionCheckHandler | undefined
  let permissionRequestHandler: PermissionRequestHandler | undefined

  return {
    target: {
      webContents: {
        on(event, listener) {
          navigationListeners.set(event, listener)
        },
        setWindowOpenHandler(handler) {
          windowOpenHandler = handler
        },
        session: {
          setPermissionCheckHandler(handler) {
            permissionCheckHandler = handler
          },
          setPermissionRequestHandler(handler) {
            permissionRequestHandler = handler
          }
        }
      }
    },
    navigationListeners,
    getWindowOpenHandler() {
      if (!windowOpenHandler) {
        throw new Error('O handler de abertura de janela não foi instalado.')
      }

      return windowOpenHandler
    },
    getPermissionCheckHandler() {
      if (!permissionCheckHandler) {
        throw new Error('O handler de verificação de permissão não foi instalado.')
      }

      return permissionCheckHandler
    },
    getPermissionRequestHandler() {
      if (!permissionRequestHandler) {
        throw new Error('O handler de permissão não foi instalado.')
      }

      return permissionRequestHandler
    }
  }
}

describe('installWindowSecurity', () => {
  const policy = new NavigationSecurityPolicy(new URL('http://127.0.0.1:5173/'))

  it.each(['will-navigate', 'will-redirect'] as const)(
    'permite %s para a localização aprovada no evento',
    (eventName) => {
      const harness = createWindowSecurityHarness()
      const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
      const preventDefault = vi.fn()

      installWindowSecurity(harness.target, policy, { openExternal })

      harness.navigationListeners.get(eventName)?.({
        preventDefault,
        url: 'http://127.0.0.1:5173/'
      })

      expect(preventDefault).not.toHaveBeenCalled()
    }
  )

  it.each(['will-navigate', 'will-redirect'] as const)(
    'bloqueia %s para uma localização diferente do renderer',
    (eventName) => {
      const harness = createWindowSecurityHarness()
      const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
      const preventDefault = vi.fn()

      installWindowSecurity(harness.target, policy, { openExternal })

      harness.navigationListeners.get(eventName)?.({
        preventDefault,
        url: 'http://127.0.0.1:5173/other'
      })

      expect(preventDefault).toHaveBeenCalledTimes(1)
    }
  )

  it('recusa novas janelas e abre apenas destino HTTPS externo', () => {
    const harness = createWindowSecurityHarness()
    const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)

    installWindowSecurity(harness.target, policy, { openExternal })

    expect(harness.getWindowOpenHandler()({ url: 'https://example.com/path?q=1' })).toEqual({
      action: 'deny'
    })
    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith('https://example.com/path?q=1')
  })

  it.each(['http://example.com', 'not a url'])('não abre URL externa recusada: %s', (url) => {
    const harness = createWindowSecurityHarness()
    const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)

    installWindowSecurity(harness.target, policy, { openExternal })

    expect(harness.getWindowOpenHandler()({ url })).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('consome a falha de abertura externa sem uma segunda tentativa', async () => {
    const harness = createWindowSecurityHarness()
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason)
    }
    const openExternal = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error('Falha externa'))

    process.on('unhandledRejection', onUnhandledRejection)

    try {
      installWindowSecurity(harness.target, policy, { openExternal })

      expect(harness.getWindowOpenHandler()({ url: 'https://example.com' })).toEqual({
        action: 'deny'
      })

      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(openExternal).toHaveBeenCalledTimes(1)
      expect(unhandledRejections).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('recusa toda solicitação de permissão', () => {
    const harness = createWindowSecurityHarness()
    const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
    const callback = vi.fn<(permissionGranted: boolean) => void>()

    installWindowSecurity(harness.target, policy, { openExternal })

    harness.getPermissionRequestHandler()({}, 'notifications', callback, {})

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(false)
  })

  it.each([
    { permission: 'notifications', requestingOrigin: 'https://renderer.example' },
    { permission: 'geolocation', requestingOrigin: 'https://other.example' }
  ])(
    'recusa a verificação de $permission para $requestingOrigin',
    ({ permission, requestingOrigin }) => {
      const harness = createWindowSecurityHarness()
      const openExternal = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)

      installWindowSecurity(harness.target, policy, { openExternal })

      expect(harness.getPermissionCheckHandler()({}, permission, requestingOrigin, {})).toBe(false)
    }
  )
})
