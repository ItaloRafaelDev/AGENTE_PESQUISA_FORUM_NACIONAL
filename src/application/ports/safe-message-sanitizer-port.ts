export interface SafeMessageSanitizer {
  sanitize(message: unknown): string
}
