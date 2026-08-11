import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

const scriptPath = resolve(projectRoot, 'scripts/run-continuous-auto-research.ts')

const packagePath = resolve(projectRoot, 'package.json')

describe('comando operacional contínuo', () => {
  it('deve possuir script automático sem confirmação GRAVAR', () => {
    expect(existsSync(scriptPath)).toBe(true)

    const source = readFileSync(scriptPath, 'utf8')

    expect(source).toContain('createPlaywrightContinuousResearchExecutionAdapter')

    expect(source).toContain('SafeResearchLogger')

    expect(source).toContain('applyCriminalForumFilter')

    expect(source).toContain("process.once('SIGINT'")

    expect(source).toContain('control.requestStop()')

    expect(source).not.toContain('GRAVAR')

    expect(source).not.toContain('isCpiResearchSaveConfirmed')
  })

  it('deve registrar o comando flow:run-continuous', () => {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['flow:run-continuous']).toBe(
      'tsx scripts/run-continuous-auto-research.ts'
    )
  })
})
