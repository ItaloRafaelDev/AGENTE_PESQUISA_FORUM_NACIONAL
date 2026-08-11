import { randomUUID } from 'node:crypto'
import type { ApplicationIdGenerator } from '../../application/ports/application-id-generator-port'

export class UuidGenerator implements ApplicationIdGenerator {
  next(): string {
    return randomUUID()
  }
}
