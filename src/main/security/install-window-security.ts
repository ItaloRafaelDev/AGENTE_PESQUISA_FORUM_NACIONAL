import { NavigationSecurityPolicy } from './navigation-security-policy'

export interface WindowSecurityTarget {
  readonly webContents: {
    on(
      event: 'will-navigate' | 'will-redirect',
      listener: (event: { preventDefault(): void; readonly url: string }) => void
    ): void
    setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
    readonly session: {
      setPermissionCheckHandler(
        handler: (
          webContents: unknown,
          permission: string,
          requestingOrigin: string,
          details: unknown
        ) => boolean
      ): void
      setPermissionRequestHandler(
        handler: (
          webContents: unknown,
          permission: string,
          callback: (permissionGranted: boolean) => void,
          details: unknown
        ) => void
      ): void
    }
  }
}

export interface WindowSecurityDependencies {
  openExternal(url: string): Promise<unknown>
}

export function installWindowSecurity(
  mainWindow: WindowSecurityTarget,
  policy: NavigationSecurityPolicy,
  dependencies: WindowSecurityDependencies
): void {
  const preventDisallowedNavigation = (event: {
    preventDefault(): void
    readonly url: string
  }): void => {
    if (!policy.isApprovedRendererNavigation(event.url)) {
      event.preventDefault()
    }
  }

  mainWindow.webContents.on('will-navigate', preventDisallowedNavigation)
  mainWindow.webContents.on('will-redirect', preventDisallowedNavigation)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const externalUrl = policy.getApprovedExternalUrl(details.url)
    if (externalUrl) {
      void dependencies.openExternal(externalUrl).catch(() => undefined)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.session.setPermissionCheckHandler(() => false)

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false)
    }
  )
}
