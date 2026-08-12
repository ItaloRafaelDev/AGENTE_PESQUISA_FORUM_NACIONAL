import { z } from 'zod'
import type { ResearchHistoryListInput } from '../../application/history/research-history-model'

export const INVALID_IPC_ARGUMENTS_MESSAGE = 'Argumentos IPC inválidos.'

const noIpcArgumentsSchema = z.tuple([])

const historyListIpcArgumentsSchema = z.tuple([
  z
    .object({
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(100)
    })
    .strict()
])

const pdfPathIpcArgumentsSchema = z.tuple([z.string().trim().min(1)])

function parseIpcArguments<T>(schema: z.ZodType<T>, raw: unknown[]): T {
  const result = schema.safeParse(raw)

  if (!result.success) {
    throw new Error(INVALID_IPC_ARGUMENTS_MESSAGE)
  }

  return result.data
}

export function parseNoIpcArguments(raw: unknown[]): void {
  parseIpcArguments(noIpcArgumentsSchema, raw)
}

export function parseHistoryListIpcArguments(raw: unknown[]): ResearchHistoryListInput {
  return parseIpcArguments(historyListIpcArgumentsSchema, raw)[0]
}

export function parsePdfPathIpcArguments(raw: unknown[]): string {
  return parseIpcArguments(pdfPathIpcArgumentsSchema, raw)[0]
}
