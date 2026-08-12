import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainSource = readFileSync('src/main/index.ts', 'utf8')

const runtimeSource = readFileSync('src/main/main-application-runtime.ts', 'utf8')

const viteConfigSource = readFileSync('electron.vite.config.ts', 'utf8')

const productionMainSource = `${mainSource}\n${runtimeSource}`
const oldAutomationImport = ['from ', "'../", 'automation/'].join('')
const shutdownComponents = [
  'AGENT',
  'BROWSER',
  'AGENT_IPC',
  'HISTORY_IPC',
  'HISTORY_REPOSITORY',
  'RUNTIME_REFERENCES'
] as const

describe('composição contínua do processo principal', () => {
  it('injeta a configuração central de plataforma e intervalo da fila', () => {
    expect(runtimeSource).toContain('parseAppConfig()')
    expect(runtimeSource).toContain('config.platform')
    expect(runtimeSource).toContain('config.timing.queueCheckIntervalMs')
  })

  it('mantém o ciclo de vida Electron separado da composição da aplicação', () => {
    expect(mainSource).toContain('new MainApplicationRuntime({')

    expect(mainSource).toContain('mainRuntime.initialize()')

    expect(mainSource).toContain('mainRuntime.shutdown()')

    expect(mainSource).not.toContain('new ContinuousAgentRuntimeService')
  })

  it('delega um shutdown idempotente às seis etapas na ordem segura', () => {
    expect(runtimeSource).toContain("from './lifecycle/application-shutdown'")
    expect(runtimeSource).toContain("from './lifecycle/application-runtime-lifecycle'")
    expect(runtimeSource).toContain('new ApplicationShutdown(')
    expect(runtimeSource).toContain('new ApplicationRuntimeLifecycle(')
    expect(runtimeSource).toMatch(
      /new ApplicationRuntimeLifecycle\(\s*\(\) => this\.initializeResources\(\),\s*\(\) => this\.applicationShutdown\.run\(\)\s*\)/s
    )
    expect(runtimeSource).toMatch(
      /initialize\(\): Promise<void> \{\s*return this\.applicationLifecycle\.initialize\(\)\s*\}/s
    )
    expect(runtimeSource).toContain('private async initializeResources(): Promise<void> {')
    expect(runtimeSource).toMatch(
      /shutdown\(\): Promise<void> \{\s*return this\.applicationLifecycle\.shutdown\(\)\s*\}/s
    )

    const componentPositions = shutdownComponents.map((component) => {
      const declaration = `component: '${component}'`

      expect(runtimeSource.match(new RegExp(declaration, 'g'))).toHaveLength(1)

      return runtimeSource.indexOf(declaration)
    })

    expect(componentPositions).toEqual([...componentPositions].sort((left, right) => left - right))
    expect(runtimeSource).toContain('this.browserService?.shutdown()')
    expect(runtimeSource).toContain('this.disposeAgentIpc = null')
    expect(runtimeSource).toContain('this.disposeHistoryIpc = null')
    expect(runtimeSource).toContain('this.historyRepository = null')
    expect(runtimeSource).toContain('this.agentCoordinator = null')
    expect(runtimeSource).toContain('this.browserService = null')
  })

  it('registra falhas de shutdown sem incluir o valor capturado', () => {
    expect(runtimeSource).toContain('console.error(`Falha no encerramento seguro: ${component}`)')
    expect(runtimeSource).not.toMatch(/console\.error\([^\n]*,\s*(?:error|caught|reason)\b/)
    expect(runtimeSource).not.toMatch(/(?:JSON\.stringify|String)\(\s*(?:error|caught|reason)\s*\)/)
  })

  it('registra falha de inicialização com mensagem fixa sem o erro capturado', () => {
    expect(mainSource).toContain("console.error('Falha ao inicializar o Agente CPI.')")
    expect(mainSource).not.toMatch(
      /\.catch\(\(error[^)]*\) => \{[\s\S]*?console\.error\([^\n]*,\s*error\b/
    )
  })

  it('solicita quit no catch de inicialização somente antes do shutdown começar', () => {
    expect(mainSource).toMatch(
      /\.catch\(\(\) => \{\s*console\.error\('Falha ao inicializar o Agente CPI\.'\)\s*if \(!isQuitting\) \{\s*app\.quit\(\)\s*\}\s*\}\)/s
    )
  })

  it('retoma app.quit em finally depois do shutdown com guard reentrante', () => {
    expect(mainSource).toContain('if (isQuitting) {')
    expect(mainSource).toContain('event.preventDefault()')
    expect(mainSource).toContain('isQuitting = true')
    expect(mainSource).toMatch(
      /void mainRuntime\.shutdown\(\)\.finally\(\(\) => \{\s*app\.quit\(\)\s*\}\)/s
    )
  })

  it('não cria nem carrega a janela quando quit começa durante o bootstrap', () => {
    expect(mainSource).toMatch(
      /await mainRuntime\.initialize\(\)\s*if \(isQuitting\) \{\s*return\s*\}\s*createWindow\(\)/s
    )
  })

  it('compõe autorização IPC e eventos a partir da mesma janela principal', () => {
    expect(mainSource.match(/let mainWindow: BrowserWindow \| null = null/g)).toHaveLength(1)
    expect(mainSource).toContain('const getMainWindow = (): BrowserWindow | null => mainWindow')
    expect(mainSource).toContain('new RendererIpcAuthorizer(getMainWindow, approvedRendererUrl)')
    expect(mainSource).toContain('new SecureIpcMainRegistrar(ipcMain, rendererIpcAuthorizer)')
    expect(mainSource).toContain('new MainWindowEventSender(getMainWindow)')
    expect(mainSource).toMatch(
      /new MainApplicationRuntime\(\{\s*ipcMain: secureIpcMain,\s*eventSender\s*\}\)/s
    )
    expect(mainSource).toContain('if (!mainWindow || mainWindow.isDestroyed())')

    expect(runtimeSource).toContain(
      'constructor(private readonly electronBoundary: MainApplicationRuntimeElectronBoundary) {}'
    )
    expect(runtimeSource).not.toContain('BrowserWindow.getAllWindows().forEach')
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
    expect(mainSource).toMatch(/sandbox:\s*true/)

    expect(mainSource).toMatch(/contextIsolation:\s*true/)

    expect(mainSource).toMatch(/nodeIntegration:\s*false/)
  })

  it('instala as proteções de navegação antes de carregar o renderer', () => {
    const browserWindowPosition = mainSource.indexOf('const createdWindow = new BrowserWindow(')
    const securityInstallationPosition = mainSource.indexOf(
      'installWindowSecurity(createdWindow, navigationSecurityPolicy, shell)'
    )
    const rendererLoadingPosition = mainSource.indexOf('createdWindow.loadURL(')

    expect(mainSource).toContain("from './security/install-window-security'")
    expect(mainSource).toContain("from './security/navigation-security-policy'")
    expect(mainSource).toContain(
      'const navigationSecurityPolicy = new NavigationSecurityPolicy(approvedRendererUrl)'
    )
    expect(securityInstallationPosition).toBeGreaterThan(browserWindowPosition)
    expect(securityInstallationPosition).toBeLessThan(rendererLoadingPosition)
    expect(mainSource).not.toContain('createdWindow.webContents.setWindowOpenHandler')
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

    expect(runtimeSource).toContain('this.browserService?.shutdown()')

    expect(runtimeSource).toContain('historyRepository?.close()')
  })
})
