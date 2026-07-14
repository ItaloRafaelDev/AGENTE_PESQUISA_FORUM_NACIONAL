export interface CpiFieldStructure {
  label: string
  tag: string
  id: string
  className: string
  directTextLength: number
  fullTextLength: number
  childCount: number
  parentTag: string
  parentId: string
  parentClassName: string
  parentTextLength: number
  nextSiblingTag: string
  nextSiblingId: string
  nextSiblingClassName: string
  nextSiblingTextLength: number
}

export function evaluateCpiFieldStructures(
  body: HTMLElement,
  labels: readonly string[]
): CpiFieldStructure[] {
  const normalizedLabels = labels.map((label) => ({
    original: label,
    normalized: label.replace(/\s+/g, ' ').trim().toLowerCase()
  }))

  const allElements = Array.from(body.querySelectorAll('*'))
  const results: CpiFieldStructure[] = []

  for (const element of allElements) {
    const fullText = (element.textContent ?? '').replace(/\s+/g, ' ').trim()

    if (!fullText) {
      continue
    }

    const matchingLabel = normalizedLabels.find(({ normalized }) =>
      fullText.toLowerCase().startsWith(normalized)
    )

    if (!matchingLabel) {
      continue
    }

    const childHasSameLabel = Array.from(element.children).some((child) =>
      (child.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .startsWith(matchingLabel.normalized)
    )

    if (childHasSameLabel) {
      continue
    }

    const directText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    const htmlElement = element as HTMLElement
    const parent = element.parentElement
    const nextSibling = element.nextElementSibling as HTMLElement | null

    results.push({
      label: matchingLabel.original,
      tag: element.tagName.toLowerCase(),
      id: htmlElement.id ?? '',
      className: typeof htmlElement.className === 'string' ? htmlElement.className : '',
      directTextLength: directText.length,
      fullTextLength: fullText.length,
      childCount: element.children.length,
      parentTag: parent?.tagName.toLowerCase() ?? '',
      parentId: parent?.id ?? '',
      parentClassName: typeof parent?.className === 'string' ? parent.className : '',
      parentTextLength: (parent?.textContent ?? '').replace(/\s+/g, ' ').trim().length,
      nextSiblingTag: nextSibling?.tagName.toLowerCase() ?? '',
      nextSiblingId: nextSibling?.id ?? '',
      nextSiblingClassName: typeof nextSibling?.className === 'string' ? nextSibling.className : '',
      nextSiblingTextLength: (nextSibling?.textContent ?? '').replace(/\s+/g, ' ').trim().length
    })
  }

  return results
}
