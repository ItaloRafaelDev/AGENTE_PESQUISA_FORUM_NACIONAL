import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>
  dependencies: Record<string, string>
}
const builderConfig = readFileSync('electron-builder.yml', 'utf8')
const mainSource = readFileSync('src/main/index.ts', 'utf8')

describe('Windows-only project contract', () => {
  it('expõe somente scripts e dependências de distribuição suportados', () => {
    expect(packageJson.scripts).toHaveProperty('build:win')
    expect(packageJson.scripts).not.toHaveProperty('build:mac')
    expect(packageJson.scripts).not.toHaveProperty('build:linux')
    expect(packageJson.dependencies).not.toHaveProperty('electron-updater')
  })

  it('mantém somente configuração e assets de empacotamento Windows', () => {
    expect(builderConfig).toMatch(/^win:/m)
    expect(builderConfig).not.toMatch(/^(mac|dmg|linux|appImage|publish):/m)
    expect(existsSync('build/entitlements.mac.plist')).toBe(false)
    expect(existsSync('build/icon.icns')).toBe(false)
    expect(existsSync('dev-app-update.yml')).toBe(false)
  })

  it('remove ramificações de runtime exclusivas de plataformas não suportadas', () => {
    expect(mainSource).not.toContain('process.platform')
    expect(mainSource).not.toContain("app.on('activate'")
    expect(existsSync('resources/icon.png')).toBe(false)
  })
})
