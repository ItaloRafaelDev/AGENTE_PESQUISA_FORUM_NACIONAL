import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentApi } from '../../../../shared/types/agent-api'
import type { PdfActionResult } from '../../../../shared/types/pdf-api'
import type { ResearchHistoryRecord } from '../../../../shared/types/history-api'
import { getAgentApi } from '../../api/agent-api'
import { useMountedRef } from '../dashboard/use-mounted-ref'
import { RESEARCH_HISTORY_PAGE_SIZE, upsertResearchHistoryRecord } from './research-history-model'

export interface ResearchHistoryController {
  records: readonly ResearchHistoryRecord[]
  loading: boolean
  busy: boolean
  feedback: string | null
  openPdf(pdfPath: string): Promise<void>
  revealPdf(pdfPath: string): Promise<void>
  clearHistory(): Promise<void>
}

interface HistoryAction<T> {
  command(): Promise<T>
  onSuccess(result: T): void
  fallbackError: string
}

type HistoryHydrationEvent = { type: 'UPSERT'; record: ResearchHistoryRecord } | { type: 'CLEARED' }

function applyHistoryEvent(
  records: readonly ResearchHistoryRecord[],
  event: HistoryHydrationEvent
): ResearchHistoryRecord[] {
  return event.type === 'CLEARED' ? [] : upsertResearchHistoryRecord(records, event.record)
}

export function useResearchHistory(injectedApi?: AgentApi): ResearchHistoryController {
  const [api] = useState<AgentApi>(() => injectedApi ?? getAgentApi())
  const [records, setRecords] = useState<ResearchHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  const busyRef = useRef(false)
  const hydrationEventSinkRef = useRef<(event: HistoryHydrationEvent) => void>(() => undefined)

  useEffect(() => {
    let active = true
    let hydrating = true
    const hydrationJournal: HistoryHydrationEvent[] = []

    function journalHydrationEvent(event: HistoryHydrationEvent): void {
      if (active && mountedRef.current && hydrating) {
        hydrationJournal.push(event)
      }
    }

    hydrationEventSinkRef.current = journalHydrationEvent

    function applyRealtimeEvent(event: HistoryHydrationEvent): void {
      if (!active || !mountedRef.current) {
        return
      }

      journalHydrationEvent(event)
      setRecords((current) => applyHistoryEvent(current, event))
    }

    void api.history
      .list({ page: 1, pageSize: RESEARCH_HISTORY_PAGE_SIZE })
      .then((historyPage) => {
        if (!active || !mountedRef.current) {
          return
        }

        hydrating = false
        setRecords(
          hydrationJournal.reduce<ResearchHistoryRecord[]>(applyHistoryEvent, historyPage.items)
        )
        hydrationJournal.length = 0
      })
      .catch((error: unknown) => {
        if (active && mountedRef.current) {
          hydrating = false
          hydrationJournal.length = 0
          setFeedback(error instanceof Error ? error.message : 'Falha ao carregar o histórico.')
        }
      })
      .finally(() => {
        if (active && mountedRef.current) {
          setLoading(false)
        }
      })

    const unsubscribeCreated = api.history.onRecordCreated((record) => {
      applyRealtimeEvent({ type: 'UPSERT', record })
    })
    const unsubscribeUpdated = api.history.onRecordUpdated((record) => {
      applyRealtimeEvent({ type: 'UPSERT', record })
    })
    const unsubscribeCleared = api.history.onCleared(() => {
      applyRealtimeEvent({ type: 'CLEARED' })
    })

    return () => {
      active = false
      hydrating = false
      hydrationJournal.length = 0
      if (hydrationEventSinkRef.current === journalHydrationEvent) {
        hydrationEventSinkRef.current = () => undefined
      }
      unsubscribeCreated()
      unsubscribeUpdated()
      unsubscribeCleared()
    }
  }, [api, mountedRef])

  const executeAction = useCallback(
    async <T>({ command, onSuccess, fallbackError }: HistoryAction<T>): Promise<void> => {
      if (!mountedRef.current || busyRef.current) {
        return
      }

      busyRef.current = true
      setBusy(true)
      setFeedback(null)

      try {
        const result = await command()

        if (mountedRef.current) {
          onSuccess(result)
        }
      } catch (error: unknown) {
        if (mountedRef.current) {
          setFeedback(error instanceof Error ? error.message : fallbackError)
        }
      } finally {
        busyRef.current = false

        if (mountedRef.current) {
          setBusy(false)
        }
      }
    },
    [mountedRef]
  )

  const executePdfAction = useCallback(
    async (action: 'OPEN' | 'REVEAL', pdfPath: string): Promise<void> => {
      await executeAction<PdfActionResult>({
        command: () => (action === 'OPEN' ? api.pdf.open(pdfPath) : api.pdf.reveal(pdfPath)),
        onSuccess: (result) => {
          if (result.status === 'NOT_FOUND') {
            setFeedback('PDF não encontrado.')
            return
          }

          setFeedback(action === 'OPEN' ? 'PDF aberto.' : 'PDF localizado na pasta.')
        },
        fallbackError: 'Falha ao acessar o PDF.'
      })
    },
    [api, executeAction]
  )

  const openPdf = useCallback(
    async (pdfPath: string): Promise<void> => executePdfAction('OPEN', pdfPath),
    [executePdfAction]
  )
  const revealPdf = useCallback(
    async (pdfPath: string): Promise<void> => executePdfAction('REVEAL', pdfPath),
    [executePdfAction]
  )
  const clearHistory = useCallback(async (): Promise<void> => {
    await executeAction<void>({
      command: () => api.history.clear(),
      onSuccess: () => {
        hydrationEventSinkRef.current({ type: 'CLEARED' })
        setRecords([])
        setFeedback('Histórico limpo. Os PDFs foram preservados.')
      },
      fallbackError: 'Falha ao limpar o histórico.'
    })
  }, [api, executeAction])

  return useMemo(
    () => ({ records, loading, busy, feedback, openPdf, revealPdf, clearHistory }),
    [busy, clearHistory, feedback, loading, openPdf, records, revealPdf]
  )
}
