import { describe, expect, it, vi } from 'vitest'
import { resolvePdfOutputDirectory } from '@/infrastructure/filesystem/pdf-output-directory-resolver'

describe('resolvePdfOutputDirectory', () => {
  it('mantém o diretório preferido quando ele está disponível', async () => {
    const filesystem = {
      ensureWritableDirectory: vi.fn().mockResolvedValue(undefined)
    }

    await expect(
      resolvePdfOutputDirectory(
        {
          preferredDirectory: 'E:\\PDF-AGENTE-CPI',
          fallbackDirectory: 'C:\\AppData\\AgenteCPI\\downloads'
        },
        filesystem
      )
    ).resolves.toBe('E:\\PDF-AGENTE-CPI')
  })

  it('usa downloads operacionais quando o diretório preferido está indisponível', async () => {
    const filesystem = {
      ensureWritableDirectory: vi
        .fn()
        .mockRejectedValueOnce(new Error('Unidade indisponível'))
        .mockResolvedValueOnce(undefined)
    }

    await expect(
      resolvePdfOutputDirectory(
        {
          preferredDirectory: 'E:\\PDF-AGENTE-CPI',
          fallbackDirectory: 'C:\\AppData\\AgenteCPI\\downloads'
        },
        filesystem
      )
    ).resolves.toBe('C:\\AppData\\AgenteCPI\\downloads')
  })

  it('preserva o erro do fallback quando os dois diretórios estão indisponíveis', async () => {
    const fallbackError = new Error('Downloads indisponíveis')
    const filesystem = {
      ensureWritableDirectory: vi
        .fn()
        .mockRejectedValueOnce(new Error('Unidade indisponível'))
        .mockRejectedValueOnce(fallbackError)
    }

    await expect(
      resolvePdfOutputDirectory(
        {
          preferredDirectory: 'E:\\PDF-AGENTE-CPI',
          fallbackDirectory: 'C:\\AppData\\AgenteCPI\\downloads'
        },
        filesystem
      )
    ).rejects.toBe(fallbackError)
  })
})
