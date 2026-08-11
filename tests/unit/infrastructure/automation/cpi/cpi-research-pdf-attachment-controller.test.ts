import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Frame } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CpiResearchPdfAttachmentController } from '@/infrastructure/automation/cpi/cpi-research-pdf-attachment-controller'
import { CPI_RESEARCH_PDF_UPLOAD_SELECTOR } from '@/infrastructure/automation/cpi/cpi-selectors'

interface TestFrameContext {
  frame: Frame
  setInputFiles: ReturnType<typeof vi.fn>
  count: ReturnType<typeof vi.fn>
}

const temporaryDirectories: string[] = []

async function createTemporaryPdf(content = '%PDF-1.7\narquivo de teste'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agente-cpi-attachment-'))

  temporaryDirectories.push(directory)

  const filePath = join(directory, 'deskdata-teste.pdf')

  await writeFile(filePath, content)

  return filePath
}

function createFrame(
  attachedFileName: string,
  controlCount: () => Promise<number> = async () => 1
): TestFrameContext {
  const setInputFiles = vi.fn(async () => undefined)
  const count = vi.fn(controlCount)

  const frame = {
    locator: vi.fn((selector: string) => {
      if (selector !== CPI_RESEARCH_PDF_UPLOAD_SELECTOR) {
        throw new Error('Seletor inesperado: ' + selector)
      }

      return {
        count,
        setInputFiles,
        evaluate: vi.fn(async () => ({
          count: 1,
          name: attachedFileName
        }))
      }
    })
  } as unknown as Frame

  return {
    frame,
    setInputFiles,
    count
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, {
        recursive: true,
        force: true
      })
    })
  )
})

describe('CpiResearchPdfAttachmentController', () => {
  it('deve anexar e confirmar exatamente um PDF', async () => {
    const filePath = await createTemporaryPdf()
    const context = createFrame(basename(filePath))

    const result = await new CpiResearchPdfAttachmentController().attachOnce(
      context.frame,
      filePath
    )

    expect(context.setInputFiles).toHaveBeenCalledTimes(1)
    expect(context.setInputFiles).toHaveBeenCalledWith(filePath)
    expect(result).toEqual({
      attached: true,
      filePath,
      fileName: basename(filePath),
      sizeBytes: Buffer.byteLength('%PDF-1.7\narquivo de teste')
    })
  })

  it('deve aguardar o campo de anexo ser renderizado', async () => {
    const filePath = await createTemporaryPdf()
    let attempts = 0

    const context = createFrame(basename(filePath), async () => {
      attempts += 1
      return attempts >= 3 ? 1 : 0
    })

    await new CpiResearchPdfAttachmentController({
      controlSearchAttempts: 4,
      controlSearchIntervalMs: 0
    }).attachOnce(context.frame, filePath)

    expect(context.count.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(context.setInputFiles).toHaveBeenCalledTimes(1)
  })

  it('deve bloquear uma segunda tentativa de anexo', async () => {
    const filePath = await createTemporaryPdf()
    const context = createFrame(basename(filePath))
    const controller = new CpiResearchPdfAttachmentController()

    await controller.attachOnce(context.frame, filePath)

    await expect(controller.attachOnce(context.frame, filePath)).rejects.toThrow(
      'O PDF já foi anexado ou está sendo anexado nesta execução.'
    )

    expect(context.setInputFiles).toHaveBeenCalledTimes(1)
  })

  it('deve rejeitar um arquivo sem assinatura PDF', async () => {
    const filePath = await createTemporaryPdf('arquivo inválido')
    const context = createFrame(basename(filePath))

    await expect(
      new CpiResearchPdfAttachmentController().attachOnce(context.frame, filePath)
    ).rejects.toThrow('O arquivo selecionado não possui uma assinatura PDF válida.')

    expect(context.setInputFiles).not.toHaveBeenCalled()
  })

  it('deve rejeitar quando o campo não aparecer', async () => {
    const filePath = await createTemporaryPdf()
    const context = createFrame(basename(filePath), async () => 0)

    await expect(
      new CpiResearchPdfAttachmentController({
        controlSearchAttempts: 2,
        controlSearchIntervalMs: 0
      }).attachOnce(context.frame, filePath)
    ).rejects.toThrow('O campo de anexo deveria possuir exatamente um controle. Encontrados: 0')

    expect(context.setInputFiles).not.toHaveBeenCalled()
  })

  it('deve rejeitar quando o navegador confirmar outro arquivo', async () => {
    const filePath = await createTemporaryPdf()
    const context = createFrame('arquivo-diferente.pdf')

    await expect(
      new CpiResearchPdfAttachmentController().attachOnce(context.frame, filePath)
    ).rejects.toThrow('O arquivo confirmado no campo da CPI não corresponde ao PDF selecionado.')
  })
})
