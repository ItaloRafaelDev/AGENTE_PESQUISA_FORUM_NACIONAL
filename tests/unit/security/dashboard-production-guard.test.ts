import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface SourceFile {
  path: string
  source: string
}

const mainSource = readFileSync('src/main/index.ts', 'utf8')
const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')
const appConfigSource = readFileSync('src/infrastructure/config/app-config.ts', 'utf8')
const productionMainSource = `${mainSource}\n${runtimeSource}`
const preloadSource = readFileSync('src/preload/index.ts', 'utf8')

function readSourceFiles(directory: string): readonly SourceFile[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name)

      if (entry.isDirectory()) {
        return readSourceFiles(path)
      }

      return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)
        ? [{ path: path.replaceAll('\\', '/'), source: readFileSync(path, 'utf8') }]
        : []
    })
}

const rendererSourceFiles = readSourceFiles('src/renderer/src')
const rendererSource = rendererSourceFiles.map(({ source }) => source).join('\n')

function requireRendererSource(path: string): string {
  const matchingFile = rendererSourceFiles.find((file) => file.path === path)

  if (!matchingFile) {
    throw new Error(`Renderer source obrigatório ausente: ${path}`)
  }

  return matchingFile.source
}

function filesContaining(pattern: RegExp): readonly string[] {
  return rendererSourceFiles
    .filter(({ source }) => pattern.test(source))
    .map(({ path }) => path)
    .sort()
}

const requiredRendererPaths = [
  'src/renderer/src/api/agent-api.ts',
  'src/renderer/src/components/AgentDashboard.tsx',
  'src/renderer/src/components/ResearchHistoryPanel.tsx',
  'src/renderer/src/features/dashboard/AgentErrorPanel.tsx',
  'src/renderer/src/features/dashboard/AgentStatusPanel.tsx',
  'src/renderer/src/features/dashboard/BrowserStatusPanel.tsx',
  'src/renderer/src/features/dashboard/DashboardHeader.tsx',
  'src/renderer/src/features/dashboard/OperationalLogPanel.tsx',
  'src/renderer/src/features/dashboard/PlatformSessionsPanel.tsx',
  'src/renderer/src/features/dashboard/StatusIndicator.tsx',
  'src/renderer/src/features/dashboard/dashboard-model.ts',
  'src/renderer/src/features/dashboard/use-agent-control.ts',
  'src/renderer/src/features/dashboard/use-agent-dashboard.ts',
  'src/renderer/src/features/dashboard/use-dashboard-actions.ts',
  'src/renderer/src/features/dashboard/use-dashboard-environment.ts',
  'src/renderer/src/features/dashboard/use-mounted-ref.ts',
  'src/renderer/src/features/dashboard/use-operational-log.ts',
  'src/renderer/src/features/history/ResearchHistoryTable.tsx',
  'src/renderer/src/features/history/research-history-model.ts',
  'src/renderer/src/features/history/use-research-history.ts'
] as const

const expectedPresentationPaths = [
  'src/renderer/src/features/dashboard/AgentErrorPanel.tsx',
  'src/renderer/src/features/dashboard/AgentStatusPanel.tsx',
  'src/renderer/src/features/dashboard/BrowserStatusPanel.tsx',
  'src/renderer/src/features/dashboard/DashboardHeader.tsx',
  'src/renderer/src/features/dashboard/OperationalLogPanel.tsx',
  'src/renderer/src/features/dashboard/PlatformSessionsPanel.tsx',
  'src/renderer/src/features/dashboard/StatusIndicator.tsx',
  'src/renderer/src/features/history/ResearchHistoryTable.tsx'
] as const

const presentationComponentPaths = rendererSourceFiles
  .map(({ path }) => path)
  .filter(
    (path) =>
      path.startsWith('src/renderer/src/features/') && /^[A-Z][^/]*\.tsx$/.test(basename(path))
  )
  .sort()

const prohibitedPresentationPatterns = [
  /\bwindow\b/,
  /\buse(?:ActionState|Effect|InsertionEffect|LayoutEffect|Optimistic|Reducer|State|SyncExternalStore|Transition)\b/,
  /\bgetAgentApi\b|\/api\/agent-api/,
  /\bipcRenderer\b|\bIpcRendererEvent\b/,
  /@electron-toolkit\/preload|\belectronAPI\b/
] as const

const dashboardSource = requireRendererSource('src/renderer/src/components/AgentDashboard.tsx')
const historySource = requireRendererSource('src/renderer/src/components/ResearchHistoryPanel.tsx')
const agentControlSource = requireRendererSource(
  'src/renderer/src/features/dashboard/use-agent-control.ts'
)
const dashboardCoordinatorSource = requireRendererSource(
  'src/renderer/src/features/dashboard/use-agent-dashboard.ts'
)
const dashboardModelSource = requireRendererSource(
  'src/renderer/src/features/dashboard/dashboard-model.ts'
)
const operationalLogSource = requireRendererSource(
  'src/renderer/src/features/dashboard/use-operational-log.ts'
)
const historyHookSource = requireRendererSource(
  'src/renderer/src/features/history/use-research-history.ts'
)
const historyModelSource = requireRendererSource(
  'src/renderer/src/features/history/research-history-model.ts'
)
const countdownSource = requireRendererSource('src/renderer/src/hooks/use-agent-countdown.ts')
const agentStatusPanelSource = requireRendererSource(
  'src/renderer/src/features/dashboard/AgentStatusPanel.tsx'
)

