import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/main/index.ts', 'utf8')

describe('composição contínua do processo principal', () => {
  it('usa o banco SQLite dentro de userData', () => {
    expect(source).toContain("app.getPath('userData')")

    expect(source).toContain("'agente-cpi.sqlite'")

    expect(source).toContain('ResearchHistoryRepository.open')

    expect(source).toContain('markUnfinishedAsInterrupted')
  })

  it('compõe o runner contínuo e o runtime público', () => {
    expect(source).toContain('new ContinuousResearchRunner()')

    expect(source).toContain('new AgentPublicStateStore()')

    expect(source).toContain('new ContinuousAgentRuntimeService')
  })

  it('registra IPC do agente, histórico e PDF', () => {
    expect(source).toContain('registerContinuousAgentIpcHandlers')

    expect(source).toContain('registerHistoryIpcHandlers')

    expect(source).toContain('registerPdfIpcHandlers')
  })

  it('mantém o renderer isolado de Node.js', () => {
    expect(source).toMatch(/contextIsolation:\s*true/)

    expect(source).toMatch(/nodeIntegration:\s*false/)
  })

  it('não executa PowerShell, pnpm ou child_process', () => {
    expect(source).not.toContain('child_process')

    expect(source).not.toMatch(/\bexec\s*\(/)

    expect(source).not.toMatch(/\bspawn\s*\(/)

    expect(source).not.toContain('powershell')

    expect(source).not.toContain('pnpm')
  })

  it('encerra runtime, navegador e banco ao sair do aplicativo', () => {
    expect(source).toContain('agentRuntimeService?.shutdown()')

    expect(source).toContain('browserService?.stop()')

    expect(source).toContain('historyRepository?.close()')
  })
})
