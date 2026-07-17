export function normalizeProcessSphere(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCriminalSphere(value: string | null | undefined): boolean {
  const normalized = normalizeProcessSphere(value)

  if (normalized === 'penal') {
    return true
  }

  return /(?:^|\s)criminal(?:\s|$)/.test(normalized)
}
