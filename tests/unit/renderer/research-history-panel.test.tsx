// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResearchHistoryPanel from '@/renderer/src/components/ResearchHistoryPanel'
import type { ResearchHistoryRecord } from '@/shared/types/history-api'

const firstRecord: ResearchHistoryRecord = {
  id: 'history-1',
  maskedCpf: '***.***.***-44',
  classification: 'HA_INFORMACOES',
  cpiResult: 'Há Informações',
  status: 'CONCLUIDO',
  startedAt: '2026-07-14T10:00:00.000Z',
  finishedAt: '2026-07-14T10:01:00.000Z',
  durationMs: 60_000,
  pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado-1.pdf',
  errorStage: null,
  errorMessage: null,
  createdAt: '2026-07-14T10:00:00.000Z'
}

const secondRecord: ResearchHistoryRecord = {
  id: 'history-2',
  maskedCpf: '***.***.***-88',
  classification: 'CONSTA_RESTRICAO',
  cpiResult: 'Sim, Consta Restrições',
  status: 'ERRO_E1',
  startedAt: '2026-07-14T11:00:00.000Z',
  finishedAt: '2026-07-14T11:00:30.000Z',
  durationMs: 30_000,
  pdfPath: null,
  errorStage: 'SAVING_CPI',
  errorMessage: 'Falha segura',
  createdAt: '2026-07-14T11:00:00.000Z'
}

const listHistory = vi.fn()
const clearHistory = vi.fn()
const openPdf = vi.fn()
const revealPdf = vi.fn()

let createdListener: ((record: ResearchHistoryRecord) => void) | null = null

let updatedListener: ((record: ResearchHistoryRecord) => void) | null = null

let clearedListener: (() => void) | null = null

beforeEach(() => {
  listHistory.mockReset()
  clearHistory.mockReset()
  openPdf.mockReset()
  revealPdf.mockReset()

  createdListener = null
  updatedListener = null
  clearedListener = null

  listHistory.mockResolvedValue({
    items: [secondRecord, firstRecord],
    page: 1,
    pageSize: 50,
    total: 2,
    totalPages: 1
  })

  clearHistory.mockResolvedValue(undefined)

  openPdf.mockResolvedValue({
    status: 'OPENED'
  })

  revealPdf.mockResolvedValue({
    status: 'REVEALED'
  })

  Object.defineProperty(window, 'agent', {
    configurable: true,
    value: {
      history: {
        list: listHistory,
        clear: clearHistory,
        onRecordCreated: (listener: (record: ResearchHistoryRecord) => void) => {
          createdListener = listener

          return () => {
            createdListener = null
          }
        },
        onRecordUpdated: (listener: (record: ResearchHistoryRecord) => void) => {
          updatedListener = listener

          return () => {
            updatedListener = null
          }
        },
        onCleared: (listener: () => void) => {
          clearedListener = listener

          return () => {
            clearedListener = null
          }
        }
      },
      pdf: {
        open: openPdf,
        reveal: revealPdf
      }
    }
  })
})

afterEach(() => {
  cleanup()
})

describe('ResearchHistoryPanel', () => {
  it('carrega e exibe somente dados públicos do histórico', async () => {
    render(<ResearchHistoryPanel />)

    expect(await screen.findByText('***.***.***-44')).toBeInTheDocument()

    expect(screen.getByText('***.***.***-88')).toBeInTheDocument()

    expect(screen.getByText('Há informações')).toBeInTheDocument()

    expect(screen.getByText('Consta restrição')).toBeInTheDocument()

    expect(listHistory).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50
    })

    expect(document.body.textContent).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it('abre e revela o PDF pelo preload seguro', async () => {
    const user = userEvent.setup()

    render(<ResearchHistoryPanel />)

    await screen.findByText('***.***.***-44')

    await user.click(
      screen.getByRole('button', {
        name: 'Abrir PDF'
      })
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Mostrar na pasta'
      })
    )

    expect(openPdf).toHaveBeenCalledWith(firstRecord.pdfPath)

    expect(revealPdf).toHaveBeenCalledWith(firstRecord.pdfPath)
  })

  it('informa PDF não encontrado sem derrubar o painel', async () => {
    const user = userEvent.setup()

    openPdf.mockResolvedValue({
      status: 'NOT_FOUND'
    })

    render(<ResearchHistoryPanel />)

    await screen.findByText('***.***.***-44')

    await user.click(
      screen.getByRole('button', {
        name: 'Abrir PDF'
      })
    )

    expect(await screen.findByText('PDF não encontrado.')).toBeInTheDocument()
  })

  it('atualiza registros por eventos em tempo real', async () => {
    render(<ResearchHistoryPanel />)

    await screen.findByText('***.***.***-44')

    const createdRecord: ResearchHistoryRecord = {
      ...firstRecord,
      id: 'history-3',
      maskedCpf: '***.***.***-22',
      status: 'EM_ANDAMENTO',
      finishedAt: null,
      durationMs: null,
      pdfPath: null
    }

    act(() => {
      createdListener?.(createdRecord)
    })

    expect(screen.getByText('***.***.***-22')).toBeInTheDocument()

    act(() => {
      updatedListener?.({
        ...createdRecord,
        status: 'CONCLUIDO',
        finishedAt: '2026-07-14T12:01:00.000Z',
        durationMs: 60_000,
        pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado-3.pdf'
      })
    })

    expect(screen.getAllByText('Concluído').length).toBeGreaterThan(1)
  })

  it('limpa somente as linhas do histórico', async () => {
    const user = userEvent.setup()

    render(<ResearchHistoryPanel />)

    await screen.findByText('***.***.***-44')

    await user.click(
      screen.getByRole('button', {
        name: 'Limpar histórico'
      })
    )

    expect(clearHistory).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
    })

    expect(openPdf).not.toHaveBeenCalled()
    expect(revealPdf).not.toHaveBeenCalled()
  })

  it('reage ao evento global de limpeza', async () => {
    render(<ResearchHistoryPanel />)

    await screen.findByText('***.***.***-44')

    act(() => {
      clearedListener?.()
    })

    expect(screen.getByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
  })
})
