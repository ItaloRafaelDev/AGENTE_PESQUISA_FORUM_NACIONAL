import { describe, expect, it } from 'vitest'
import { DeskDataProcessCollector } from '../../../../src/automation/deskdata/deskdata-process-collector'
import type {
  DeskDataProcessPagePort,
  DeskDataProcessPageSnapshot
} from '../../../../src/automation/deskdata/deskdata-process-page-port'
import { DeskDataProcessCollectionError } from '../../../../src/automation/deskdata/deskdata-process-collection-error'

class FakePagePort implements DeskDataProcessPagePort {
  private index = 0

  constructor(
    private readonly pages: DeskDataProcessPageSnapshot[],
    private readonly failExpansion = false
  ) {}

  async waitUntilReady(): Promise<void> {}

  async expandAllCards(): Promise<void> {
    if (this.failExpansion) {
      throw new DeskDataProcessCollectionError(
        'PROCESS_CARD_EXPANSION_FAILED',
        'Falha sintética de expansão.'
      )
    }
  }

  async readCurrentPage(): Promise<DeskDataProcessPageSnapshot> {
    const snapshot = this.pages[this.index]

    if (!snapshot) {
      throw new Error('Página sintética não encontrada.')
    }

    return snapshot
  }

  async goToNextPage(_previousSignature: string): Promise<void> {
    this.index = Math.min(this.index + 1, this.pages.length - 1)
  }
}

function page(overrides: Partial<DeskDataProcessPageSnapshot> = {}): DeskDataProcessPageSnapshot {
  return {
    pageNumber: 1,
    pageSignature: 'page-1',
    expectedProcessCount: null,
    totalPages: 1,
    empty: false,
    cards: [],
    hasNextPage: false,
    ...overrides
  }
}

describe('DeskDataProcessCollector', () => {
  it('retorna lista vazia para ausência explícita', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          empty: true,
          expectedProcessCount: 0
        })
      ])
    )

    await expect(collector.collect()).resolves.toEqual([])
  })

  it('coleta e deduplica processos em todas as páginas', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          pageSignature: 'page-1',
          expectedProcessCount: 2,
          totalPages: 2,
          hasNextPage: true,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: '0000001-00.2024.0.00.0001',
              fields: [
                {
                  label: 'Esfera',
                  value: 'Civil'
                }
              ]
            }
          ]
        }),
        page({
          pageNumber: 2,
          pageSignature: 'page-2',
          expectedProcessCount: 2,
          totalPages: 2,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: '0000001-00.2024.0.00.0001',
              fields: [
                {
                  label: 'Esfera',
                  value: '  CÍVEL  '
                }
              ]
            },
            {
              processKey: 'proc-2',
              processNumber: '0000002-00.2024.0.00.0002',
              fields: [
                {
                  label: 'Esfera',
                  value: 'Especial Criminal'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).resolves.toEqual([
      {
        processKey: 'proc-1',
        processNumber: '0000001-00.2024.0.00.0001',
        sphereRaw: 'Civil',
        sourcePage: 1
      },
      {
        processKey: 'proc-2',
        processNumber: '0000002-00.2024.0.00.0002',
        sphereRaw: 'Especial Criminal',
        sourcePage: 2
      }
    ])
  })

  it('preserva null quando Esfera não existe', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          expectedProcessCount: 1,
          cards: [
            {
              processKey: 'proc-sem-esfera',
              processNumber: null,
              fields: [
                {
                  label: 'Vara',
                  value: 'Criminal'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).resolves.toEqual([
      {
        processKey: 'proc-sem-esfera',
        processNumber: null,
        sphereRaw: null,
        sourcePage: 1
      }
    ])
  })

  it('falha quando a assinatura da página se repete', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          pageSignature: 'same',
          totalPages: null,
          hasNextPage: true,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Civil'
                }
              ]
            }
          ]
        }),
        page({
          pageNumber: 2,
          pageSignature: 'same',
          totalPages: null,
          cards: [
            {
              processKey: 'proc-2',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Criminal'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_PAGINATION_LOOP'
    })
  })

  it('falha quando a quantidade final diverge', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          expectedProcessCount: 2,
          cards: [
            {
              processKey: 'only-one',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Civil'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_COUNT_MISMATCH'
    })
  })

  it('falha sem mensagem vazia e sem cartões', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          empty: false,
          cards: []
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_COLLECTION_INCOMPLETE'
    })
  })

  it('falha quando páginas informam totais incompatíveis', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          totalPages: 2,
          hasNextPage: true,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Civil'
                }
              ]
            }
          ]
        }),
        page({
          pageNumber: 2,
          pageSignature: 'page-2',
          totalPages: 3,
          cards: [
            {
              processKey: 'proc-2',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Criminal'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_COLLECTION_INCOMPLETE'
    })
  })

  it('falha quando processo duplicado possui Esfera conflitante', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          totalPages: 2,
          hasNextPage: true,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Civil'
                }
              ]
            }
          ]
        }),
        page({
          pageNumber: 2,
          pageSignature: 'page-2',
          totalPages: 2,
          cards: [
            {
              processKey: 'proc-1',
              processNumber: null,
              fields: [
                {
                  label: 'Esfera',
                  value: 'Criminal'
                }
              ]
            }
          ]
        })
      ])
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_CARD_STRUCTURE_INVALID'
    })
  })

  it('propaga falha de expansão do cartão', async () => {
    const collector = new DeskDataProcessCollector(
      new FakePagePort([
        page({
          empty: true
        })
      ]),
      true
    )

    await expect(collector.collect()).rejects.toMatchObject({
      code: 'PROCESS_CARD_EXPANSION_FAILED'
    })
  })
})
