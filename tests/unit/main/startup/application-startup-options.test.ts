import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  parseApplicationStartupOptions,
  type SmokeRootFilesystemBoundary
} from '@/main/startup/application-startup-options'

const safeFilesystem = (): SmokeRootFilesystemBoundary => ({
  realpathSync: vi.fn((path: string) => win32.resolve(path)),
  lstatSync: vi.fn(() => ({
    isDirectory: () => true,
    isSymbolicLink: () => false
  })),
  readdirSync: vi.fn(() => [])
})

describe('parseApplicationStartupOptions', () => {
  it('mantém o modo de produção quando não há argumentos de smoke test', () => {
    expect(parseApplicationStartupOptions(['--inspect=9229', '--disable-gpu'], 'C:\\Temp')).toEqual(
      {
        mode: 'production'
      }
    )
  })

  it('aceita um único par smoke e ignora switches alheios do Electron e Playwright', () => {
    expect(
      parseApplicationStartupOptions(
        [
          '--inspect=9229',
          '--smoke-test',
          '--disable-gpu',
          '--smoke-root=C:\\Temp\\agente-cpi-smoke-123',
          '--remote-debugging-port=0'
        ],
        'C:\\Temp',
        safeFilesystem(),
        'D:\\workspace'
      )
    ).toEqual({ mode: 'smoke', smokeRoot: 'C:\\Temp\\agente-cpi-smoke-123' })
  })

  it.each([
    {
      name: 'modo sem raiz',
      args: ['--smoke-test']
    },
    {
      name: 'raiz sem modo',
      args: ['--smoke-root=C:\\Temp\\agente-cpi-smoke-123']
    },
    {
      name: 'modo duplicado',
      args: ['--smoke-test', '--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123']
    },
    {
      name: 'raiz duplicada',
      args: [
        '--smoke-test',
        '--smoke-root=C:\\Temp\\agente-cpi-smoke-123',
        '--smoke-root=C:\\Temp\\agente-cpi-smoke-456'
      ]
    },
    {
      name: 'raiz relativa',
      args: ['--smoke-test', '--smoke-root=agente-cpi-smoke-123']
    },
    {
      name: 'raiz do sistema de arquivos',
      args: ['--smoke-test', '--smoke-root=C:\\']
    },
    {
      name: 'raiz fora do diretório temporário',
      args: ['--smoke-test', '--smoke-root=C:\\Users\\Operator\\agente-cpi-smoke-123']
    },
    {
      name: 'o próprio diretório temporário',
      args: ['--smoke-test', '--smoke-root=C:\\Temp']
    },
    {
      name: 'basename sem o prefixo canônico',
      args: ['--smoke-test', '--smoke-root=C:\\Temp\\smoke-123']
    }
  ])('rejeita $name', ({ args }) => {
    expect(() =>
      parseApplicationStartupOptions(args, 'C:\\Temp', safeFilesystem(), 'D:\\workspace')
    ).toThrow()
  })

  it('rejeita uma raiz cujo caminho canônico escapa do diretório temporário', () => {
    const filesystem = safeFilesystem()
    vi.mocked(filesystem.realpathSync).mockImplementation((path: string) =>
      path.endsWith('agente-cpi-smoke-123')
        ? 'C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi'
        : win32.resolve(path)
    )

    expect(() =>
      parseApplicationStartupOptions(
        ['--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123'],
        'C:\\Temp',
        filesystem,
        'D:\\workspace'
      )
    ).toThrow('A raiz canônica do smoke test deve estar abaixo do diretório temporário')
  })

  it('rejeita uma raiz não vazia ou sobreposta ao workspace', () => {
    const nonEmptyFilesystem = safeFilesystem()
    vi.mocked(nonEmptyFilesystem.readdirSync).mockReturnValue(['existing-data'])

    expect(() =>
      parseApplicationStartupOptions(
        ['--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123'],
        'C:\\Temp',
        nonEmptyFilesystem,
        'D:\\workspace'
      )
    ).toThrow('A raiz do smoke test deve estar vazia')

    expect(() =>
      parseApplicationStartupOptions(
        ['--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123'],
        'C:\\Temp',
        safeFilesystem(),
        'C:\\Temp\\agente-cpi-smoke-123'
      )
    ).toThrow('A raiz do smoke test não pode alcançar o workspace')
  })

  it('rejeita uma raiz canônica sobreposta a um diretório protegido de produção', () => {
    expect(() =>
      parseApplicationStartupOptions(
        [
          '--smoke-test',
          '--smoke-root=C:\\Users\\Operator\\AppData\\Roaming\\agente-cpi-smoke-123'
        ],
        'C:\\Users\\Operator\\AppData\\Roaming',
        safeFilesystem(),
        'D:\\workspace',
        ['C:\\Users\\Operator\\AppData\\Roaming']
      )
    ).toThrow('A raiz do smoke test não pode alcançar dados de produção')
  })

  it('falha de forma determinística quando a resolução canônica do filesystem falha', () => {
    const filesystem = safeFilesystem()
    vi.mocked(filesystem.realpathSync).mockImplementation(() => {
      throw new Error('filesystem unavailable')
    })

    expect(() =>
      parseApplicationStartupOptions(
        ['--smoke-test', '--smoke-root=C:\\Temp\\agente-cpi-smoke-123'],
        'C:\\Temp',
        filesystem,
        'D:\\workspace'
      )
    ).toThrow('Não foi possível validar a raiz do smoke test')
  })

  it.runIf(process.platform === 'win32')('aceita uma raiz real vazia criada por mkdtemp', () => {
    const smokeRoot = mkdtempSync(join(tmpdir(), 'agente-cpi-smoke-'))

    try {
      expect(
        parseApplicationStartupOptions(['--smoke-test', `--smoke-root=${smokeRoot}`], tmpdir())
      ).toEqual({ mode: 'smoke', smokeRoot })
    } finally {
      rmSync(smokeRoot, { recursive: true, force: true })
    }
  })

  it.runIf(process.platform === 'win32')(
    'rejeita uma junction real usada como raiz do smoke',
    () => {
      const temporaryParent = mkdtempSync(join(tmpdir(), 'agente-cpi-startup-test-'))
      const junctionTarget = join(temporaryParent, 'junction-target')
      const junctionRoot = join(temporaryParent, 'agente-cpi-smoke-junction')

      mkdirSync(junctionTarget)
      symlinkSync(junctionTarget, junctionRoot, 'junction')

      try {
        expect(lstatSync(junctionRoot).isSymbolicLink()).toBe(true)
        expect(() =>
          parseApplicationStartupOptions(
            ['--smoke-test', `--smoke-root=${junctionRoot}`],
            temporaryParent
          )
        ).toThrow('A raiz do smoke test não pode ser um reparse point')
      } finally {
        unlinkSync(junctionRoot)
        rmSync(temporaryParent, { recursive: true, force: true })
      }
    }
  )
})
