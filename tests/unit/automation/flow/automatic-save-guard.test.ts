import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8')
}

describe('blindagem da gravação automática', () => {
  it('não deve exigir a palavra GRAVAR no comando contínuo', () => {
    const source = readProjectFile('scripts/run-continuous-auto-research.ts')

    expect(source).not.toMatch(/\bGRAVAR\b/)
    expect(source).not.toContain('isCpiResearchSaveConfirmed')

    expect(source).toContain('ContinuousResearchRunner')
  })

  it('não deve possuir confirmação textual no ciclo automático', () => {
    const source = readProjectFile('src/automation/flow/single-research-cycle.ts')

    expect(source).not.toContain('createInterface')

    expect(source).not.toContain('readline')

    expect(source).not.toContain('isCpiResearchSaveConfirmed')

    expect(source).not.toMatch(/\bGRAVAR\b/)
  })

  it('deve acionar o controlador de gravação uma única vez no código do ciclo', () => {
    const source = readProjectFile('src/automation/flow/single-research-cycle.ts')

    const saveCalls = source.match(/saveController\.saveOnce\s*\(/g) ?? []

    expect(saveCalls).toHaveLength(1)

    expect(source).toContain("'SAVING_CPI'")

    expect(source).toContain('confirmationAccepted')
  })

  it('deve aceitar somente o diálogo esperado da CPI', () => {
    const source = readProjectFile('src/automation/cpi/cpi-research-confirmed-save-controller.ts')

    expect(source).toContain('EXPECTED_CONFIRMATION_PATTERN')

    expect(source).toContain("dialog.type() === 'confirm'")

    expect(source).toContain('await dialog.accept()')

    expect(source).toContain('await dialog.dismiss()')

    expect(source).toContain('A CPI apresentou um diálogo diferente da confirmação esperada.')
  })

  it('deve manter o comando operacional final no package.json', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['flow:run-continuous']).toBe(
      'tsx scripts/run-continuous-auto-research.ts'
    )
  })
})
