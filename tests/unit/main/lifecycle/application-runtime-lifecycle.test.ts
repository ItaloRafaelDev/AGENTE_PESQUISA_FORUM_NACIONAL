import { describe, expect, it } from 'vitest'
import { ApplicationRuntimeLifecycle } from '../../../../src/main/lifecycle/application-runtime-lifecycle'
import {
  ApplicationShutdown,
  type ShutdownComponent
} from '../../../../src/main/lifecycle/application-shutdown'

const shutdownComponents: readonly ShutdownComponent[] = [
  'AGENT',
  'BROWSER',
  'AGENT_IPC',
  'HISTORY_IPC',
  'HISTORY_REPOSITORY',
  'RUNTIME_REFERENCES'
]

describe('ApplicationRuntimeLifecycle', () => {
  it('aguarda a inicialização antes de encerrar e compartilha a operação de shutdown', async () => {
    const events: string[] = []
    let releaseInitialization: (() => void) | undefined
    const initializationBlocker = new Promise<void>((resolve) => {
      releaseInitialization = resolve
    })
    const lifecycle = new ApplicationRuntimeLifecycle(
      async () => {
        events.push('INITIALIZE_START')
        await initializationBlocker
        events.push('INITIALIZE_END')
      },
      () => {
        events.push('SHUTDOWN')
      }
    )

    const initialization = lifecycle.initialize()
    await Promise.resolve()

    const firstShutdown = lifecycle.shutdown()
    const concurrentShutdown = lifecycle.shutdown()

    expect(concurrentShutdown).toBe(firstShutdown)
    expect(events).toEqual(['INITIALIZE_START'])

    releaseInitialization?.()
    await initialization
    await firstShutdown

    expect(events).toEqual(['INITIALIZE_START', 'INITIALIZE_END', 'SHUTDOWN'])

    const completedShutdown = lifecycle.shutdown()

    expect(completedShutdown).toBe(firstShutdown)
    await completedShutdown
  })

  it('executa o shutdown depois de uma inicialização rejeitada sem propagar detalhes', async () => {
    const initializationFailure = new Error('detalhe interno da inicialização')
    const shutdownExecutions: ShutdownComponent[] = []
    const shutdownArguments: unknown[][] = []
    let rejectInitialization: ((reason?: unknown) => void) | undefined
    const initializationBlocker = new Promise<void>((_, reject) => {
      rejectInitialization = reject
    })
    void initializationBlocker.catch(() => undefined)
    const applicationShutdown = new ApplicationShutdown(
      () =>
        shutdownComponents.map((component) => ({
          component,
          execute(): void {
            shutdownExecutions.push(component)
          }
        })),
      () => undefined
    )
    const lifecycle = new ApplicationRuntimeLifecycle(
      () => initializationBlocker,
      (...received: unknown[]) => {
        shutdownArguments.push(received)

        return applicationShutdown.run()
      }
    )

    const initialization = lifecycle.initialize()
    await Promise.resolve()
    const shutdown = lifecycle.shutdown()

    rejectInitialization?.(initializationFailure)

    await expect(initialization).rejects.toBe(initializationFailure)
    await expect(shutdown).resolves.toBeUndefined()
    expect(shutdownExecutions).toEqual(shutdownComponents)
    expect(shutdownArguments).toEqual([[]])
    expect(shutdownArguments.flat()).not.toContain(initializationFailure)
  })

  it('recusa inicialização iniciada após shutdown sem criar recursos', async () => {
    let initializationCalls = 0
    let releaseShutdown: (() => void) | undefined
    const shutdownBlocker = new Promise<void>((resolve) => {
      releaseShutdown = resolve
    })
    const lifecycle = new ApplicationRuntimeLifecycle(
      () => {
        initializationCalls += 1
      },
      () => shutdownBlocker
    )

    const firstShutdown = lifecycle.shutdown()
    const concurrentShutdown = lifecycle.shutdown()

    expect(concurrentShutdown).toBe(firstShutdown)
    await expect(lifecycle.initialize()).rejects.toThrow(
      'Inicialização indisponível durante o encerramento seguro.'
    )
    expect(initializationCalls).toBe(0)

    releaseShutdown?.()
    await firstShutdown

    expect(lifecycle.shutdown()).toBe(firstShutdown)
    await expect(lifecycle.initialize()).rejects.toThrow(
      'Inicialização indisponível durante o encerramento seguro.'
    )
    expect(initializationCalls).toBe(0)
  })
})
