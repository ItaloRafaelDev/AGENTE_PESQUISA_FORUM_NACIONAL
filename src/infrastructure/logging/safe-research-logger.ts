const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g

export type SafeLogWriter = (message: string) => void

export class SafeResearchLogger {
  constructor(
    private readonly write: SafeLogWriter = (message) => {
      process.stdout.write(message + '\n')
    }
  ) {}

  info(message: string): void {
    this.write(this.sanitizeMessage(message))
  }

  error(stage: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)

    this.write(this.sanitizeMessage('[' + stage + '] ' + message))
  }

  maskCpf(rawCpf: string): string {
    const digits = rawCpf.replace(/\D/g, '')

    if (digits.length !== 11) {
      return '[CPF_INVALIDO]'
    }

    return '***.***.***-' + digits.slice(-2)
  }

  sanitizeMessage(message: string): string {
    return message
      .replace(CPF_PATTERN, (cpf) => this.maskCpf(cpf))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1000)
  }
}
