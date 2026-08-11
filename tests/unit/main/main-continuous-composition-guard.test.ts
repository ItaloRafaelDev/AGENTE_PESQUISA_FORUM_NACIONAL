import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync('src/main/index.ts', 'utf8')

const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')

const viteConfigSource = readFileSync('electron.vite.config.ts', 'utf8')

const productionMainSource = `${mainSource}\n${runtimeSource}`
const oldAutomationImport = ['from ', "'../", 'automation/'].join('')

describe('composição contínua do processo principal', () => {
  it('injeta a configuração central de plataforma e intervalo da fila', () => {
    expect(runtimeSource).toContain('parseAppConfig()')
    expect(runtimeSource).toContain('config.platform')
    expect(runtimeSource).toContain('config.timing.queueCheckIntervalMs')
  })

  it('mantém o ciclo de vida Electron separado da composição da aplicação', () => {
    expect(mainSource).toContain('new MainApplicationRuntime()')

    expect(mainSource).toContain('mainRuntime.initialize()')

    expect(mainSource).toContain('mainRuntime.shutdown()')

    expect(mainSource).not.toContain('new ContinuousAgentRuntimeService')
  })

  it('configura o alias de runtime do processo principal a partir do catálogo canônico', () => {
    expect(viteConfigSource).toMatch(
      /main:\s*\{\s*resolve:\s*\{\s*alias:\s*\{\s*'@':\s*sourceAliases\['@'\]\s*\}\s*\}\s*\}/s
    )
  })

  it('usa o banco SQLite dentro de userData', () => {
    expect(runtimeSource).toContain("app.getPath('userData')")

    expect(runtimeSource).toContain('resolveApplicationPaths')

    expect(runtimeSource).toContain('ResearchHistoryRepository.open(runtimePaths.databaseFile)')

    expect(runtimeSource).toContain('markUnfinishedAsInterrupted')
  })

  it('compõe o núcleo application e suas fronteiras concretas', () => {
    expect(runtimeSource).toContain("from '../infrastructure/automation/")
    expect(runtimeSource).not.toContain(oldAutomationImport)
    expect(runtimeSource).toContain('new ResearchHistoryService({')
    expect(runtimeSource).toContain('new AgentStateMachine()')
    expect(runtimeSource).toContain('new ContinuousAgentCoordinator({')
    expect(runtimeSource).toContain('new SystemClock()')
    expect(runtimeSource).toContain('new UuidGenerator()')
    expect(runtimeSource).toContain('new SafeMessageSanitizerAdapter()')
    expect(runtimeSource).toContain('new PlaywrightAgentWorkspaceAdapter(')
    expect(runtimeSource).toContain('new ContinuousAgentIpcAdapter(')
    expect(runtimeSource).not.toContain('new AgentPublicStateStore')
    expect(runtimeSource).not.toContain('new ContinuousAgentRuntimeService')
    expect(runtimeSource).not.toContain('createContinuousResearchRunner')
  })

  it('registra IPC do agente, histórico e PDF', () => {
    expect(runtimeSource).toContain('registerContinuousAgentIpcHandlers')

    expect(runtimeSource).toContain('registerHistoryIpcHandlers')

    expect(runtimeSource).toContain('registerPdfIpcHandlers')
  })

  it('mantém o renderer isolado de Node.js', () => {
    expect(mainSource).toMatch(/contextIsolation:\s*true/)

    expect(mainSource).toMatch(/nodeIntegration:\s*false/)
  })

  it('não executa PowerShell, pnpm ou child_process', () => {
    expect(productionMainSource).not.toContain('child_process')

    expect(productionMainSource).not.toMatch(/\bexec\s*\(/)

    expect(productionMainSource).not.toMatch(/\bspawn\s*\(/)

    expect(productionMainSource).not.toContain('powershell')

    expect(productionMainSource).not.toContain('pnpm')
  })

  it('encerra coordenador, navegador e banco ao sair do aplicativo', () => {
    expect(runtimeSource).toContain('agentCoordinator?.shutdown()')

    expect(runtimeSource).toContain('await this.browserService.stop()')

    expect(runtimeSource).toContain('historyRepository?.close()')
  })
})
