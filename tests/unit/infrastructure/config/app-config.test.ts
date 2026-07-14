import { describe, expect, it } from 'vitest'
import { parseAppConfig } from '@/infrastructure/config/app-config'

describe('parseAppConfig', () => {
  it('deve aplicar as configurações operacionais padrão aprovadas', () => {
    expect(parseAppConfig()).toEqual({
      queueCheckIntervalMs: 60_000,
      betweenJobsMinMs: 10_000,
      betweenJobsMaxMs: 20_000,
      retryDelaysMs: [30_000, 60_000, 120_000],
      maxConsecutiveErrors: 5,
      concurrency: 1,
      safeMode: true
    })
  })

  it('deve permitir sobrescrever configurações válidas', () => {
    expect(
      parseAppConfig({
        queueCheckIntervalMs: 90_000,
        safeMode: false
      })
    ).toMatchObject({
      queueCheckIntervalMs: 90_000,
      safeMode: false
    })
  })

  it('deve impedir processamento paralelo', () => {
    expect(() =>
      parseAppConfig({
        concurrency: 2
      })
    ).toThrow()
  })

  it('deve rejeitar intervalo máximo menor que o mínimo', () => {
    expect(() =>
      parseAppConfig({
        betweenJobsMinMs: 20_000,
        betweenJobsMaxMs: 10_000
      })
    ).toThrow('Intervalo máximo deve ser maior ou igual ao mínimo')
  })
})
