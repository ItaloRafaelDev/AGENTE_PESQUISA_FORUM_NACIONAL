export class RetryPolicy {
  constructor(private readonly delays: readonly number[]) {
    const isInvalid =
      delays.length === 0 ||
      delays.some((delay) => !Number.isFinite(delay) || !Number.isInteger(delay) || delay <= 0)

    if (isInvalid) {
      throw new Error('Política de retentativa inválida')
    }
  }

  canRetry(attempt: number): boolean {
    return Number.isInteger(attempt) && attempt >= 1 && attempt <= this.delays.length
  }

  getDelay(attempt: number): number {
    if (!this.canRetry(attempt)) {
      throw new Error(`Tentativa fora da política: ${attempt}`)
    }

    return this.delays[attempt - 1]
  }
}
