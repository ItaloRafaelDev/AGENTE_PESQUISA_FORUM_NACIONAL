export type ShutdownComponent =
  'AGENT' | 'BROWSER' | 'AGENT_IPC' | 'HISTORY_IPC' | 'HISTORY_REPOSITORY' | 'RUNTIME_REFERENCES'

export interface ShutdownStep {
  component: ShutdownComponent
  execute(): void | Promise<void>
}

export type ShutdownFailureReporter = (component: ShutdownComponent) => void

export class ApplicationShutdown {
  private operation: Promise<void> | null = null

  constructor(
    private readonly createSteps: () => readonly ShutdownStep[],
    private readonly reportFailure: ShutdownFailureReporter
  ) {}

  run(): Promise<void> {
    if (!this.operation) {
      this.operation = this.executeOnce()
    }

    return this.operation
  }

  private async executeOnce(): Promise<void> {
    for (const step of this.createSteps()) {
      try {
        await step.execute()
      } catch {
        try {
          this.reportFailure(step.component)
        } catch {
          // Failure reporting must never interrupt the remaining shutdown steps.
        }
      }
    }
  }
}
