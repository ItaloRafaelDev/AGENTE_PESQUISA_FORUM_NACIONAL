import { useCallback, useMemo, useRef, useState } from 'react'
import type { DashboardActionName } from './dashboard-model'
import type { OperationalLogController } from './use-operational-log'

export interface DashboardActionInput<T> {
  actionName: DashboardActionName
  action(): Promise<T>
  onSuccess(result: T): void | Promise<void>
  successMessage: string
}

export interface DashboardActionController {
  busyAction: DashboardActionName | null
  runAction<T>(input: DashboardActionInput<T>): Promise<void>
}

export function useDashboardActions(
  addLog: OperationalLogController['addLog'],
  mountedRef: React.RefObject<boolean>
): DashboardActionController {
  const [busyAction, setBusyAction] = useState<DashboardActionName | null>(null)
  const busyActionRef = useRef<DashboardActionName | null>(null)

  const runAction = useCallback(
    async <T>({
      actionName,
      action,
      onSuccess,
      successMessage
    }: DashboardActionInput<T>): Promise<void> => {
      if (!mountedRef.current || busyActionRef.current !== null) {
        return
      }

      busyActionRef.current = actionName
      setBusyAction(actionName)

      try {
        const result = await action()

        if (!mountedRef.current) {
          return
        }

        await onSuccess(result)

        if (mountedRef.current) {
          addLog(successMessage, 'success')
        }
      } catch (error: unknown) {
        if (mountedRef.current) {
          addLog(error instanceof Error ? error.message : 'Falha inesperada.', 'error')
        }
      } finally {
        busyActionRef.current = null

        if (mountedRef.current) {
          setBusyAction(null)
        }
      }
    },
    [addLog, mountedRef]
  )

  return useMemo(() => ({ busyAction, runAction }), [busyAction, runAction])
}
