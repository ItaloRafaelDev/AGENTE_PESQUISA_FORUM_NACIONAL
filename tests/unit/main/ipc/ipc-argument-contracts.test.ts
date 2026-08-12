import { describe, expect, it } from 'vitest'
import {
  INVALID_IPC_ARGUMENTS_MESSAGE,
  parseHistoryListIpcArguments,
  parseNoIpcArguments,
  parsePdfPathIpcArguments
} from '@/main/ipc/ipc-argument-contracts'

describe('IPC argument contracts', () => {
  it('accepts no arguments only when the IPC payload is empty', () => {
    expect(() => parseNoIpcArguments([])).not.toThrow()
    expect(() => parseNoIpcArguments(['extra'])).toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)
  })

  it('parses a strict valid history list input', () => {
    expect(parseHistoryListIpcArguments([{ page: 1, pageSize: 50 }])).toEqual({
      page: 1,
      pageSize: 50
    })
  })

  it('rejects an out-of-range history page without exposing Zod details', () => {
    const rawValue = 'valor-invalido-confidencial'
    const parseInvalidInput = (): void =>
      parseHistoryListIpcArguments([{ page: 1, pageSize: 50, extra: rawValue }])

    expect(() => parseHistoryListIpcArguments([{ page: 0, pageSize: 50 }])).toThrow(
      INVALID_IPC_ARGUMENTS_MESSAGE
    )
    expect(() => parseHistoryListIpcArguments([{ page: 1, pageSize: 50, extra: true }])).toThrow(
      INVALID_IPC_ARGUMENTS_MESSAGE
    )
    expect(parseInvalidInput).toThrow(INVALID_IPC_ARGUMENTS_MESSAGE)

    try {
      parseInvalidInput()
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(INVALID_IPC_ARGUMENTS_MESSAGE)
      expect((error as Error).message).not.toContain(rawValue)
      expect((error as Error).message).not.toContain('[')
    }
  })

  it('parses and trims a single PDF path', () => {
    expect(parsePdfPathIpcArguments([' E:\\PDF-AGENTE-CPI\\result.pdf '])).toBe(
      'E:\\PDF-AGENTE-CPI\\result.pdf'
    )
  })

  it('rejects more than one PDF path', () => {
    expect(() => parsePdfPathIpcArguments(['one.pdf', 'two.pdf'])).toThrow(
      INVALID_IPC_ARGUMENTS_MESSAGE
    )
  })
})
