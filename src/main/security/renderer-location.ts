import { pathToFileURL } from 'node:url'

export interface RendererLocationInput {
  developmentUrl: string | undefined
  productionHtmlPath: string
}

export function resolveApprovedRendererUrl(input: RendererLocationInput): URL {
  if (input.developmentUrl !== undefined) {
    try {
      return new URL(input.developmentUrl)
    } catch {
      throw new Error('URL de desenvolvimento do renderer inválida.')
    }
  }

  return pathToFileURL(input.productionHtmlPath)
}

export function isApprovedRendererUrl(candidate: string, approved: URL): boolean {
  try {
    return new URL(candidate).href === approved.href
  } catch {
    return false
  }
}
