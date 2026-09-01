import { win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { configureApplicationPaths } from '@/main/startup/configure-application-paths'

const smokeFilesystem = (): {
  mkdirSync: ReturnType<typeof vi.fn>
  realpathSync: ReturnType<typeof vi.fn>
  lstatSync: ReturnType<typeof vi.fn>
  readdirSync: ReturnType<typeof vi.fn>
} => ({
  mkdirSync: vi.fn(),
  realpathSync: vi.fn((path: string) => win32.resolve(path)),
  lstatSync: vi.fn(() => ({
    isDirectory: () => true,
    isSymbolicLink: () => false
  })),
  readdirSync: vi.fn(() => [])
})

describe('configureApplicationPaths', () => {
  it('preserva o userData legado de produção sem substituir appData', () => {
    const getPath = vi.fn(() => 'C:\\Users\\Operator\\AppData\\Roaming')
    const setPath = vi.fn()
    const mkdirSync = vi.fn()

    const result = configureApplicationPaths(
      { getPath, setPath },
      { mode: 'production' },
      { ...smokeFilesystem(), mkdirSync }
    )

    expect(mkdirSync).toHaveBeenCalledExactlyOnceWith(
      'C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi',
      { recursive: true }
    )
    expect(setPath).toHaveBeenCalledExactlyOnceWith(
      'userData',
      'C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi'
    )
    expect(setPath).not.toHaveBeenCalledWith('appData', expect.anything())
    expect(result).toEqual({
      appDataDirectory: 'C:\\Users\\Operator\\AppData\\Roaming',
      userDataDirectory: 'C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi'
    })
  })

  it('configura appData, userData e PDF em descendentes canônicos da raiz smoke', () => {
    const smokeRoot = 'C:\\Temp\\agente-cpi-smoke-123'
    const operations: string[] = []
    const setPath = vi.fn((name: string, path: string) => {
      operations.push(`setPath:${name}:${path}`)
    })
    const filesystem = smokeFilesystem()
    filesystem.mkdirSync.mockImplementation((path: string) => {
      operations.push(`mkdirSync:${path}`)
    })

    const result = configureApplicationPaths(
      {
        getPath: vi.fn(() => 'C:\\Users\\Operator\\AppData\\Roaming'),
        setPath
      },
      { mode: 'smoke', smokeRoot },
      filesystem,
      { temporaryDirectory: 'C:\\Temp', workspaceDirectory: 'D:\\workspace' }
    )

    expect(filesystem.mkdirSync.mock.calls).toEqual([
      ['C:\\Temp\\agente-cpi-smoke-123\\app-data', { recursive: true }],
      ['C:\\Temp\\agente-cpi-smoke-123\\user-data', { recursive: true }],
      ['C:\\Temp\\agente-cpi-smoke-123\\pdf-output', { recursive: true }]
    ])
    expect(setPath.mock.calls).toEqual([
      ['appData', 'C:\\Temp\\agente-cpi-smoke-123\\app-data'],
      ['userData', 'C:\\Temp\\agente-cpi-smoke-123\\user-data']
    ])
    expect(operations).toEqual([
      'mkdirSync:C:\\Temp\\agente-cpi-smoke-123\\app-data',
      'setPath:appData:C:\\Temp\\agente-cpi-smoke-123\\app-data',
      'mkdirSync:C:\\Temp\\agente-cpi-smoke-123\\user-data',
      'setPath:userData:C:\\Temp\\agente-cpi-smoke-123\\user-data',
      'mkdirSync:C:\\Temp\\agente-cpi-smoke-123\\pdf-output'
    ])
    expect(result).toEqual({
      appDataDirectory: 'C:\\Temp\\agente-cpi-smoke-123\\app-data',
      userDataDirectory: 'C:\\Temp\\agente-cpi-smoke-123\\user-data',
      preferredPdfDirectory: 'C:\\Temp\\agente-cpi-smoke-123\\pdf-output',
      smokeRoot
    })

    for (const [createdPath] of filesystem.mkdirSync.mock.calls) {
      const relativePath = win32.relative(smokeRoot, createdPath)

      expect(relativePath).not.toBe('')
      expect(relativePath).not.toBe('..')
      expect(relativePath.startsWith('..\\')).toBe(false)
      expect(win32.isAbsolute(relativePath)).toBe(false)
    }
  })

  it('reaudita a raiz smoke antes de qualquer escrita e rejeita troca por reparse point', () => {
    const filesystem = smokeFilesystem()
    vi.mocked(filesystem.lstatSync).mockImplementation((path: string) => ({
      isDirectory: () => true,
      isSymbolicLink: () => path.endsWith('agente-cpi-smoke-123')
    }))
    const setPath = vi.fn()

    expect(() =>
      configureApplicationPaths(
        { getPath: vi.fn(), setPath },
        { mode: 'smoke', smokeRoot: 'C:\\Temp\\agente-cpi-smoke-123' },
        filesystem,
        { temporaryDirectory: 'C:\\Temp', workspaceDirectory: 'D:\\workspace' }
      )
    ).toThrow('A raiz do smoke test não pode ser um reparse point')
    expect(filesystem.mkdirSync).not.toHaveBeenCalled()
    expect(setPath).not.toHaveBeenCalled()
  })

  it('não escreve quando a auditoria do conteúdo da raiz smoke falha', () => {
    const filesystem = smokeFilesystem()
    vi.mocked(filesystem.readdirSync).mockImplementation(() => {
      throw new Error('access denied')
    })
    const setPath = vi.fn()

    expect(() =>
      configureApplicationPaths(
        { getPath: vi.fn(), setPath },
        { mode: 'smoke', smokeRoot: 'C:\\Temp\\agente-cpi-smoke-123' },
        filesystem,
        { temporaryDirectory: 'C:\\Temp', workspaceDirectory: 'D:\\workspace' }
      )
    ).toThrow('Não foi possível validar a raiz do smoke test')
    expect(filesystem.mkdirSync).not.toHaveBeenCalled()
    expect(setPath).not.toHaveBeenCalled()
  })

  it('rejeita uma raiz smoke sobreposta ao appData de produção antes de escrever', () => {
    const filesystem = smokeFilesystem()
    const setPath = vi.fn()

    expect(() =>
      configureApplicationPaths(
        { getPath: vi.fn(() => 'C:\\AppData'), setPath },
        { mode: 'smoke', smokeRoot: 'C:\\AppData\\agente-cpi-smoke-123' },
        filesystem,
        { temporaryDirectory: 'C:\\AppData', workspaceDirectory: 'D:\\workspace' }
      )
    ).toThrow('A raiz do smoke test não pode alcançar dados de produção')
    expect(filesystem.mkdirSync).not.toHaveBeenCalled()
    expect(setPath).not.toHaveBeenCalled()
  })
})
