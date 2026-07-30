import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const prohibitedRepositoryArtifacts = [
  '.agent-backups',
  '.agent-config-backups',
  'task-12-dashboard-context.txt',
  'task-13-dashboard-targeted-context.txt',
  'artifacts/task-3-current-context.txt',
  'artifacts/full-flow-integration-inspection/full-flow-context-20260714-144305.txt',
  'prettier.config.mjs',
  'src/renderer/src/assets/base.css',
  'src/renderer/src/assets/electron.svg',
  'src/renderer/src/assets/wavy-lines.svg'
] as const

describe('repository artifact hygiene', () => {
  it('não mantém backups, dumps de contexto ou assets de template obsoletos', () => {
    expect(prohibitedRepositoryArtifacts.filter((filePath) => existsSync(filePath))).toEqual([])
  })

  it('não mantém configuração, dependências, scripts ou lockfile do Drizzle', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }
    const lockfileSource = readFileSync(resolve('pnpm-lock.yaml'), 'utf8')

    expect(existsSync(resolve('drizzle.config.ts'))).toBe(false)
    expect(packageJson.dependencies).not.toHaveProperty('drizzle-orm')
    expect(packageJson.devDependencies).not.toHaveProperty('drizzle-kit')
    expect(packageJson.scripts).not.toHaveProperty('db:generate')
    expect(packageJson.scripts).not.toHaveProperty('db:studio')
    expect(lockfileSource).not.toContain('drizzle-orm')
    expect(lockfileSource).not.toContain('drizzle-kit')
  })
})
