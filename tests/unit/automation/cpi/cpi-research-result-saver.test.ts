import { describe, expect, it, vi } from 'vitest'
import {
  CpiResearchResultSaver,
  type CpiResearchSaveFrame
} from '@/automation/cpi/cpi-research-result-saver'

describe('CpiResearchResultSaver', () => {
  it('deve clicar em Alterar exatamente uma vez', async () => {
    const saveClick = vi.fn(async () => undefined)

    const frame: CpiResearchSaveFrame = {
      locator: vi.fn((selector: string) => {
        if (selector !== 'form[name="form_cad"] a.button[onclick*="upd_pesq"]') {
          throw new Error('Seletor inesperado: ' + selector)
        }

        return {
          count: vi.fn(async () => 1),
          click: saveClick
        }
      })
    }

    const saver = new CpiResearchResultSaver()

    const result = await saver.saveOnce(frame)

    expect(saveClick).toHaveBeenCalledTimes(1)
    expect(saveClick).toHaveBeenCalledWith({ timeout: 10_000 })
    expect(result).toEqual({ saved: true })
  })

  it('deve bloquear uma segunda tentativa de gravação', async () => {
    const saveClick = vi.fn(async () => undefined)

    const frame: CpiResearchSaveFrame = {
      locator: vi.fn(() => ({
        count: vi.fn(async () => 1),
        click: saveClick
      }))
    }

    const saver = new CpiResearchResultSaver()

    await saver.saveOnce(frame)

    await expect(saver.saveOnce(frame)).rejects.toThrow(
      'A pesquisa da CPI já foi gravada ou está sendo gravada nesta execução.'
    )

    expect(saveClick).toHaveBeenCalledTimes(1)
  })

  it('deve permitir nova tentativa quando o clique falhar', async () => {
    const saveClick = vi
      .fn()
      .mockRejectedValueOnce(new Error('Falha simulada no clique.'))
      .mockResolvedValueOnce(undefined)

    const frame: CpiResearchSaveFrame = {
      locator: vi.fn(() => ({
        count: vi.fn(async () => 1),
        click: saveClick
      }))
    }

    const saver = new CpiResearchResultSaver()

    await expect(saver.saveOnce(frame)).rejects.toThrow('Falha simulada no clique.')

    await expect(saver.saveOnce(frame)).resolves.toEqual({
      saved: true
    })

    expect(saveClick).toHaveBeenCalledTimes(2)
  })

  it('deve rejeitar quando o botão Alterar não for único', async () => {
    const saveClick = vi.fn(async () => undefined)

    const frame: CpiResearchSaveFrame = {
      locator: vi.fn(() => ({
        count: vi.fn(async () => 0),
        click: saveClick
      }))
    }

    await expect(new CpiResearchResultSaver().saveOnce(frame)).rejects.toThrow(
      'A ação Alterar deveria possuir exatamente um controle. Encontrados: 0'
    )

    expect(saveClick).not.toHaveBeenCalled()
  })
})
