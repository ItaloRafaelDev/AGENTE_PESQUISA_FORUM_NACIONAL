export class CircuitBreaker {
  private consecutiveFailures = 0

  constructor(private readonly threshold: number) {
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new Error('Limite do circuit breaker inválido')
    }
  }

  recordFailure(): void {
    this.consecutiveFailures += 1
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0
  }

  isOpen(): boolean {
    return this.consecutiveFailures >= this.threshold
  }

  getFailureCount(): number {
    return this.consecutiveFailures
  }
}
