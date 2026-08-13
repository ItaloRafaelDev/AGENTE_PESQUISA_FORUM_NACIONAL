// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMountedRef } from '@/renderer/src/features/dashboard/use-mounted-ref'
import { useOperationalLog } from '@/renderer/src/features/dashboard/use-operational-log'

afterEach(() => {
  vi.useRealTimers()
})

describe('dashboard operational hooks', () => {
  it('marks the mounted ref as false after unmount', () => {
    const { result, unmount } = renderHook(() => useMountedRef())

    expect(result.current.current).toBe(true)

    unmount()

    expect(result.current.current).toBe(false)
  })

  it('keeps the ten newest operational logs with Brazilian timestamps', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 14, 10, 0, 0))

    const { result } = renderHook(() => useOperationalLog())

    act(() => {
      for (let event = 1; event <= 11; event += 1) {
        result.current.addLog(`evento ${event}`)
      }
    })

    expect(result.current.logs).toHaveLength(10)
    expect(result.current.logs.map(({ message }) => message)).toEqual([
      'evento 11',
      'evento 10',
      'evento 9',
      'evento 8',
      'evento 7',
      'evento 6',
      'evento 5',
      'evento 4',
      'evento 3',
      'evento 2'
    ])
    expect(result.current.logs[0]).toMatchObject({ type: 'info', timestamp: '10:00:00' })
  })

  it('keeps addLog stable across unrelated rerenders', () => {
    const { result, rerender } = renderHook(() => useOperationalLog())
    const firstAddLog = result.current.addLog

    rerender()

    expect(result.current.addLog).toBe(firstAddLog)
  })
})
