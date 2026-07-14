function extractCpfDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function calculateVerificationDigit(digits: string, initialWeight: number): number {
  const total = digits.split('').reduce((sum, digit, index) => {
    return sum + Number(digit) * (initialWeight - index)
  }, 0)

  const remainder = total % 11

  return remainder < 2 ? 0 : 11 - remainder
}

export function maskCpfForLog(value: string): string {
  const digits = extractCpfDigits(value)

  if (digits.length !== 11) {
    return '***'
  }

  return `***.***.***-${digits.slice(-2)}`
}

export function isValidCpf(value: string): boolean {
  const digits = extractCpfDigits(value)

  if (digits.length !== 11) {
    return false
  }

  if (/^(\d)\1{10}$/.test(digits)) {
    return false
  }

  const firstNineDigits = digits.slice(0, 9)
  const firstVerificationDigit = calculateVerificationDigit(firstNineDigits, 10)

  const firstTenDigits = `${firstNineDigits}${firstVerificationDigit}`
  const secondVerificationDigit = calculateVerificationDigit(firstTenDigits, 11)

  return digits === `${firstNineDigits}${firstVerificationDigit}${secondVerificationDigit}`
}
