import { useEffect, useState } from 'react'

function calculateRemainingSeconds(
  nextCheckAt: string | null,
  fallback: number | null
): number | null {
  if (!nextCheckAt) {
    return fallback
  }

  const timestamp = Date.parse(nextCheckAt)

  if (Number.isNaN(timestamp)) {
    return fallback
  }

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
}

export function useAgentCountdown(
  nextCheckAt: string | null,
  fallback: number | null
): number | null {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    calculateRemainingSeconds(nextCheckAt, fallback)
  )

  useEffect(() => {
    function update(): void {
      setRemainingSeconds(calculateRemainingSeconds(nextCheckAt, fallback))
    }

    update()

    if (!nextCheckAt) {
      return
    }

    const interval = window.setInterval(update, 1_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [nextCheckAt, fallback])

  return remainingSeconds
}
