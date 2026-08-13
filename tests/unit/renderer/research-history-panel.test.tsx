// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResearchHistoryPanel from '@/renderer/src/components/ResearchHistoryPanel'
import type { ResearchHistoryPage, ResearchHistoryRecord } from '@/shared/types/history-api'

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

function page(items: ResearchHistoryRecord[]): ResearchHistoryPage {
  return {
    items,
    page: 1,
    pageSize: 50,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const listHistory = vi.fn()
const clearHistory = vi.fn()
const openPdf = vi.fn()
const revealPdf = vi.fn()
const onRecordCreated = vi.fn()
const onRecordUpdated = vi.fn()
const onCleared = vi.fn()
const unsubscribeCreated = vi.fn()
const unsubscribeUpdated = vi.fn()
const unsubscribeCleared = vi.fn()

let createdListener: ((record: ResearchHistoryRecord) => void) | null = null
let updatedListener: ((record: ResearchHistoryRecord) => void) | null = null
let clearedListener: (() => void) | null = null

beforeEach(() => {
  for (const command of [
    listHistory,
    clearHistory,
    openPdf,
    revealPdf,
    onRecordCreated,
    onRecordUpdated,
    onCleared,
    unsubscribeCreated,
    unsubscribeUpdated,
    unsubscribeCleared
  ]) {
    command.mockReset()
  }
  createdListener = null
  updatedListener = null
  clearedListener = null
  listHistory.mockResolvedValue(page([secondRecord, firstRecord]))
  clearHistory.mockResolvedValue(undefined)
  openPdf.mockResolvedValue({ status: 'OPENED' })
  revealPdf.mockResolvedValue({ status: 'REVEALED' })
  onRecordCreated.mockImplementation((listener: (record: ResearchHistoryRecord) => void) => {
    createdListener = listener
    return unsubscribeCreated
  })
  onRecordUpdated.mockImplementation((listener: (record: ResearchHistoryRecord) => void) => {
    updatedListener = listener
    return unsubscribeUpdated
  })
  onCleared.mockImplementation((listener: () => void) => {
    clearedListener = listener
    return unsubscribeCleared
  })

  Object.defineProperty(window, 'agent', {
    configurable: true,
    value: {
      history: {
        list: listHistory,
        clear: clearHistory,
        onRecordCreated,
        onRecordUpdated,
        onCleared
      },
      pdf: { open: openPdf, reveal: revealPdf }
    }
  })
})

afterEach(() => cleanup())

describe('ResearchHistoryPanel', () => {
  it('delega a tabela populada ao componente de apresentação dedicado', () => {
    const panelSource = readFileSync('src/renderer/src/components/ResearchHistoryPanel.tsx', 'utf8')
    const tableSource = readFileSync(
      'src/renderer/src/features/history/ResearchHistoryTable.tsx',
      'utf8'
    )

    expect(panelSource).toContain("from '../features/history/ResearchHistoryTable'")
    expect(panelSource).toContain('<ResearchHistoryTable')
    expect(tableSource).toContain('className="history-table-wrapper"')
    expect(tableSource).toContain('className="history-table"')
  })

  it('carrega dados públicos com a paginação fixa aceita', async () => {
    render(<ResearchHistoryPanel />)
    expect(await screen.findByText('***.***.***-44')).toBeInTheDocument()
    expect(screen.getByText('***.***.***-88')).toBeInTheDocument()
    expect(listHistory).toHaveBeenCalledTimes(1)
    expect(listHistory).toHaveBeenCalledWith({ page: 1, pageSize: 50 })
    expect(document.body.textContent).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it('prioriza o loading enquanto a lista está pendente', () => {
    const listing = deferred<ResearchHistoryPage>()
    listHistory.mockReturnValue(listing.promise)
    render(<ResearchHistoryPanel />)
    expect(screen.getByText('Carregando histórico...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma pesquisa registrada.')).not.toBeInTheDocument()
  })

  it('exibe erro de lista e o estado vazio após a rejeição', async () => {
    const listing = deferred<ResearchHistoryPage>()
    listHistory.mockReturnValue(listing.promise)
    render(<ResearchHistoryPanel />)
    await act(async () => {
      listing.reject(new Error('Lista indisponível.'))
      await Promise.resolve()
    })
    expect(await screen.findByText('Lista indisponível.')).toBeInTheDocument()
    expect(screen.getByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
  })

  it('prioriza o estado vazio após uma lista vazia', async () => {
    const listing = deferred<ResearchHistoryPage>()
    listHistory.mockReturnValue(listing.promise)
    render(<ResearchHistoryPanel />)
    await act(async () => {
      listing.resolve(page([]))
      await listing.promise
    })
    expect(await screen.findByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
    expect(screen.queryByText('Carregando histórico...')).not.toBeInTheDocument()
  })

  it('prioriza a tabela quando a lista está populada', async () => {
    const listing = deferred<ResearchHistoryPage>()
    listHistory.mockReturnValue(listing.promise)
    render(<ResearchHistoryPanel />)
    await act(async () => {
      listing.resolve(page([firstRecord]))
      await listing.promise
    })
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma pesquisa registrada.')).not.toBeInTheDocument()
  })

  it('não atualiza após unmount, inclusive quando eventos antigos são disparados', async () => {
    const listing = deferred<ResearchHistoryPage>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    listHistory.mockReturnValue(listing.promise)
    const view = render(<ResearchHistoryPanel />)
    const staleCreatedListener = createdListener
    view.unmount()

    await act(async () => {
      listing.resolve(page([firstRecord]))
      await listing.promise
      staleCreatedListener?.({ ...firstRecord, id: 'after-unmount', maskedCpf: '***.***.***-22' })
    })

    expect(document.body).not.toHaveTextContent('***.***.***-22')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('remove as três inscrições exatamente uma vez', async () => {
    const view = render(<ResearchHistoryPanel />)
    await screen.findByText('***.***.***-44')
    view.unmount()
    expect(onRecordCreated).toHaveBeenCalledTimes(1)
    expect(onRecordUpdated).toHaveBeenCalledTimes(1)
    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(unsubscribeCreated).toHaveBeenCalledTimes(1)
    expect(unsubscribeUpdated).toHaveBeenCalledTimes(1)
    expect(unsubscribeCleared).toHaveBeenCalledTimes(1)
  })

  it('atualiza registros por eventos em tempo real', async () => {
    render(<ResearchHistoryPanel />)
    await screen.findByText('***.***.***-44')
    const createdRecord = {
      ...firstRecord,
      id: 'history-3',
      maskedCpf: '***.***.***-22',
      status: 'EM_ANDAMENTO' as const,
      finishedAt: null,
      durationMs: null,
      pdfPath: null
    }
    act(() => createdListener?.(createdRecord))
    expect(screen.getByText('***.***.***-22')).toBeInTheDocument()
    act(() =>
      updatedListener?.({
        ...createdRecord,
        status: 'CONCLUIDO',
        finishedAt: '2026-07-14T12:01:00.000Z',
        durationMs: 60_000,
        pdfPath: 'E:\\PDF-AGENTE-CPI\\resultado-3.pdf'
      })
    )
    expect(screen.getAllByText('Concluído').length).toBeGreaterThan(1)
    act(() => clearedListener?.())
    expect(screen.getByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
  })

  it.each([
    {
      operation: 'OPEN',
      button: 'Abrir PDF',
      command: openPdf,
      success: { status: 'OPENED' },
      successMessage: 'PDF aberto.',
      rejectionMessage: 'Abertura indisponível.'
    },
    {
      operation: 'REVEAL',
      button: 'Mostrar na pasta',
      command: revealPdf,
      success: { status: 'REVEALED' },
      successMessage: 'PDF localizado na pasta.',
      rejectionMessage: 'Revelação indisponível.'
    }
  ] as const)(
    'informa sucesso, PDF ausente e rejeição exatos para $operation',
    async ({ button, command, success, successMessage, rejectionMessage }) => {
      const user = userEvent.setup()
      render(<ResearchHistoryPanel />)
      await screen.findByText('***.***.***-44')

      command.mockResolvedValueOnce(success)
      await user.click(screen.getByRole('button', { name: button }))
      expect(await screen.findByText(successMessage)).toBeInTheDocument()
      expect(command).toHaveBeenCalledTimes(1)
      expect(command).toHaveBeenLastCalledWith(firstRecord.pdfPath)

      command.mockResolvedValueOnce({ status: 'NOT_FOUND' })
      await user.click(screen.getByRole('button', { name: button }))
      expect(await screen.findByText('PDF não encontrado.')).toBeInTheDocument()
      expect(command).toHaveBeenCalledTimes(2)

      command.mockRejectedValueOnce(new Error(rejectionMessage))
      await user.click(screen.getByRole('button', { name: button }))
      expect(await screen.findByText(rejectionMessage)).toBeInTheDocument()
      expect(command).toHaveBeenCalledTimes(3)
      expect(screen.getByRole('table')).toBeInTheDocument()
    }
  )

  it('compartilha o bloqueio busy enquanto uma ação de PDF está pendente', async () => {
    const pendingOpen = deferred<{ status: 'OPENED' }>()
    openPdf.mockReturnValue(pendingOpen.promise)
    const user = userEvent.setup()
    render(<ResearchHistoryPanel />)
    await screen.findByText('***.***.***-44')
    await user.click(screen.getByRole('button', { name: 'Abrir PDF' }))
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    await act(async () => {
      pendingOpen.resolve({ status: 'OPENED' })
      await pendingOpen.promise
    })
    expect(await screen.findByText('PDF aberto.')).toBeInTheDocument()
  })

  it('limpa o histórico após a confirmação pendente e bloqueia ações concorrentes', async () => {
    const pendingClear = deferred<void>()
    clearHistory.mockReturnValue(pendingClear.promise)
    const user = userEvent.setup()
    render(<ResearchHistoryPanel />)
    await screen.findByText('***.***.***-44')
    await user.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    await act(async () => {
      pendingClear.resolve()
      await pendingClear.promise
    })
    expect(
      await screen.findByText('Histórico limpo. Os PDFs foram preservados.')
    ).toBeInTheDocument()
    expect(screen.getByText('Nenhuma pesquisa registrada.')).toBeInTheDocument()
  })

  it('mantém as linhas quando limpar histórico é rejeitado', async () => {
    const user = userEvent.setup()
    clearHistory.mockRejectedValueOnce(new Error('Limpeza indisponível.'))
    render(<ResearchHistoryPanel />)
    await screen.findByText('***.***.***-44')
    await user.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    expect(await screen.findByText('Limpeza indisponível.')).toBeInTheDocument()
    expect(screen.getByText('***.***.***-44')).toBeInTheDocument()
  })

  it('preserva a hierarquia, classes e formatos de tabela aceitos', async () => {
    const records: ResearchHistoryRecord[] = [
      {
        ...firstRecord,
        id: 'format-1',
        classification: 'NADA_CONSTA',
        cpiResult: null,
        status: 'EM_ANDAMENTO',
        durationMs: 0
      },
      {
        ...firstRecord,
        id: 'format-2',
        classification: null,
        status: 'CONCLUIDO',
        durationMs: 1_000
      },
      {
        ...firstRecord,
        id: 'format-3',
        classification: 'HA_INFORMACOES',
        status: 'ERRO_E1',
        durationMs: 60_000
      },
      {
        ...firstRecord,
        id: 'format-4',
        classification: 'CONSTA_RESTRICAO',
        status: 'INTERROMPIDO',
        durationMs: null
      }
    ]
    listHistory.mockResolvedValue(page(records))
    render(<ResearchHistoryPanel />)
    const section = await screen.findByLabelText('Histórico de pesquisas')
    const wrapper = section.querySelector(':scope > .history-table-wrapper')
    const table = within(section).getByRole('table')
    const rows = within(table).getAllByRole('row')

    expect(section.className).toBe('activity-panel history-panel')
    expect(wrapper?.className).toBe('history-table-wrapper')
    expect([...wrapper!.children]).toEqual([table])
    expect(table.className).toBe('history-table')
    expect([...table.children].map((element) => element.tagName)).toEqual(['THEAD', 'TBODY'])
    expect(table.tHead?.children).toHaveLength(1)
    expect(table.tBodies).toHaveLength(1)
    expect(table.tBodies[0].children).toHaveLength(4)
    expect(
      within(rows[0])
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
    ).toEqual(['Início', 'CPF', 'Classificação', 'Resultado CPI', 'Status', 'Duração', 'PDF'])
    expect(rows).toHaveLength(5)
    for (const row of rows.slice(1)) {
      expect([...row.children].map((cell) => cell.tagName)).toEqual([
        'TD',
        'TD',
        'TD',
        'TD',
        'TD',
        'TD',
        'TD'
      ])
      expect(within(row).getAllByRole('cell')).toHaveLength(7)
    }
    expect(rows[1].querySelector('code')?.textContent).toBe('***.***.***-44')
    expect([...rows.slice(1)].map((row) => row.querySelector('span')?.className)).toEqual([
      'history-status history-status-em_andamento',
      'history-status history-status-concluido',
      'history-status history-status-erro_e1',
      'history-status history-status-interrompido'
    ])
    expect(
      [...rows.slice(1)].map((row) => row.querySelector('.history-status')?.textContent)
    ).toEqual(['Em andamento', 'Concluído', 'Erro E1', 'Interrompido'])
    expect([...rows.slice(1)].map((row) => row.children[2]?.textContent)).toEqual([
      '—',
      '—',
      'Há informações',
      'Consta restrição'
    ])
    expect([...rows.slice(1)].map((row) => row.children[3]?.textContent)).toEqual([
      '—',
      'Há Informações',
      'Há Informações',
      'Há Informações'
    ])
    expect([...rows.slice(1)].map((row) => row.children[5]?.textContent)).toEqual([
      '0s',
      '1s',
      '1min 0s',
      '—'
    ])
    expect(rows[1].querySelector('.history-actions')?.className).toBe('history-actions')
    expect(
      [...rows[1].querySelectorAll('.history-actions > button')].map((button) => button.className)
    ).toEqual(['button secondary compact', 'button secondary compact'])
  })
})
