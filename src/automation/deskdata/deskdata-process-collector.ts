import type { DeskDataProcessRecord } from '../../domain/research/deskdata-process-record'
import { normalizeProcessSphere } from '../../domain/research/normalize-process-sphere'
import { DeskDataProcessCollectionError } from './deskdata-process-collection-error'
import type { DeskDataProcessPagePort } from './deskdata-process-page-port'
import { extractSphereFromFields } from './deskdata-sphere-extractor'

export class DeskDataProcessCollector {
  constructor(private readonly pagePort: DeskDataProcessPagePort) {}

  async collect(): Promise<DeskDataProcessRecord[]> {
    await this.pagePort.waitUntilReady()

    const records = new Map<string, DeskDataProcessRecord>()
    const visitedSignatures = new Set<string>()

    while (true) {
      await this.pagePort.expandAllCards()

      const snapshot = await this.pagePort.readCurrentPage()
      const pageSignature = snapshot.pageSignature.trim()

      if (!pageSignature) {
        throw new DeskDataProcessCollectionError(
          'PROCESS_COLLECTION_INCOMPLETE',
          'A página de processos não possui assinatura técnica.'
        )
      }

      if (visitedSignatures.has(pageSignature)) {
        throw new DeskDataProcessCollectionError(
          'PROCESS_PAGINATION_LOOP',
          'A paginação repetiu uma página já visitada.'
        )
      }

      visitedSignatures.add(pageSignature)

      const sourcePage = visitedSignatures.size

      if (snapshot.empty) {
        if (records.size > 0 || snapshot.cards.length > 0 || snapshot.hasNextPage) {
          throw new DeskDataProcessCollectionError(
            'PROCESS_COLLECTION_INCOMPLETE',
            'A seção informou ausência de processos e conteúdo simultaneamente.'
          )
        }

        return []
      }

      if (snapshot.cards.length === 0) {
        throw new DeskDataProcessCollectionError(
          'PROCESS_COLLECTION_INCOMPLETE',
          'A seção não confirmou ausência e não apresentou cartões.'
        )
      }

      for (const card of snapshot.cards) {
        const processKey = card.processKey.trim()

        if (!processKey) {
          throw new DeskDataProcessCollectionError(
            'PROCESS_CARD_STRUCTURE_INVALID',
            'Um cartão não possui chave técnica.'
          )
        }

        const sphereRaw = extractSphereFromFields(card.fields)

        const nextRecord: DeskDataProcessRecord = {
          processKey,
          processNumber: card.processNumber,
          sphereRaw,
          sourcePage
        }

        const existing = records.get(processKey)

        if (existing) {
          const sameSphere =
            normalizeProcessSphere(existing.sphereRaw) ===
            normalizeProcessSphere(nextRecord.sphereRaw)

          const sameNumber = existing.processNumber === nextRecord.processNumber

          if (!sameSphere || !sameNumber) {
            throw new DeskDataProcessCollectionError(
              'PROCESS_CARD_STRUCTURE_INVALID',
              'Um processo duplicado apresentou dados conflitantes.'
            )
          }

          continue
        }

        records.set(processKey, nextRecord)
      }

      if (!snapshot.hasNextPage) {
        return [...records.values()]
      }

      await this.pagePort.goToNextPage(pageSignature)
    }
  }
}
