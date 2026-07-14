import { describe, expect, it } from 'vitest'
import {
  DESKDATA_PROCESS_CAPTURE_SELECTORS,
  DeskDataProcessDomCapture,
  type DeskDataProcessCaptureLocator,
  type DeskDataProcessCapturePage
} from '@/automation/deskdata/deskdata-process-dom-capture'

interface FakeElement {
  text: string
  id?: string
  className?: string
}

class FakeLocator implements DeskDataProcessCaptureLocator {
  constructor(
    private readonly elements: FakeElement[],
    private readonly current?: FakeElement
  ) {}

  count(): Promise<number> {
    return Promise.resolve(this.current ? 1 : this.elements.length)
  }

  nth(index: number): DeskDataProcessCaptureLocator {
    const element = this.elements[index]

    if (!element) {
      throw new Error(`Elemento inexistente: ${index}`)
    }

    return new FakeLocator([], element)
  }

  innerText(): Promise<string> {
    return Promise.resolve(this.current?.text ?? '')
  }

  getAttribute(name: string): Promise<string | null> {
    if (!this.current) {
      return Promise.resolve(null)
    }

    if (name === 'id') {
      return Promise.resolve(this.current.id ?? null)
    }

    if (name === 'class') {
      return Promise.resolve(this.current.className ?? null)
    }

    return Promise.resolve(null)
  }
}

class FakePage implements DeskDataProcessCapturePage {
  constructor(
    private readonly tables: FakeElement[],
    private readonly candidates: FakeElement[]
  ) {}

  locator(selector: string): DeskDataProcessCaptureLocator {
    if (selector === DESKDATA_PROCESS_CAPTURE_SELECTORS.tables) {
      return new FakeLocator(this.tables)
    }

    if (selector === DESKDATA_PROCESS_CAPTURE_SELECTORS.candidates) {
      return new FakeLocator(this.candidates)
    }

    throw new Error(`Seletor inesperado: ${selector}`)
  }
}

describe('DeskDataProcessDomCapture', () => {
  it('deve capturar metadados sem usar evaluate no navegador', async () => {
    const page = new FakePage(
      [],
      [
        {
          text: 'Processo 0001234-56.2024.8.26.0001 Ação Penal',
          id: 'processos',
          className: 'card process-card'
        },
        {
          text: 'Informação cadastral sem relação com a consulta',
          id: 'irrelevante'
        }
      ]
    )

    const capture = new DeskDataProcessDomCapture()

    await expect(capture.captureCandidates(page)).resolves.toEqual([
      {
        index: 0,
        tagName: '',
        id: 'processos',
        className: 'card process-card',
        text: 'Processo 0001234-56.2024.8.26.0001 Ação Penal',
        html: ''
      }
    ])
  })

  it('deve capturar o texto das tabelas', async () => {
    const page = new FakePage(
      [
        {
          text: 'Número do processo Classe Tribunal'
        }
      ],
      []
    )

    const capture = new DeskDataProcessDomCapture()

    await expect(capture.captureTables(page)).resolves.toEqual([
      {
        index: 0,
        text: 'Número do processo Classe Tribunal',
        html: ''
      }
    ])
  })

  it('deve ignorar elementos vazios', async () => {
    const page = new FakePage(
      [
        {
          text: '   '
        }
      ],
      [
        {
          text: ''
        }
      ]
    )

    const capture = new DeskDataProcessDomCapture()

    await expect(capture.captureTables(page)).resolves.toEqual([])

    await expect(capture.captureCandidates(page)).resolves.toEqual([])
  })
})
