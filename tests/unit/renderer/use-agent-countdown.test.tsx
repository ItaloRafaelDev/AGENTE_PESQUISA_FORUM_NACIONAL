// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAgentCountdown } from '@/renderer/src/hooks/use-agent-countdown'

afterEach(() => {
  vi.useRealTimers()
})

describe('useAgentCountdown', () => {
  it('calcula e reduz os segundos até a próxima verificação', () => {
    vi.useFakeTimers()

    vi.setSystemTime(new Date('2026-07-14T10:00:00.000Z'))

    const { result } = renderHook(() => useAgentCountdown('2026-07-14T10:01:00.000Z', 60))

    expect(result.current).toBe(60)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(result.current).toBe(55)
  })

  it('nunca retorna valor negativo', () => {
    vi.useFakeTimers()

    vi.setSystemTime(new Date('2026-07-14T10:01:10.000Z'))

    const { result } = renderHook(() => useAgentCountdown('2026-07-14T10:01:00.000Z', 0))

    expect(result.current).toBe(0)
  })

  it('usa o valor inicial quando nextCheckAt está ausente', () => {
    const { result } = renderHook(() => useAgentCountdown(null, 12))

    expect(result.current).toBe(12)
  })

  it('retorna null quando não existe contagem ativa', () => {
    const { result } = renderHook(() => useAgentCountdown(null, null))

    expect(result.current).toBeNull()
  })
})
