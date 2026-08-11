export interface PlaywrightAutomationConfig {
  queueCheckIntervalMs: number
  cpiSearchPollingIntervalMs: number
  actionTimeoutMs: number
  readTimeoutMs: number
  queueFilterSettleDelayMs: number
  cpiFrameSearchAttempts: number
  deskDataPeopleUrl: string
  navigationTimeoutMs: number
  downloadStartTimeoutMs: number
  deskDataFormPollingIntervalMs: number
  deskDataResultPollingIntervalMs: number
  deskDataHistoryNavigationIntervalMs: number
  submitSettleDelayMs: number
  queueReturnDelayMs: number
  cpiIdentitySearchAttempts: number
  cpiAttachmentSearchAttempts: number
  cpiResultSearchAttempts: number
  cpiResultStabilizationAttempts: number
  deskDataFormReadyAttempts: number
  deskDataResultSearchAttempts: number
  deskDataHistoryNavigationAttempts: number
  pdfOutputDirectory: string
}
