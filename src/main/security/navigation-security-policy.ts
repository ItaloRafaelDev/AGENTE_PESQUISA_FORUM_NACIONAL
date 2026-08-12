import { isApprovedRendererUrl } from './renderer-location'

export class NavigationSecurityPolicy {
  constructor(private readonly approvedRendererUrl: URL) {}

  isApprovedRendererNavigation(rawUrl: string): boolean {
    return isApprovedRendererUrl(rawUrl, this.approvedRendererUrl)
  }

  getApprovedExternalUrl(rawUrl: string): string | null {
    try {
      const parsedUrl = new URL(rawUrl)

      return parsedUrl.protocol === 'https:' ? parsedUrl.href : null
    } catch {
      return null
    }
  }
}
