import { z } from 'zod'

const appConfigSchema = z
  .object({
    queueCheckIntervalMs: z.number().int().min(30_000).default(60_000),
    betweenJobsMinMs: z.number().int().min(1_000).default(10_000),
    betweenJobsMaxMs: z.number().int().min(1_000).default(20_000),
    retryDelaysMs: z
      .array(z.number().int().positive())
      .length(3)
      .default([30_000, 60_000, 120_000]),
    maxConsecutiveErrors: z.number().int().min(1).default(5),
    concurrency: z.literal(1).default(1),
    safeMode: z.boolean().default(true)
  })
  .superRefine((config, context) => {
    if (config.betweenJobsMaxMs < config.betweenJobsMinMs) {
      context.addIssue({
        code: 'custom',
        path: ['betweenJobsMaxMs'],
        message: 'Intervalo máximo deve ser maior ou igual ao mínimo'
      })
    }
  })

export type AppConfig = z.infer<typeof appConfigSchema>

export function parseAppConfig(input: unknown = {}): AppConfig {
  return appConfigSchema.parse(input)
}
