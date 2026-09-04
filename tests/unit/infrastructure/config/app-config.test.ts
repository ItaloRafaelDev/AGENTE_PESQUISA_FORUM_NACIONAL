import { describe, expect, it } from 'vitest'
import { parseAppConfig } from '@/infrastructure/config/app-config'

describe('parseAppConfig', () => {
  it('deve aplicar o contrato operacional padrão aprovado', () => {
    expect(parseAppConfig()).toEqual({
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
        submitSettleDelayMs: 15_000,
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
    })
  })

  it('deve retornar a configuração padrão profundamente imutável', () => {
    const config = parseAppConfig()

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.platform)).toBe(true)
    expect(Object.isFrozen(config.paths)).toBe(true)
    expect(Object.isFrozen(config.timing)).toBe(true)
    expect(Object.isFrozen(config.limits)).toBe(true)
  })

  it('deve mesclar substituições aninhadas válidas com os defaults', () => {
    expect(
      parseAppConfig({
        timing: {
          actionTimeoutMs: 12_000
        }
      })
    ).toMatchObject({
      timing: {
        actionTimeoutMs: 12_000,
        readTimeoutMs: 5_000
      }
    })
  })

  it('deve rejeitar URL de plataforma que não use HTTPS', () => {
    expect(() =>
      parseAppConfig({
        platform: {
          cpiQueueUrl: 'http://cpi.example.test/fila'
        }
      })
    ).toThrow()
  })

  it('deve rejeitar intervalo de consulta da fila abaixo do mínimo operacional', () => {
    expect(() =>
      parseAppConfig({
        timing: {
          queueCheckIntervalMs: 29_999
        }
      })
    ).toThrow()
  })

  it('deve rejeitar segmento de caminho vazio após remoção de espaços', () => {
    expect(() =>
      parseAppConfig({
        paths: {
          databaseFileName: '   '
        }
      })
    ).toThrow()
  })

  it('deve rejeitar chaves de configuração desconhecidas', () => {
    expect(() =>
      parseAppConfig({
        timing: {
          unknownTimeoutMs: 10_000
        }
      })
    ).toThrow()
  })
})
