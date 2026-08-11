import { describe, expect, it } from 'vitest'
import { ExecutionControl } from '@/application/agent/execution-control'
import type {
  ResearchCycleFactory,
  ResearchCyclePort,
  ResearchQueuePort
} from '@/application/ports/continuous-research-ports'
import type { ResearchCycleResult } from '@/application/research/research-cycle-model'
import {
  RunContinuousResearch,
  type ContinuousResearchState
} from '@/application/research/run-continuous-research'

const MASKED_SYNTHETIC_CPF = '***.***.***-00'

function createCycleResult(): ResearchCycleResult {
  return {
    maskedCpf: MASKED_SYNTHETIC_CPF,
    selectedDatasetCount: 6,
    classification: 'HA_INFORMACOES',
    pdfPath: 'opaque-synthetic-report-reference',
    pdfSizeBytes: 128,
    saved: true,
    confirmationAccepted: true
  }
}

function createUseCase(input: {
  queue: ResearchQueuePort
  cycleFactory: ResearchCycleFactory
  queueCheckIntervalMs?: number
}): RunContinuousResearch {
  return new RunContinuousResearch(
    {
      queue: input.queue,
      cycleFactory: input.cycleFactory
    },
    input.queueCheckIntervalMs
  )
}

describe('RunContinuousResearch', () => {
  it('emits WAITING_QUEUE e IDLE enquanto a fila vazia volta a ser consultada', async () => {
    const control = new ExecutionControl()
    const states: ContinuousResearchState[] = []
    let waitCalls = 0

    const result = await createUseCase({
      queue: {
        async waitForResearch(input) {
          waitCalls += 1

          if (waitCalls === 1) {
            input.onState('EMPTY', 1)
            input.onState('AVAILABLE', 2)

            return { status: 'AVAILABLE', checks: 2 }
          }

          control.requestStop()
          return { status: 'CANCELLED', checks: 0 }
        }
      },
      cycleFactory: {
        create(): ResearchCyclePort {
          return {
            async execute() {
              return createCycleResult()
            }
          }
        }
      },
      queueCheckIntervalMs: 61_111
    }).execute({
      token: control.token,
      onState(state) {
        states.push(state)
      }
    })

    expect(states).toEqual([
      { type: 'WAITING_QUEUE', checks: 0 },
      { type: 'WAITING_QUEUE', checks: 1 },
      { type: 'IDLE', nextCheckInMs: 61_111 },
      { type: 'WAITING_QUEUE', checks: 2 },
      { type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 2 },
      { type: 'CYCLE_COMPLETED', cycle: 1, result: createCycleResult() },
      { type: 'WAITING_QUEUE', checks: 0 },
      { type: 'STOPPED', cycles: 1 }
    ])
    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    })
  })

  it('creates exactly one cycle for one available queue item', async () => {
    const control = new ExecutionControl()
    let createdCycles = 0
    let executedCycles = 0

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          return { status: 'AVAILABLE', checks: 1 }
        }
      },
      cycleFactory: {
        create() {
          createdCycles += 1

          return {
            async execute() {
              executedCycles += 1
              control.requestStop()

              return createCycleResult()
            }
          }
        }
      }
    }).execute({ token: control.token })

    expect(createdCycles).toBe(1)
    expect(executedCycles).toBe(1)
    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    })
  })

  it('increments completed cycles only after a cycle resolves successfully', async () => {
    const control = new ExecutionControl()
    const states: ContinuousResearchState[] = []
    const failure = new Error('synthetic cycle failure')

    await expect(
      createUseCase({
        queue: {
          async waitForResearch() {
            return { status: 'AVAILABLE', checks: 1 }
          }
        },
        cycleFactory: {
          create() {
            return {
              async execute() {
                control.requestStop()
                throw failure
              }
            }
          }
        }
      }).execute({
        token: control.token,
        onState(state) {
          states.push(state)
        }
      })
    ).rejects.toBe(failure)

    expect(states).toEqual([
      { type: 'WAITING_QUEUE', checks: 0 },
      { type: 'RESEARCH_AVAILABLE', cycle: 1, checks: 1 }
    ])
  })

  it('returns STOPPED_BY_REQUEST when STOP is requested before the next cycle', async () => {
    const control = new ExecutionControl()
    let queueCalls = 0
    let createdCycles = 0

    control.requestStop()

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          queueCalls += 1
          return { status: 'AVAILABLE', checks: 1 }
        }
      },
      cycleFactory: {
        create() {
          createdCycles += 1
          throw new Error('A factory não deveria criar um ciclo.')
        }
      }
    }).execute({ token: control.token })

    expect(queueCalls).toBe(0)
    expect(createdCycles).toBe(0)
    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 0
    })
  })

  it('returns STOPPED_BY_SIGNAL when the queue cancels without a stop request', async () => {
    const control = new ExecutionControl()
    let createdCycles = 0

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          return { status: 'CANCELLED', checks: 3 }
        }
      },
      cycleFactory: {
        create() {
          createdCycles += 1
          throw new Error('A factory não deveria criar um ciclo.')
        }
      }
    }).execute({ token: control.token })

    expect(createdCycles).toBe(0)
    expect(result).toEqual({
      status: 'STOPPED_BY_SIGNAL',
      completedCycles: 0
    })
  })

  it('gives an explicit STOP precedence when the queue returns CANCELLED', async () => {
    const control = new ExecutionControl()

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          control.requestStop()
          return { status: 'CANCELLED', checks: 3 }
        }
      },
      cycleFactory: {
        create() {
          throw new Error('A factory não deveria criar um ciclo.')
        }
      }
    }).execute({ token: control.token })

    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 0
    })
  })

  it.each(['PAUSE', 'STOP'] as const)(
    'does not start queue waiting after WAITING_QUEUE requests %s',
    async (directive) => {
      const control = new ExecutionControl()
      let queueCalls = 0

      const result = await createUseCase({
        queue: {
          async waitForResearch() {
            queueCalls += 1
            throw new Error('A fila não deveria ser aguardada.')
          }
        },
        cycleFactory: {
          create() {
            throw new Error('A factory não deveria criar um ciclo.')
          }
        }
      }).execute({
        token: control.token,
        onState(state) {
          if (state.type !== 'WAITING_QUEUE' || state.checks !== 0) {
            return
          }

          if (directive === 'PAUSE') {
            control.requestPause()
          } else {
            control.requestStop()
          }
        }
      })

      expect(queueCalls).toBe(0)
      expect(result).toEqual({
        status: directive === 'STOP' ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL',
        completedCycles: 0
      })
    }
  )

  it('does not begin an available cycle after its state callback requests STOP', async () => {
    const control = new ExecutionControl()
    let createdCycles = 0

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          return { status: 'AVAILABLE', checks: 1 }
        }
      },
      cycleFactory: {
        create() {
          createdCycles += 1
          throw new Error('A factory não deveria criar um ciclo.')
        }
      }
    }).execute({
      token: control.token,
      onState(state) {
        if (state.type === 'RESEARCH_AVAILABLE') {
          control.requestStop()
        }
      }
    })

    expect(createdCycles).toBe(0)
    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 0
    })
  })

  it.each(['PAUSE', 'STOP'] as const)(
    'does not begin a cycle after %s is requested while waiting for the queue',
    async (directive) => {
      const control = new ExecutionControl()
      let createdCycles = 0

      const result = await createUseCase({
        queue: {
          async waitForResearch() {
            if (directive === 'PAUSE') {
              control.requestPause()
            } else {
              control.requestStop()
            }

            return { status: 'AVAILABLE', checks: 1 }
          }
        },
        cycleFactory: {
          create() {
            createdCycles += 1
            throw new Error('A factory não deveria criar um ciclo.')
          }
        }
      }).execute({ token: control.token })

      expect(createdCycles).toBe(0)
      expect(result).toEqual({
        status: directive === 'STOP' ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL',
        completedCycles: 0
      })
    }
  )

  it.each(['PAUSE', 'STOP'] as const)(
    'does not start another queue wait after CYCLE_COMPLETED requests %s',
    async (directive) => {
      const control = new ExecutionControl()
      let queueCalls = 0
      let cycleCalls = 0

      const result = await createUseCase({
        queue: {
          async waitForResearch() {
            queueCalls += 1
            return { status: 'AVAILABLE', checks: 1 }
          }
        },
        cycleFactory: {
          create() {
            return {
              async execute() {
                cycleCalls += 1
                return createCycleResult()
              }
            }
          }
        }
      }).execute({
        token: control.token,
        onState(state) {
          if (state.type !== 'CYCLE_COMPLETED') {
            return
          }

          if (directive === 'PAUSE') {
            control.requestPause()
          } else {
            control.requestStop()
          }
        }
      })

      expect(queueCalls).toBe(1)
      expect(cycleCalls).toBe(1)
      expect(result).toEqual({
        status: directive === 'STOP' ? 'STOPPED_BY_REQUEST' : 'STOPPED_BY_SIGNAL',
        completedCycles: 1
      })
    }
  )

  it('preserves cycle numbering for stage and masked identity callbacks', async () => {
    const control = new ExecutionControl()
    const stages: Array<{ cycle: number; stage: string }> = []
    const identities: Array<{ cycle: number; maskedCpf: string }> = []
    let queueCalls = 0

    const result = await createUseCase({
      queue: {
        async waitForResearch() {
          queueCalls += 1

          if (queueCalls === 2) {
            control.requestStop()
            return { status: 'CANCELLED', checks: 0 }
          }

          return { status: 'AVAILABLE', checks: 4 }
        }
      },
      cycleFactory: {
        create() {
          return {
            async execute(input) {
              input.hooks?.onStage?.('PREPARING_DESKDATA')
              input.hooks?.onIdentity?.(MASKED_SYNTHETIC_CPF)

              return createCycleResult()
            }
          }
        }
      }
    }).execute({
      token: control.token,
      onCycleStage(cycle, stage) {
        stages.push({ cycle, stage })
      },
      onCycleIdentity(cycle, maskedCpf) {
        identities.push({ cycle, maskedCpf })
      }
    })

    expect(stages).toEqual([{ cycle: 1, stage: 'PREPARING_DESKDATA' }])
    expect(identities).toEqual([{ cycle: 1, maskedCpf: MASKED_SYNTHETIC_CPF }])
    expect(result).toEqual({
      status: 'STOPPED_BY_REQUEST',
      completedCycles: 1
    })
  })
})
