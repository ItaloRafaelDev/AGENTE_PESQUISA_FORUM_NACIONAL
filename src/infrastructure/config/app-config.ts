import { z } from 'zod'

export const APP_CONFIG_DEFAULTS = {
  platform: {
    cpiQueueUrl:
      'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx',
    deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/'
  },
  paths: {
    operationalDirectoryName: 'AgenteCPI',
    databaseFileName: 'agente-cpi.sqlite',
    browserProfileDirectoryName: 'browser-profile',
    downloadsDirectoryName: 'downloads',
    screenshotsDirectoryName: 'screenshots',
    logsDirectoryName: 'logs',
    configDirectoryName: 'config',
    preferredPdfDirectory: 'E:\\PDF-AGENTE-CPI'
  },
  timing: {
    queueCheckIntervalMs: 60_000,
    platformPageNavigationTimeoutMs: 45_000,
    navigationTimeoutMs: 30_000,
    actionTimeoutMs: 10_000,
    readTimeoutMs: 5_000,
    downloadStartTimeoutMs: 30_000,
    cpiSearchPollingIntervalMs: 250,
    deskDataFormPollingIntervalMs: 250,
    deskDataResultPollingIntervalMs: 500,
    deskDataHistoryNavigationIntervalMs: 250,
    queueFilterSettleDelayMs: 700,
    submitSettleDelayMs: 1_000,
    queueReturnDelayMs: 3_000
  },
  limits: {
    cpiFrameSearchAttempts: 40,
    cpiIdentitySearchAttempts: 40,
    cpiAttachmentSearchAttempts: 40,
    cpiResultSearchAttempts: 40,
    cpiResultStabilizationAttempts: 3,
    deskDataFormReadyAttempts: 40,
    deskDataResultSearchAttempts: 180,
    deskDataHistoryNavigationAttempts: 120
  }
} as const

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'), {
    message: 'A plataforma deve utilizar HTTPS'
  })

const pathSegmentSchema = z.string().trim().min(1)
const positiveIntegerSchema = z.number().int().positive()

const platformConfigSchema = z
  .object({
    cpiQueueUrl: httpsUrlSchema.default(APP_CONFIG_DEFAULTS.platform.cpiQueueUrl),
    deskDataPeopleUrl: httpsUrlSchema.default(APP_CONFIG_DEFAULTS.platform.deskDataPeopleUrl)
  })
  .strict()
  .readonly()

const pathsConfigSchema = z
  .object({
    operationalDirectoryName: pathSegmentSchema.default(
      APP_CONFIG_DEFAULTS.paths.operationalDirectoryName
    ),
    databaseFileName: pathSegmentSchema.default(APP_CONFIG_DEFAULTS.paths.databaseFileName),
    browserProfileDirectoryName: pathSegmentSchema.default(
      APP_CONFIG_DEFAULTS.paths.browserProfileDirectoryName
    ),
    downloadsDirectoryName: pathSegmentSchema.default(
      APP_CONFIG_DEFAULTS.paths.downloadsDirectoryName
    ),
    screenshotsDirectoryName: pathSegmentSchema.default(
      APP_CONFIG_DEFAULTS.paths.screenshotsDirectoryName
    ),
    logsDirectoryName: pathSegmentSchema.default(APP_CONFIG_DEFAULTS.paths.logsDirectoryName),
    configDirectoryName: pathSegmentSchema.default(APP_CONFIG_DEFAULTS.paths.configDirectoryName),
    preferredPdfDirectory: pathSegmentSchema.default(
      APP_CONFIG_DEFAULTS.paths.preferredPdfDirectory
    )
  })
  .strict()
  .readonly()

const timingConfigSchema = z
  .object({
    queueCheckIntervalMs: z
      .number()
      .int()
      .min(30_000)
      .default(APP_CONFIG_DEFAULTS.timing.queueCheckIntervalMs),
    platformPageNavigationTimeoutMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.platformPageNavigationTimeoutMs
    ),
    navigationTimeoutMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.navigationTimeoutMs
    ),
    actionTimeoutMs: positiveIntegerSchema.default(APP_CONFIG_DEFAULTS.timing.actionTimeoutMs),
    readTimeoutMs: positiveIntegerSchema.default(APP_CONFIG_DEFAULTS.timing.readTimeoutMs),
    downloadStartTimeoutMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.downloadStartTimeoutMs
    ),
    cpiSearchPollingIntervalMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.cpiSearchPollingIntervalMs
    ),
    deskDataFormPollingIntervalMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.deskDataFormPollingIntervalMs
    ),
    deskDataResultPollingIntervalMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.deskDataResultPollingIntervalMs
    ),
    deskDataHistoryNavigationIntervalMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.deskDataHistoryNavigationIntervalMs
    ),
    queueFilterSettleDelayMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.queueFilterSettleDelayMs
    ),
    submitSettleDelayMs: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.timing.submitSettleDelayMs
    ),
    queueReturnDelayMs: positiveIntegerSchema.default(APP_CONFIG_DEFAULTS.timing.queueReturnDelayMs)
  })
  .strict()
  .readonly()

const limitsConfigSchema = z
  .object({
    cpiFrameSearchAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.cpiFrameSearchAttempts
    ),
    cpiIdentitySearchAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.cpiIdentitySearchAttempts
    ),
    cpiAttachmentSearchAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.cpiAttachmentSearchAttempts
    ),
    cpiResultSearchAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.cpiResultSearchAttempts
    ),
    cpiResultStabilizationAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.cpiResultStabilizationAttempts
    ),
    deskDataFormReadyAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.deskDataFormReadyAttempts
    ),
    deskDataResultSearchAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.deskDataResultSearchAttempts
    ),
    deskDataHistoryNavigationAttempts: positiveIntegerSchema.default(
      APP_CONFIG_DEFAULTS.limits.deskDataHistoryNavigationAttempts
    )
  })
  .strict()
  .readonly()

const appConfigSchema = z
  .object({
    platform: platformConfigSchema.prefault(APP_CONFIG_DEFAULTS.platform),
    paths: pathsConfigSchema.prefault(APP_CONFIG_DEFAULTS.paths),
    timing: timingConfigSchema.prefault(APP_CONFIG_DEFAULTS.timing),
    limits: limitsConfigSchema.prefault(APP_CONFIG_DEFAULTS.limits)
  })
  .strict()
  .readonly()

export type AppConfig = z.infer<typeof appConfigSchema>

export function parseAppConfig(input: unknown = {}): AppConfig {
  return appConfigSchema.parse(input)
}
