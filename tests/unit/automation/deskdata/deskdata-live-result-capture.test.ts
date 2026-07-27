import { describe, expect, it, vi } from 'vitest'
import {
  DESKDATA_LIVE_RESULT_HEADING_SELECTOR,
  DeskDataLiveResultCapture,
  type DeskDataLiveDomCapturePort,
  type DeskDataLiveResultPage
} from '@/automation/deskdata/deskdata-live-result-capture'

describe('DeskDataLiveResultCapture', () => {
  it('deve construir uma inspeção segura do resultado real', async () => {
    const captureTables = vi.fn(async () => [
      {
        index: 0,
        text: 'Processo criminal 1234567-89.2026.8.26.0001',
        html: ''
      }
    ])

    const captureCandidates = vi.fn(async () => [])

    const domCapture: DeskDataLiveDomCapturePort = {
      captureTables,
      captureCandidates
    }

    const page = {
      url: vi.fn(() => 'https://app.deskdata.com.br/pessoas/resultado/teste'),
      title: vi.fn(async () => 'Resultado DeskData'),
      locator: vi.fn((selector: string) => {
        if (selector === 'body') {
          return {
            innerText: vi.fn(
              async () => 'CPF 123.456.789-00 Processo criminal 1234567-89.2026.8.26.0001'
            )
          }
        }

        if (selector === DESKDATA_LIVE_RESULT_HEADING_SELECTOR) {
          return {
            allTextContents: vi.fn(async () => ['Processos'])
          }
        }

        throw new Error('Seletor inesperado: ' + selector)
      })
    } as unknown as DeskDataLiveResultPage

    const snapshot = await new DeskDataLiveResultCapture(domCapture).capture(page)

    expect(snapshot.scenario).toBe('fluxo-real')
    expect(snapshot.sourcePath).toBe('/pessoas/resultado/teste')
    expect(snapshot.tables).toHaveLength(1)
    expect(snapshot.relevantBodyLines.join(' ')).not.toContain('123.456.789-00')
    expect(captureTables).toHaveBeenCalledTimes(1)
    expect(captureCandidates).toHaveBeenCalledTimes(1)
  })
})
