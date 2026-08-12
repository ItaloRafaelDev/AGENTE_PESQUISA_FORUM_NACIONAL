import { describe, expect, it } from 'vitest'
import {
  ApplicationShutdown,
  type ShutdownComponent,
  type ShutdownStep
} from '../../../../src/main/lifecycle/application-shutdown'

const components: readonly ShutdownComponent[] = [
  'AGENT',
  'BROWSER',
  'AGENT_IPC',
  'HISTORY_IPC',
  'HISTORY_REPOSITORY',
  'RUNTIME_REFERENCES'
]

describe('ApplicationShutdown', () => {
  it('compartilha uma única operação e executa as etapas uma vez na ordem declarada', async () => {
    const executions: ShutdownComponent[] = []
    let releaseFirstStep: (() => void) | undefined
    const firstStepBlocker = new Promise<void>((resolve) => {
      releaseFirstStep = resolve
    })
    const steps: readonly ShutdownStep[] = components.map((component, index) => ({
      component,
      async execute(): Promise<void> {
        executions.push(component)

        if (index === 0) {
          await firstStepBlocker
        }
      }
    }))
    const shutdown = new ApplicationShutdown(
      () => steps,
      () => undefined
    )

    const firstOperation = shutdown.run()
    const concurrentOperation = shutdown.run()

    expect(concurrentOperation).toBe(firstOperation)
    expect(executions).toEqual(['AGENT'])

    releaseFirstStep?.()
    await firstOperation

    expect(executions).toEqual(components)

    const completedOperation = shutdown.run()

    expect(completedOperation).toBe(firstOperation)
    await completedOperation
    expect(executions).toEqual(components)
  })

  it('reporta apenas o componente de falhas síncrona e assíncrona e conclui etapas posteriores', async () => {
    const syncFailure = new Error('detalhe interno síncrono')
    const asyncFailure = { detail: 'detalhe interno assíncrono' }
    const executions: ShutdownComponent[] = []
    const reports: unknown[][] = []
    const steps: readonly ShutdownStep[] = components.map((component) => ({
      component,
      execute(): void | Promise<void> {
        executions.push(component)

        if (component === 'AGENT') {
          throw syncFailure
        }

        if (component === 'BROWSER') {
          return Promise.reject(asyncFailure)
        }
      }
    }))
    const shutdown = new ApplicationShutdown(
      () => steps,
      (...received: unknown[]) => {
        reports.push(received)
      }
    )

    await expect(shutdown.run()).resolves.toBeUndefined()

    expect(executions).toEqual(components)
    expect(reports).toEqual([['AGENT'], ['BROWSER']])
    expect(reports.flat()).not.toContain(syncFailure)
    expect(reports.flat()).not.toContain(asyncFailure)
  })

  it('conclui as etapas e resolve quando o reporter também lança', async () => {
    const stepFailure = new Error('detalhe interno da etapa')
    const executions: ShutdownComponent[] = []
    const reports: unknown[][] = []
    let runtimeReferencesCleared = false
    const shutdown = new ApplicationShutdown(
      () =>
        components.map((component) => ({
          component,
          execute(): void {
            executions.push(component)

            if (component === 'AGENT') {
              throw stepFailure
            }

            if (component === 'RUNTIME_REFERENCES') {
              runtimeReferencesCleared = true
            }
          }
        })),
      (...received: unknown[]) => {
        reports.push(received)
        throw new Error('reporter indisponível')
      }
    )

    await expect(shutdown.run()).resolves.toBeUndefined()

    expect(executions).toEqual(components)
    expect(runtimeReferencesCleared).toBe(true)
    expect(reports).toEqual([['AGENT']])
    expect(reports.flat()).not.toContain(stepFailure)
  })
})
