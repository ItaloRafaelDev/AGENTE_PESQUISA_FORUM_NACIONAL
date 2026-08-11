import { describe, expect, it, vi } from 'vitest'
import {
  AgentStateMachine,
  type AgentProgressPatch,
  type AgentState
} from '@/application/agent/agent-state-machine'

type TransitionCase = {
  name: string
  arrange: (machine: AgentStateMachine) => void
  act: (machine: AgentStateMachine) => AgentState
  expected: AgentState['lifecycle']
}

const acceptedTransitions: TransitionCase[] = [
  {
    name: 'STOPPED -> STARTING',
    arrange: () => undefined,
    act: (machine) => machine.beginStart(),
    expected: 'STARTING'
  },
  {
    name: 'FAILED -> STARTING',
    arrange: (machine) => machine.markFailed(createError()),
    act: (machine) => machine.beginStart(),
    expected: 'STARTING'
  },
  {
    name: 'STARTING -> WAITING_LOGIN',
    arrange: (machine) => machine.beginStart(),
    act: (machine) => machine.waitForLogin(),
    expected: 'WAITING_LOGIN'
  },
  {
    name: 'STARTING -> IDLE',
    arrange: (machine) => machine.beginStart(),
    act: (machine) => machine.beginRun(),
    expected: 'IDLE'
  },
  {
    name: 'WAITING_LOGIN -> IDLE',
    arrange: (machine) => {
      machine.beginStart()
      machine.waitForLogin()
    },
    act: (machine) => machine.beginRun(),
    expected: 'IDLE'
  },
  {
    name: 'IDLE -> RUNNING',
    arrange: startIdle,
    act: (machine) => machine.markRunning(),
    expected: 'RUNNING'
  },
  {
    name: 'RUNNING -> IDLE',
    arrange: startRunning,
    act: (machine) => machine.markIdle(),
    expected: 'IDLE'
  },
  {
    name: 'RUNNING -> PAUSE_REQUESTED',
    arrange: startRunning,
    act: (machine) => machine.requestPause(),
    expected: 'PAUSE_REQUESTED'
  },
  {
    name: 'PAUSE_REQUESTED -> PAUSED',
    arrange: requestPause,
    act: (machine) => machine.markPaused(),
    expected: 'PAUSED'
  },
  {
    name: 'PAUSED -> STARTING',
    arrange: markPaused,
    act: (machine) => machine.resume(),
    expected: 'STARTING'
  },
  {
    name: 'PAUSE_REQUESTED -> STOP_REQUESTED',
    arrange: requestPause,
    act: (machine) => machine.requestStop(),
    expected: 'STOP_REQUESTED'
  },
  {
    name: 'STOP_REQUESTED -> STOPPED',
    arrange: (machine) => {
      startRunning(machine)
      machine.requestStop()
    },
    act: (machine) => machine.markStopped(),
    expected: 'STOPPED'
  },
  {
    name: 'RUNNING -> FAILED',
    arrange: startRunning,
    act: (machine) => machine.markFailed(createError()),
    expected: 'FAILED'
  }
]

