export class PauseController {
  private pauseRequested = false
  private atomicDepth = 0

  requestPause(): void {
    this.pauseRequested = true
  }

  resume(): void {
    this.pauseRequested = false
  }

  enterAtomicSection(): void {
    this.atomicDepth += 1
  }

  leaveAtomicSection(): void {
    this.atomicDepth = Math.max(0, this.atomicDepth - 1)
  }

  isPauseRequested(): boolean {
    return this.pauseRequested
  }

  shouldPauseAtCheckpoint(): boolean {
    return this.pauseRequested && this.atomicDepth === 0
  }
}
