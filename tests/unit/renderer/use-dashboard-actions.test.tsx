// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDashboardActions } from '@/renderer/src/features/dashboard/use-dashboard-actions'
import { useMountedRef } from '@/renderer/src/features/dashboard/use-mounted-ref'

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDashboardActions', () => {
  it('locks globally before awaiting and ignores a concurrent primary action', async () => {
    const primary = deferred<string>()
    const firstAction = vi.fn(() => primary.promise)
    const secondAction = vi.fn().mockResolvedValue('second')
    const addLog = vi.fn()
    const { result } = renderHook(() => {
      const mountedRef = useMountedRef()
      return useDashboardActions(addLog, mountedRef)
    })

    let firstRun!: Promise<void>
    await act(async () => {
      firstRun = result.current.runAction({
        actionName: 'agent-start',
        action: firstAction,
        onSuccess: vi.fn(),
        successMessage: 'Agente iniciado.'
      })
      void result.current.runAction({
        actionName: 'browser-start',
        action: secondAction,
        onSuccess: vi.fn(),
        successMessage: 'Navegador aberto com sucesso.'
      })
      await Promise.resolve()
    })

    expect(result.current.busyAction).toBe('agent-start')
    expect(firstAction).toHaveBeenCalledTimes(1)
    expect(secondAction).not.toHaveBeenCalled()

    await act(async () => {
      primary.resolve('first')
      await firstRun
    })

    expect(result.current.busyAction).toBeNull()
  })

  it('awaits success handling before logging and always releases the lock', async () => {
    const order: string[] = []
    const addLog = vi.fn(() => order.push('log'))
    const { result } = renderHook(() => {
      const mountedRef = useMountedRef()
      return useDashboardActions(addLog, mountedRef)
    })

    await act(async () => {
      await result.current.runAction({
        actionName: 'browser-stop',
        action: vi.fn().mockResolvedValue('stopped'),
        onSuccess: vi.fn(async () => {
          await Promise.resolve()
          order.push('success')
        }),
        successMessage: 'Navegador encerrado com segurança.'
      })
    })

    expect(order).toEqual(['success', 'log'])
    expect(addLog).toHaveBeenCalledWith('Navegador encerrado com segurança.', 'success')
    expect(result.current.busyAction).toBeNull()
  })

  it.each([
    [new Error('Falha primária exata.'), 'Falha primária exata.'],
    [{ reason: 'not-an-error' }, 'Falha inesperada.']
  ])('logs primary failures without leaking a busy lock', async (failure, expectedMessage) => {
    const addLog = vi.fn()
    const { result } = renderHook(() => {
      const mountedRef = useMountedRef()
      return useDashboardActions(addLog, mountedRef)
    })

    await act(async () => {
      await result.current.runAction({
        actionName: 'agent-pause',
        action: vi.fn().mockRejectedValue(failure),
        onSuccess: vi.fn(),
        successMessage: 'Pausa segura solicitada.'
      })
    })

    expect(addLog).toHaveBeenCalledWith(expectedMessage, 'error')
    expect(result.current.busyAction).toBeNull()
  })

  it.each(['resolve', 'reject'] as const)(
    'does not run success handling or log when the primary action %s after unmount',
    async (outcome) => {
      const primary = deferred<string>()
      const addLog = vi.fn()
      const onSuccess = vi.fn()
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const { result, unmount } = renderHook(() => {
        const mountedRef = useMountedRef()
        return useDashboardActions(addLog, mountedRef)
      })
      let run!: Promise<void>
      act(() => {
        run = result.current.runAction({
          actionName: 'agent-resume',
          action: () => primary.promise,
          onSuccess,
          successMessage: 'Execução retomada.'
        })
      })

      unmount()
      await act(async () => {
        if (outcome === 'resolve') {
          primary.resolve('resumed')
        } else {
          primary.reject(new Error('Falha depois do unmount.'))
        }
        await run
      })

      expect(onSuccess).not.toHaveBeenCalled()
      expect(addLog).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
    }
  )
})
