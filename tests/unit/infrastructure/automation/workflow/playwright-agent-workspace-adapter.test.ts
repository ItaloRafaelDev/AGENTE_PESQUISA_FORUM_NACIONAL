import type { BrowserContext, Page } from 'playwright'
import { describe, expect, it, vi } from 'vitest'
import type { PlaywrightAutomationConfig } from '@/infrastructure/automation/workflow/playwright-automation-config'
import { PlaywrightAgentWorkspaceAdapter } from '@/infrastructure/automation/workflow/playwright-agent-workspace-adapter'

const harness = vi.hoisted(() => ({ createExecution: vi.fn() }))

vi.mock(
  '@/infrastructure/automation/workflow/playwright-continuous-research-execution-adapter',
  () => ({ createPlaywrightContinuousResearchExecutionAdapter: harness.createExecution })
)

const CONFIG: PlaywrightAutomationConfig = {
  queueCheckIntervalMs: 60_000,
  cpiSearchPollingIntervalMs: 250,
  actionTimeoutMs: 10_000,
  readTimeoutMs: 5_000,
  queueFilterSettleDelayMs: 700,
  cpiFrameSearchAttempts: 40,
  deskDataPeopleUrl: 'https://app.deskdata.com.br/pessoas/',
  navigationTimeoutMs: 30_000,
  downloadStartTimeoutMs: 30_000,
  deskDataFormPollingIntervalMs: 250,
  deskDataResultPollingIntervalMs: 500,
  deskDataHistoryNavigationIntervalMs: 500,
  submitSettleDelayMs: 1_000,
  queueReturnDelayMs: 2_000,
  cpiIdentitySearchAttempts: 40,
  cpiAttachmentSearchAttempts: 40,
  cpiResultSearchAttempts: 40,
  cpiResultStabilizationAttempts: 3,
  deskDataFormReadyAttempts: 40,
  deskDataResultSearchAttempts: 40,
  deskDataHistoryNavigationAttempts: 40,
  pdfOutputDirectory: 'E:\\PDF-AGENTE-CPI'
}

function createPage(url: string): Page {
  return { url: () => url } as unknown as Page
}

const cpiPage = createPage(
  'https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx'
)
const deskDataPage = createPage('https://app.deskdata.com.br/pessoas/')

function createHarness(pages: Page[] = [cpiPage, deskDataPage]): {
  adapter: PlaywrightAgentWorkspaceAdapter
  authenticated: { value: boolean }
  ensureStarted: ReturnType<typeof vi.fn>
  applyFilter: ReturnType<typeof vi.fn>
  context: BrowserContext
} {
  const context = { pages: () => pages } as unknown as BrowserContext
  const authenticated = { value: true }
  const ensureStarted = vi.fn(async () => undefined)
  const applyFilter = vi.fn(async () => undefined)

  return {
    adapter: new PlaywrightAgentWorkspaceAdapter(
      { ensureStarted, getContext: () => context },
      { getSnapshot: async () => ({ allAuthenticated: authenticated.value }) },
      { applyCriminalForumFilter: applyFilter },
      CONFIG
    ),
    authenticated,
    ensureStarted,
    applyFilter,
    context
  }
}

describe('PlaywrightAgentWorkspaceAdapter', () => {
  it('inicia o browser e projeta snapshots autenticado e não autenticado', async () => {
    const { adapter, authenticated, ensureStarted } = createHarness()

    await adapter.ensureStarted()
    expect(ensureStarted).toHaveBeenCalledOnce()
    await expect(adapter.areSessionsAuthenticated()).resolves.toBe(true)
    authenticated.value = false
    await expect(adapter.areSessionsAuthenticated()).resolves.toBe(false)
  })

  it.each([
    ['CPI', [deskDataPage], 'A página autenticada de adm.cpicentral.com.br não foi localizada'],
    ['DeskData', [cpiPage], 'A página autenticada de app.deskdata.com.br não foi localizada']
  ])('rejeita quando a página %s não existe', async (_name, pages, message) => {
    const { adapter } = createHarness(pages)
    await expect(adapter.prepareContinuousExecution()).rejects.toThrow(message)
  })

  it('filtra a CPI e cria a única execução contínua com contexto e páginas resolvidos', async () => {
    const { adapter, applyFilter, context } = createHarness()
    const execution = { execute: vi.fn() }
    harness.createExecution.mockReturnValue(execution)

    await expect(adapter.prepareContinuousExecution()).resolves.toBe(execution)
    expect(applyFilter).toHaveBeenCalledWith(cpiPage)
    expect(harness.createExecution).toHaveBeenCalledOnce()
    expect(harness.createExecution).toHaveBeenCalledWith({
      context,
      cpiPage,
      deskDataPage,
      config: CONFIG
    })
  })
})
