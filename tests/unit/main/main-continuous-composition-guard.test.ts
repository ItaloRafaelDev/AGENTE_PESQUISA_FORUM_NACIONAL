import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync('src/main/index.ts', 'utf8')

const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')

const productionMainSource = `${mainSource}\n${runtimeSource}`

describe('composição contínua do processo principal', () => {
  it('mantém o ciclo de vida Electron separado da composição da aplicação', () => {
    expect(mainSource).toContain('new MainApplicationRuntime()')

    expect(mainSource).toContain('mainRuntime.initialize()')

    expect(mainSource).toContain('mainRuntime.shutdown()')

    expect(mainSource).not.toContain('new ContinuousAgentRuntimeService')
  })

  it('usa o banco SQLite dentro de userData', () => {
    expect(runtimeSource).toContain("app.getPath('userData')")

    expect(runtimeSource).toContain("'agente-cpi.sqlite'")

    expect(runtimeSource).toContain('ResearchHistoryRepository.open')

    expect(runtimeSource).toContain('markUnfinishedAsInterrupted')
  })

  it('compõe o runner contínuo e o runtime público', () => {
    expect(runtimeSource).toContain('new ContinuousResearchRunner()')

    expect(runtimeSource).toContain('new AgentPublicStateStore()')

    expect(runtimeSource).toContain('new ContinuousAgentRuntimeService')
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

  it('encerra runtime, navegador e banco ao sair do aplicativo', () => {
    expect(runtimeSource).toContain('agentRuntimeService?.shutdown()')

    expect(runtimeSource).toContain('await this.browserService.stop()')

    expect(runtimeSource).toContain('historyRepository?.close()')
  })
})
