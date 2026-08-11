import { describe, expect, it, vi } from 'vitest'
import { ExecutionControl } from '@/application/agent/execution-control'

describe('ExecutionControl', () => {
  it('faz STOP prevalecer sobre PAUSE e notifica uma vez por mudança', () => {
    const control = new ExecutionControl()
    const listener = vi.fn()
    control.token.subscribe(listener)

    control.requestPause()
    control.requestStop()
    control.requestPause()

    expect(control.token.directive).toBe('STOP')
    expect(control.token.isCancellationRequested).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('limpa PAUSE, remove listeners e isola falhas dos listeners', () => {
    const control = new ExecutionControl()
    const listener = vi.fn()
    const unsubscribe = control.token.subscribe(listener)
    control.token.subscribe(() => {
      throw new Error('falha de observador')
    })
    const subsequentListener = vi.fn()
    control.token.subscribe(subsequentListener)

    control.requestPause()
    unsubscribe()
    control.clearPause()

    expect(control.token.directive).toBe('NONE')
    expect(control.token.isCancellationRequested).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(subsequentListener).toHaveBeenCalledTimes(2)
  })

  it('não limpa STOP', () => {
    const control = new ExecutionControl()

    control.requestStop()
    control.clearPause()

    expect(control.token.directive).toBe('STOP')
  })
})
