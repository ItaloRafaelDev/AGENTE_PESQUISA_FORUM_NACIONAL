import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync('src/main/index.ts', 'utf8')

const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')

const appConfigSource = readFileSync('src/infrastructure/config/app-config.ts', 'utf8')

const productionMainSource = `${mainSource}\n${runtimeSource}`

const preloadSource = readFileSync('src/preload/index.ts', 'utf8')

const dashboardSource = readFileSync('src/renderer/src/components/AgentDashboard.tsx', 'utf8')

const historySource = readFileSync('src/renderer/src/components/ResearchHistoryPanel.tsx', 'utf8')

const countdownSource = readFileSync('src/renderer/src/hooks/use-agent-countdown.ts', 'utf8')

describe('dashboard production guard', () => {
  it('mantém início exclusivamente manual', () => {
    expect(dashboardSource).not.toMatch(/control\.start\s*\(/)

    expect(productionMainSource).not.toMatch(/agentRuntimeService\s*\.\s*start\s*\(/)
  })

  it('usa eventos em tempo real sem polling do agente', () => {
    expect(dashboardSource).toContain('onStateChanged')

    expect(dashboardSource).not.toContain('setInterval')

    expect(countdownSource).toContain('setInterval')
  })

  it('mantém isolamento e não expõe execução arbitrária', () => {
    expect(mainSource).toMatch(/contextIsolation:\s*true/)

    expect(mainSource).toMatch(/nodeIntegration:\s*false/)

    const productionSources = [
      productionMainSource,
      preloadSource,
      dashboardSource,
      historySource
    ].join('\n')

    expect(productionSources).not.toContain('child_process')

    expect(productionSources).not.toMatch(/\bexec\s*\(/)

    expect(productionSources).not.toMatch(/\bspawn\s*\(/)
  })

  it('mantém SQLite, histórico e PDF integrados', () => {
    expect(appConfigSource).toContain('agente-cpi.sqlite')
    expect(runtimeSource).toContain('resolveApplicationPaths')
    expect(runtimeSource).toContain('runtimePaths.databaseFile')

    expect(dashboardSource).toContain('ResearchHistoryPanel')

    expect(historySource).toContain('window.agent.pdf.open')

    expect(historySource).toContain('window.agent.pdf.reveal')
  })

  it('não contém CPF completo estático nos componentes de produção', () => {
    expect(`${dashboardSource}\n${historySource}`).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it('exibe login manual, erro E1 e countdown', () => {
    expect(dashboardSource).toContain('Login concluído — continuar')

    expect(dashboardSource).toContain('agent.lastError')

    expect(dashboardSource).toContain('useAgentCountdown')
  })
})