describe('dashboard production guard', () => {
  it('mantém o gateway como único acesso do renderer ao preload restrito', () => {
    expect(filesContaining(/\bwindow\.agent\b/)).toEqual(['src/renderer/src/api/agent-api.ts'])
    expect(filesContaining(/\bipcRenderer\b|\bIpcRendererEvent\b/)).toEqual([])
    expect(filesContaining(/@electron-toolkit\/preload|\belectronAPI\b/)).toEqual([])
  })

  it('mantém todos os módulos planejados e protege componentes de apresentação recursivamente', () => {
    const rendererPaths = rendererSourceFiles.map(({ path }) => path)

    for (const requiredPath of requiredRendererPaths) {
      expect(rendererPaths).toContain(requiredPath)
    }

    for (const expectedPath of expectedPresentationPaths) {
      expect(presentationComponentPaths).toContain(expectedPath)
    }

    for (const componentPath of presentationComponentPaths) {
      const source = requireRendererSource(componentPath)

      for (const prohibitedPattern of prohibitedPresentationPatterns) {
        expect(source).not.toMatch(prohibitedPattern)
      }
    }
  })

  it('mantém estado, efeitos e regras nos hooks e modelos canônicos', () => {
    const publicComponentSource = `${dashboardSource}\n${historySource}`

    expect(dashboardSource).toContain('useAgentDashboard')
    expect(dashboardSource).toContain('getDashboardControlState')
    expect(historySource).toContain('useResearchHistory')
    expect(historySource).toContain('ResearchHistoryTable')

    expect(publicComponentSource).not.toMatch(
      /\buse(?:ActionState|Callback|Effect|InsertionEffect|LayoutEffect|Memo|Optimistic|Reducer|Ref|State|SyncExternalStore|Transition)\b/
    )
    expect(publicComponentSource).not.toMatch(
      /\bgetAgentApi\b|\bwindow\b|\bDate\.now\b|\.slice\(0,\s*10\)|\.sort\(|\.filter\(/
    )
    expect(publicComponentSource).not.toMatch(
      /\b(?:formatLogTime|formatHistoryDate|formatHistoryDuration|formatResearchClassification|formatResearchStatus|upsertResearchHistoryRecord)\b/
    )
    expect(publicComponentSource).not.toMatch(
      /\b(?:PARADO|ERRO_E1|EXECUTANDO|OCIOSO|PAUSADO|PARANDO|AGUARDANDO_LOGIN)\b/
    )

    expect(dashboardCoordinatorSource).toMatch(/Promise\.all\s*\(/)
    expect(agentControlSource).toContain('onStateChanged')
    expect(operationalLogSource).toMatch(/Date\.now\(\)/)
    expect(operationalLogSource).toMatch(/\.slice\(0, 10\)/)
    expect(dashboardModelSource).toContain('getDashboardControlState')
    expect(historyHookSource).toContain('onRecordCreated')
    expect(historyHookSource).toContain('onRecordUpdated')
    expect(historyHookSource).toContain('onCleared')
    expect(historyModelSource).toContain('upsertResearchHistoryRecord')
  })

  it('mantém início exclusivamente manual', () => {
    expect(dashboardSource).not.toMatch(/control\.start\s*\(/)
    expect(productionMainSource).not.toMatch(/agentRuntimeService\s*\.\s*start\s*\(/)
  })

  it('usa eventos em tempo real sem polling do agente', () => {
    expect(agentControlSource).toContain('onStateChanged')
    expect(rendererSource.replace(countdownSource, '')).not.toContain('setInterval')
    expect(countdownSource).toContain('setInterval')
  })

  it('mantém isolamento e não expõe execução arbitrária', () => {
    expect(mainSource).toMatch(/sandbox:\s*true/)
    expect(mainSource).toMatch(/contextIsolation:\s*true/)
    expect(mainSource).toMatch(/nodeIntegration:\s*false/)

    const productionSources = [productionMainSource, preloadSource, rendererSource].join('\n')

    expect(productionSources).not.toContain('child_process')
    expect(productionSources).not.toMatch(/\bexec\s*\(/)
    expect(productionSources).not.toMatch(/\bspawn\s*\(/)
  })

  it('mantém SQLite, histórico e PDF integrados', () => {
    expect(appConfigSource).toContain('agente-cpi.sqlite')
    expect(runtimeSource).toContain('resolveApplicationPaths')
    expect(runtimeSource).toContain('runtimePaths.databaseFile')
    expect(dashboardSource).toContain('ResearchHistoryPanel')
    expect(historyHookSource).toContain('api.pdf.open')
    expect(historyHookSource).toContain('api.pdf.reveal')
  })

  it('não contém CPF completo estático no renderer de produção', () => {
    expect(rendererSource).not.toMatch(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  })

  it('exibe login manual, erro E1 e countdown', () => {
    expect(agentStatusPanelSource).toContain('Login concluído — continuar')
    expect(dashboardSource).toContain('agent.lastError')
    expect(dashboardSource).toContain('useAgentCountdown')
  })
})
