import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/preload/index.ts', 'utf8')

describe('preload do agente contínuo', () => {
  it('expõe comandos e eventos do runtime', () => {
    expect(source).toContain('AGENT_RUNTIME_IPC_CHANNELS.getState')

    expect(source).toContain('AGENT_RUNTIME_IPC_CHANNELS.loginCompleted')

    expect(source).toContain('AGENT_RUNTIME_IPC_CHANNELS.stateChanged')
  })

  it('expõe histórico e PDF', () => {
    expect(source).toContain('HISTORY_IPC_CHANNELS.list')

    expect(source).toContain('HISTORY_IPC_CHANNELS.clear')

    expect(source).toContain('PDF_IPC_CHANNELS.open')

    expect(source).toContain('PDF_IPC_CHANNELS.reveal')
  })

  it('remove listeners ao cancelar inscrição', () => {
    expect(source).toContain('ipcRenderer.removeListener')
  })

  it('não expõe execução arbitrária', () => {
    expect(source).not.toContain('child_process')

    expect(source).not.toMatch(/\bexec\s*\(/)

    expect(source).not.toMatch(/\bspawn\s*\(/)
  })
})