describe('AgentStateMachine', () => {
  it('inicia em STOPPED com progresso público vazio', () => {
    expect(new AgentStateMachine().getSnapshot()).toEqual({
      lifecycle: 'STOPPED',
      currentStage: null,
      completedCycles: 0,
      queue: 'UNKNOWN',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  })

  it.each(acceptedTransitions)('aceita $name', ({ arrange, act, expected }) => {
    const machine = new AgentStateMachine()
    arrange(machine)

    expect(act(machine).lifecycle).toBe(expected)
  })

  it.each([
    ['waitForLogin', (machine: AgentStateMachine) => machine.waitForLogin()],
    ['beginRun', (machine: AgentStateMachine) => machine.beginRun()],
    ['markRunning', (machine: AgentStateMachine) => machine.markRunning()],
    ['markIdle', (machine: AgentStateMachine) => machine.markIdle()],
    ['markPaused', (machine: AgentStateMachine) => machine.markPaused()],
    ['markStopped', (machine: AgentStateMachine) => machine.markStopped()]
  ])('rejeita %s a partir de STOPPED', (_name, transition) => {
    expect(() => transition(new AgentStateMachine())).toThrow('Transição inválida de STOPPED')
  })

  it('preserva a mensagem pública ao rejeitar resume fora de PAUSED', () => {
    expect(() => new AgentStateMachine().resume()).toThrow('O agente não está pausado')
  })

  it('rejeita um novo início enquanto o agente não está estável', () => {
    const machine = new AgentStateMachine()
    machine.beginStart()

    expect(() => machine.beginStart()).toThrow('O agente já está em execução')
  })

  it('faz pause ser idempotente e emite somente uma vez pela mudança real', () => {
    const machine = new AgentStateMachine()
    const listener = vi.fn()
    startRunning(machine)
    machine.subscribe(listener)

    const first = machine.requestPause()
    const second = machine.requestPause()

    expect(first.lifecycle).toBe('PAUSE_REQUESTED')
    expect(second).toEqual(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('faz stop ser idempotente em STOPPED e STOP_REQUESTED', () => {
    const machine = new AgentStateMachine()
    const listener = vi.fn()
    machine.subscribe(listener)

    machine.requestStop()
    expect(listener).not.toHaveBeenCalled()

    startRunning(machine)
    listener.mockClear()

    const first = machine.requestStop()
    const second = machine.requestStop()

    expect(first.lifecycle).toBe('STOP_REQUESTED')
    expect(second).toEqual(first)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('mantém STOP prevalecendo sobre pause e conclusão tardia da pausa', () => {
    const machine = new AgentStateMachine()
    startRunning(machine)

    machine.requestPause()
    machine.requestStop()
    machine.requestPause()
    machine.markPaused()

    expect(machine.getSnapshot().lifecycle).toBe('STOP_REQUESTED')
  })

  it('preserva ciclos concluídos e limpa progresso ao iniciar novamente', () => {
    const machine = new AgentStateMachine()
    machine.updateProgress({
      completedCycles: 7,
      currentStage: 'SAVING_CPI',
      queue: 'EMPTY',
      nextCheckAt: '2026-07-14T20:00:00.000Z',
      remainingSeconds: 60,
      currentMaskedCpf: '***.***.***-01',
      lastError: createError()
    })
    machine.markFailed(createError())

    expect(machine.beginStart()).toEqual({
      lifecycle: 'STARTING',
      currentStage: null,
      completedCycles: 7,
      queue: 'UNKNOWN',
      nextCheckAt: null,
      remainingSeconds: null,
      currentMaskedCpf: null,
      lastError: null
    })
  })

  it('rejeita CPF completo e aceita somente a máscara pública aprovada', () => {
    const machine = new AgentStateMachine()

    expect(() => machine.updateProgress({ currentMaskedCpf: '12345678901' })).toThrow(
      'CPF público precisa estar mascarado'
    )
    expect(machine.updateProgress({ currentMaskedCpf: '***.***.***-01' }).currentMaskedCpf).toBe(
      '***.***.***-01'
    )
  })

  it('updateProgress não altera lifecycle nem emite para patch sem mudança real', () => {
    const machine = new AgentStateMachine()
    const listener = vi.fn()
    machine.subscribe(listener)

    machine.updateProgress({ lifecycle: 'RUNNING' } as AgentProgressPatch)
    machine.updateProgress({ completedCycles: 0, queue: 'UNKNOWN' })

    expect(machine.getSnapshot().lifecycle).toBe('STOPPED')
    expect(listener).not.toHaveBeenCalled()
  })

  it('permite limpar campos de progresso anuláveis', () => {
    const machine = new AgentStateMachine()
    machine.updateProgress({
      currentStage: 'WAITING_QUEUE',
      nextCheckAt: '2026-07-14T20:00:00.000Z',
      remainingSeconds: 60,
      currentMaskedCpf: '***.***.***-01',
      lastError: createError()
    })

    expect(
      machine.updateProgress({
        currentStage: null,
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: null
      })
    ).toEqual(
      expect.objectContaining({
        currentStage: null,
        nextCheckAt: null,
        remainingSeconds: null,
        currentMaskedCpf: null,
        lastError: null
      })
    )
  })

  it('protege estado, erro e eventos contra mutações externas', () => {
    const machine = new AgentStateMachine()
    const listener = vi.fn()
    const error = createError()
    machine.subscribe(listener)

    const updated = machine.markFailed(error)
    error.message = 'entrada alterada'
    updated.lifecycle = 'STOPPED'
    updated.lastError!.message = 'snapshot alterado'
    listener.mock.calls[0][0].lastError.message = 'evento alterado'

    expect(machine.getSnapshot()).toEqual(
      expect.objectContaining({
        lifecycle: 'FAILED',
        lastError: createError()
      })
    )
  })

  it('remove listeners e isola falhas de observadores', () => {
    const machine = new AgentStateMachine()
    const listener = vi.fn()
    const unsubscribe = machine.subscribe(listener)
    machine.subscribe(() => {
      throw new Error('falha de observador')
    })

    machine.beginStart()
    unsubscribe()
    machine.waitForLogin()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('preserva ordem e snapshots defensivos quando listener dispara transição reentrante', () => {
    const machine = new AgentStateMachine()
    const received: AgentState[] = []

    machine.subscribe((state) => {
      if (state.lifecycle === 'STARTING') {
        machine.waitForLogin()
      }
    })
    machine.subscribe((state) => {
      received.push(state)
    })

    const starting = machine.beginStart()

    expect(starting.lifecycle).toBe('STARTING')
    expect(received.map((state) => state.lifecycle)).toEqual(['STARTING', 'WAITING_LOGIN'])
    expect(received[0]).not.toBe(received[1])

    received[0].lifecycle = 'FAILED'

    expect(received[1].lifecycle).toBe('WAITING_LOGIN')
    expect(machine.getSnapshot().lifecycle).toBe('WAITING_LOGIN')
  })
})

function startIdle(machine: AgentStateMachine): void {
  machine.beginStart()
  machine.beginRun()
}

function startRunning(machine: AgentStateMachine): void {
  startIdle(machine)
  machine.markRunning()
}

function requestPause(machine: AgentStateMachine): void {
  startRunning(machine)
  machine.requestPause()
}

function markPaused(machine: AgentStateMachine): void {
  requestPause(machine)
  machine.markPaused()
}

function createError(): NonNullable<AgentState['lastError']> {
  return {
    stage: 'SAVING_CPI',
    message: 'Falha segura',
    occurredAt: '2026-07-14T20:00:00.000Z'
  }
}
