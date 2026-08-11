export type ExecutionDirective = 'NONE' | 'PAUSE' | 'STOP'

export interface ExecutionToken {
  readonly directive: ExecutionDirective
  readonly isCancellationRequested: boolean
  subscribe(listener: () => void): () => void
}

export class ExecutionControl {
  private directive: ExecutionDirective = 'NONE'
  private readonly listeners = new Set<() => void>()

  readonly token: ExecutionToken

  constructor() {
    const getDirective = (): ExecutionDirective => this.directive

    this.token = {
      get directive(): ExecutionDirective {
        return getDirective()
      },
      get isCancellationRequested(): boolean {
        return getDirective() === 'STOP'
      },
      subscribe: (listener) => this.subscribe(listener)
    }
  }

  requestPause(): void {
    if (this.directive === 'NONE') {
      this.changeDirective('PAUSE')
    }
  }

  requestStop(): void {
    if (this.directive !== 'STOP') {
      this.changeDirective('STOP')
    }
  }

  clearPause(): void {
    if (this.directive === 'PAUSE') {
      this.changeDirective('NONE')
    }
  }

  private subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private changeDirective(directive: ExecutionDirective): void {
    this.directive = directive

    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        // Listener failures must not prevent other listeners from being notified.
      }
    }
  }
}
