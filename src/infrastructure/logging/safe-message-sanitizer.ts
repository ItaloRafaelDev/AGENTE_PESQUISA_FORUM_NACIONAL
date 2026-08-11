import type { SafeMessageSanitizer } from '../../application/ports/safe-message-sanitizer-port'
import { SafeResearchLogger } from './safe-research-logger'

export class SafeMessageSanitizerAdapter implements SafeMessageSanitizer {
  private readonly logger = new SafeResearchLogger(() => undefined)

  sanitize(message: unknown): string {
    return this.logger.sanitizeMessage(String(message))
  }
}
