import type { ApplicationClock } from '../../application/ports/application-clock-port'

export class SystemClock implements ApplicationClock {
  now(): Date {
    return new Date()
  }
}
