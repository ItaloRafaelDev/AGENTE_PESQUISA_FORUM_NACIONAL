import { useCallback, useState } from 'react'
import { formatLogTime, type OperationalLogEntry } from './dashboard-model'

export interface OperationalLogController {
  logs: readonly OperationalLogEntry[]
  addLog(message: string, type?: OperationalLogEntry['type']): void
}

export function useOperationalLog(): OperationalLogController {
  const [logs, setLogs] = useState<OperationalLogEntry[]>([])

  const addLog = useCallback(
    (message: string, type: OperationalLogEntry['type'] = 'info'): void => {
      setLogs((currentLogs) =>
        [
          {
            id: Date.now(),
            message,
            type,
            timestamp: formatLogTime(new Date())
          },
          ...currentLogs
        ].slice(0, 10)
      )
    },
    []
  )

  return { logs, addLog }
}
