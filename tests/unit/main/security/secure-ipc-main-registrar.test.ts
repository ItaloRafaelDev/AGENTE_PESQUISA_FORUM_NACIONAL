import { describe, expect, it } from 'vitest'
import { SecureIpcMainRegistrar } from '@/main/security/secure-ipc-main-registrar'

type RegisteredHandler = (event: unknown, ...arguments_: unknown[]) => unknown

function createIpcMainFake(): {
  handlers: Map<string, RegisteredHandler>
  removedChannels: string[]
  ipcMain: {
    handle(channel: string, listener: RegisteredHandler): void
    removeHandler(channel: string): void
  }
} {
  const handlers = new Map<string, RegisteredHandler>()
  const removedChannels: string[] = []

  return {
    handlers,
    removedChannels,
    ipcMain: {
      handle(channel, listener) {
        handlers.set(channel, listener)
      },
      removeHandler(channel) {
        removedChannels.push(channel)
      }
    }
  }
}

function getHandler(handlers: Map<string, RegisteredHandler>, channel: string): RegisteredHandler {
  const handler = handlers.get(channel)

  if (!handler) {
    throw new Error(`Handler não registrado para ${channel}.`)
  }

  return handler
}

describe('SecureIpcMainRegistrar', () => {
  it('registra um wrapper para o canal solicitado', () => {
    const { handlers, ipcMain } = createIpcMainFake()
    const authorizer = { assertAuthorized: () => undefined }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', () => 'pong')

    expect(handlers.size).toBe(1)
    expect(getHandler(handlers, 'agent:ping')).toEqual(expect.any(Function))
  })

  it('autoriza o evento antes de executar o listener', () => {
    const { handlers, ipcMain } = createIpcMainFake()
    const calls: string[] = []
    const authorizer = {
      assertAuthorized: (event: unknown) => {
        calls.push(`authorize:${String(event)}`)
      }
    }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', (event) => {
      calls.push(`listener:${String(event)}`)
      return 'pong'
    })

    expect(getHandler(handlers, 'agent:ping')('event')).toBe('pong')
    expect(calls).toEqual(['authorize:event', 'listener:event'])
  })

  it('não executa o listener quando a origem não é autorizada', () => {
    const { handlers, ipcMain } = createIpcMainFake()
    let listenerCalls = 0
    const authorizationError = new Error('Origem IPC não autorizada.')
    const authorizer = {
      assertAuthorized: () => {
        throw authorizationError
      }
    }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', () => {
      listenerCalls += 1
    })

    expect(() => getHandler(handlers, 'agent:ping')({})).toThrow(authorizationError)
    expect(listenerCalls).toBe(0)
  })

  it('preserva o resultado síncrono do listener', () => {
    const { handlers, ipcMain } = createIpcMainFake()
    const authorizer = { assertAuthorized: () => undefined }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', (_event, value) => ({ echoed: value }))

    expect(getHandler(handlers, 'agent:ping')({}, 'result')).toEqual({ echoed: 'result' })
  })

  it('preserva o resultado assíncrono do listener', async () => {
    const { handlers, ipcMain } = createIpcMainFake()
    const authorizer = { assertAuthorized: () => undefined }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', async (_event, value) => `echoed:${String(value)}`)

    await expect(getHandler(handlers, 'agent:ping')({}, 'result')).resolves.toBe('echoed:result')
  })

  it('mantém o erro do serviço após a autorização', () => {
    const { handlers, ipcMain } = createIpcMainFake()
    const serviceError = new Error('Falha do serviço.')
    const authorizer = { assertAuthorized: () => undefined }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.handle('agent:ping', () => {
      throw serviceError
    })

    expect(() => getHandler(handlers, 'agent:ping')({})).toThrow(serviceError)
  })

  it('remove o handler do canal exato', () => {
    const { ipcMain, removedChannels } = createIpcMainFake()
    const authorizer = { assertAuthorized: () => undefined }
    const registrar = new SecureIpcMainRegistrar(ipcMain, authorizer)

    registrar.removeHandler('agent:ping')

    expect(removedChannels).toEqual(['agent:ping'])
  })
})
