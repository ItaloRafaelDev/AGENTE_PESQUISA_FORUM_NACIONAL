import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8')
}

describe('blindagem da gravação automática', () => {
  it('não exige a palavra GRAVAR no comando contínuo e usa a execução canônica', () => {
    const source = readProjectFile('scripts/run-continuous-auto-research.ts')

    expect(source).not.toMatch(/\bGRAVAR\b/)
    expect(source).not.toContain('isCpiResearchSaveConfirmed')
    expect(source).toContain('createPlaywrightContinuousResearchExecutionAdapter')
  })

  it('não possui confirmação textual no ciclo automático', () => {
    const source = readProjectFile(
      'src/infrastructure/automation/workflow/playwright-cpi-research-cycle-adapter.ts'
    )

    expect(source).not.toContain('createInterface')
    expect(source).not.toContain('readline')
    expect(source).not.toContain('isCpiResearchSaveConfirmed')
    expect(source).not.toMatch(/\bGRAVAR\b/)
  })

  it('aciona o controlador de gravação uma única vez no código do ciclo', () => {
    const cycleAdapterSource = readProjectFile(
      'src/infrastructure/automation/workflow/playwright-cpi-research-cycle-adapter.ts'
    )
    const applicationSource = readProjectFile('src/application/research/run-research-cycle.ts')

    expect(cycleAdapterSource.match(/saveController\.saveOnce\s*\(/g) ?? []).toHaveLength(1)
    expect(applicationSource).toContain("'SAVING_CPI'")
    expect(applicationSource).toContain('confirmationAccepted')
  })

  it('aceita somente o diálogo esperado da CPI', () => {
    const source = readProjectFile(
      'src/infrastructure/automation/cpi/cpi-research-confirmed-save-controller.ts'
    )

    expect(source).toContain('EXPECTED_CONFIRMATION_PATTERN')
    expect(source).toContain("dialog.type() === 'confirm'")
    expect(source).toContain('await dialog.accept()')
    expect(source).toContain('await dialog.dismiss()')
    expect(source).toContain('A CPI apresentou um diálogo diferente da confirmação esperada.')
  })

  it('mantém o comando operacional final no package.json', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['flow:run-continuous']).toBe(
      'tsx scripts/run-continuous-auto-research.ts'
    )
  })
})
