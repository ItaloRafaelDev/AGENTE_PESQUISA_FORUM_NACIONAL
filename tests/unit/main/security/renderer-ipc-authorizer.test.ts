import { describe, expect, it } from 'vitest'
import {
  RendererIpcAuthorizer,
  UNAUTHORIZED_IPC_MESSAGE
} from '@/main/security/renderer-ipc-authorizer'

interface FrameFake {
  readonly url: string
}

interface WebContentsFake {
  readonly mainFrame: FrameFake
}

interface WindowFake {
  readonly webContents: WebContentsFake
  isDestroyed(): boolean
}

interface InvokeEventFake {
  readonly sender: WebContentsFake
  readonly senderFrame: FrameFake | null
}

const approvedRendererUrl = new URL('http://127.0.0.1:5173/')

function createAuthorizedFixture(): { mainWindow: WindowFake; event: InvokeEventFake } {
  const mainFrame = { url: approvedRendererUrl.href }
  const webContents = { mainFrame }

  return {
    mainWindow: {
      webContents,
      isDestroyed: () => false
    },
    event: {
      sender: webContents,
      senderFrame: mainFrame
    }
  }
}

function expectUnauthorized(call: () => void, privateUrl: string): void {
  try {
    call()
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(UNAUTHORIZED_IPC_MESSAGE)
    expect((error as Error).message).not.toContain(privateUrl)
    return
  }

  throw new Error('A origem IPC não autorizada deveria ser rejeitada.')
}

describe('RendererIpcAuthorizer', () => {
  it('autoriza apenas o evento da mainFrame da janela principal na URL aprovada', () => {
    const { mainWindow, event } = createAuthorizedFixture()
    const authorizer = new RendererIpcAuthorizer(() => mainWindow, approvedRendererUrl)

    expect(() => authorizer.assertAuthorized(event)).not.toThrow()
  })

  it.each([
    {
      name: 'missing window',
      configure: (fixture: ReturnType<typeof createAuthorizedFixture>) => ({
        getMainWindow: () => null,
        event: fixture.event,
        privateUrl: 'http://127.0.0.1:5173/'
      })
    },
    {
      name: 'destroyed window',
      configure: (fixture: ReturnType<typeof createAuthorizedFixture>) => ({
        getMainWindow: () => ({ ...fixture.mainWindow, isDestroyed: () => true }),
        event: fixture.event,
        privateUrl: 'http://127.0.0.1:5173/'
      })
    },
    {
      name: 'different sender webContents',
      configure: (fixture: ReturnType<typeof createAuthorizedFixture>) => ({
        getMainWindow: () => fixture.mainWindow,
        event: {
          ...fixture.event,
          sender: { mainFrame: fixture.event.senderFrame as FrameFake }
        },
        privateUrl: 'http://127.0.0.1:5173/'
      })
    },
    {
      name: 'missing senderFrame',
      configure: (fixture: ReturnType<typeof createAuthorizedFixture>) => ({
        getMainWindow: () => fixture.mainWindow,
        event: { ...fixture.event, senderFrame: null },
        privateUrl: 'http://127.0.0.1:5173/'
      })
    },
    {
      name: 'subframe instead of mainFrame',
      configure: (fixture: ReturnType<typeof createAuthorizedFixture>) => ({
        getMainWindow: () => fixture.mainWindow,
        event: {
          ...fixture.event,
          senderFrame: { url: approvedRendererUrl.href }
        },
        privateUrl: 'http://127.0.0.1:5173/'
      })
    },
    {
      name: 'different renderer URL',
      configure: () => {
        const privateUrl = 'file:///C:/private/renderer.html'
        const privateFrame = { url: privateUrl }
        const webContents = { mainFrame: privateFrame }

        return {
          getMainWindow: () => ({ webContents, isDestroyed: () => false }),
          event: { sender: webContents, senderFrame: privateFrame },
          privateUrl
        }
      }
    },
    {
      name: 'malformed renderer URL',
      configure: () => {
        const privateUrl = 'not a renderer url'
        const malformedFrame = { url: privateUrl }
        const webContents = { mainFrame: malformedFrame }

        return {
          getMainWindow: () => ({ webContents, isDestroyed: () => false }),
          event: { sender: webContents, senderFrame: malformedFrame },
          privateUrl
        }
      }
    }
  ])('rejeita $name sem expor a URL privada', ({ configure }) => {
    const fixture = createAuthorizedFixture()
    const { getMainWindow, event, privateUrl } = configure(fixture)
    const authorizer = new RendererIpcAuthorizer(getMainWindow, approvedRendererUrl)

    expectUnauthorized(() => authorizer.assertAuthorized(event), privateUrl)
  })
})
