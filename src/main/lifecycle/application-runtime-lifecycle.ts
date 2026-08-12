export type ApplicationInitializer = () => void | Promise<void>

export type ApplicationFinalizer = () => void | Promise<void>

const INITIALIZATION_REFUSED_MESSAGE = 'Inicialização indisponível durante o encerramento seguro.'

export class ApplicationRuntimeLifecycle {
  private initializationOperation: Promise<void> | null = null

  private shutdownOperation: Promise<void> | null = null

  private shutdownRequested = false

  constructor(
    private readonly initializeApplication: ApplicationInitializer,
    private readonly shutdownApplication: ApplicationFinalizer
  ) {}

  initialize(): Promise<void> {
    if (this.shutdownRequested) {
      return Promise.reject(new Error(INITIALIZATION_REFUSED_MESSAGE))
    }

    if (!this.initializationOperation) {
      this.initializationOperation = Promise.resolve().then(() => this.initializeApplication())
    }

    return this.initializationOperation
  }

  shutdown(): Promise<void> {
    if (!this.shutdownOperation) {
      this.shutdownRequested = true
      this.shutdownOperation = Promise.resolve().then(() => this.shutdownAfterInitialization())
    }

    return this.shutdownOperation
  }

  private async shutdownAfterInitialization(): Promise<void> {
    try {
      await this.initializationOperation
    } catch {
      // Partially initialized resources still need the complete shutdown sequence.
    }

    await this.shutdownApplication()
  }
}
