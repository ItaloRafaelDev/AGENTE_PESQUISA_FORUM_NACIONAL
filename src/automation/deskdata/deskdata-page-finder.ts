export interface DeskDataPageLike {
  url(): string
}

export function findDeskDataPeoplePage<T extends DeskDataPageLike>(
  pages: readonly T[]
): T | undefined {
  return pages.find((page) => {
    try {
      const url = new URL(page.url())

      const isDeskDataHost =
        url.hostname === 'deskdata.com.br' || url.hostname.endsWith('.deskdata.com.br')

      const isPeoplePath = url.pathname === '/pessoas' || url.pathname.startsWith('/pessoas/')

      return isDeskDataHost && isPeoplePath
    } catch {
      return false
    }
  })
}
