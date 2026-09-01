import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface BuilderConfig {
  appId: string
  productName: string
  directories: {
    buildResources: string
    output: string
  }
  files: string[]
  win: {
    icon: string
    executableName: string
    target: Array<{
      target: string
      arch: string[]
    }>
  }
  nsis: {
    oneClick: boolean
    perMachine: boolean
    allowElevation: boolean
    allowToChangeInstallationDirectory: boolean
    artifactName: string
    shortcutName: string
    uninstallDisplayName: string
    createStartMenuShortcut: boolean
    createDesktopShortcut: boolean
    runAfterFinish: boolean
    deleteAppDataOnUninstall: boolean
    include: string
  }
  npmRebuild: boolean
  electronDownload: {
    mirror: string
  }
  description?: string
  author?: unknown
  homepage?: string
  companyName?: string
  publisherName?: string | string[]
}

const requireFromTest = createRequire(import.meta.url)
const configPath = resolve('electron-builder.config.cjs')
const identityPath = resolve('build/application-identity.json')

const loadBuilderConfig = (): BuilderConfig => requireFromTest(configPath) as BuilderConfig

describe('electron-builder Windows configuration', () => {
  it('produz somente o instalador x64 com a identidade canônica e os controles de instalação aprovados', () => {
    expect(existsSync(configPath)).toBe(true)
    expect(existsSync(identityPath)).toBe(true)

    const config = loadBuilderConfig()
    const identity = JSON.parse(readFileSync(identityPath, 'utf8')) as {
      appId: string
      productName: string
      executableName: string
    }

    expect(config.appId).toBe(identity.appId)
    expect(config.productName).toBe(identity.productName)
    expect(config.win).toMatchObject({
      executableName: identity.executableName,
      target: [{ target: 'nsis', arch: ['x64'] }]
    })
    expect(config.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }])
    expect(config.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createStartMenuShortcut: true,
      createDesktopShortcut: false,
      runAfterFinish: false,
      deleteAppDataOnUninstall: false
    })
    expect(config.nsis.artifactName).toBe('Agente-CPI-${version}-Setup-x64.${ext}')
    expect(config.win.icon).toBe('build/icon.ico')
    expect(config.nsis.include).toBe('build/installer.nsh')
    expect(config.directories).toMatchObject({ buildResources: 'build', output: 'release' })
    expect(config.npmRebuild).toBe(false)
    expect(config.electronDownload.mirror).toBe('https://npmmirror.com/mirrors/electron/')
    expect(config.files).toEqual([
      '!**/.vscode/*',
      '!src/*',
      '!electron.vite.config.{js,ts,mjs,cjs}',
      '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}',
      '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
      '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
    ])
    expect(existsSync(resolve('electron-builder.yml'))).toBe(false)
  })

  it('expõe scripts de distribuição x64 com a configuração executável e um único gerenciador de pacotes', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      packageManager?: string
      scripts: Record<string, string>
    }

    expect(packageJson.packageManager).toBe('pnpm@10.28.1')
    expect(packageJson.scripts['build:unpack']).toContain('--config electron-builder.config.cjs')
    expect(packageJson.scripts['build:unpack']).toContain('--dir')
    expect(packageJson.scripts['build:unpack']).toContain('--x64')
    expect(packageJson.scripts['build:win']).toContain('--config electron-builder.config.cjs')
    expect(packageJson.scripts['build:win']).toContain('--win')
    expect(packageJson.scripts['build:win']).toContain('--x64')
  })

  it('não herda metadados template nem injeta uma segunda identidade ou URL pública', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as Record<
      string,
      unknown
    >
    const config = loadBuilderConfig()

    expect(packageJson).not.toHaveProperty('description')
    expect(packageJson).not.toHaveProperty('author')
    expect(packageJson).not.toHaveProperty('homepage')
    expect(config).not.toHaveProperty('description')
    expect(config).not.toHaveProperty('author')
    expect(config).not.toHaveProperty('homepage')
    expect(config).not.toHaveProperty('companyName')
    expect(config).not.toHaveProperty('publisherName')
  })
})
