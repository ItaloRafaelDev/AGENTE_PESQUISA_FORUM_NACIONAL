import { describe, expect, it } from 'vitest'
import {
  MainWindowEventSender,
  type MainWindowEventTarget
} from '@/main/security/main-window-event-sender'

function createWindowTarget(isDestroyed: boolean): {
  target: MainWindowEventTarget
  events: Array<{ channel: string; payload: unknown }>
} {
  const events: Array<{ channel: string; payload: unknown }> = []

  return {
    target: {
      webContents: {
        send(channel, payload): void {
          events.push({ channel, payload })
        }
      },
      isDestroyed(): boolean {
        return isDestroyed
      }
    },
    events
  }
}

describe('MainWindowEventSender', () => {
  it('envia exatamente um evento para a janela principal ativa', () => {
    const { target, events } = createWindowTarget(false)
    const sender = new MainWindowEventSender(() => target)
    const payload = { status: 'OCIOSO' }

    sender.send('agent:state-changed', payload)

    expect(events).toEqual([
      {
        channel: 'agent:state-changed',
        payload
      }
    ])
  })

  it('não envia eventos quando a janela principal está ausente ou destruída', () => {
    const { target: destroyedWindow, events } = createWindowTarget(true)
    let mainWindow: MainWindowEventTarget | null = null
    const sender = new MainWindowEventSender(() => mainWindow)

    sender.send('history:cleared', undefined)
    mainWindow = destroyedWindow
    sender.send('history:cleared', undefined)

    expect(events).toEqual([])
  })

  it('consulta o provider a cada envio e usa somente a janela principal atual', () => {
    const firstWindow = createWindowTarget(false)
    const secondWindow = createWindowTarget(false)
    let mainWindow: MainWindowEventTarget | null = firstWindow.target
    const sender = new MainWindowEventSender(() => mainWindow)

    sender.send('history:record-created', { id: 'history-1' })
    mainWindow = secondWindow.target
    sender.send('history:record-updated', { id: 'history-1' })

    expect(firstWindow.events).toEqual([
      {
        channel: 'history:record-created',
        payload: { id: 'history-1' }
      }
    ])
    expect(secondWindow.events).toEqual([
      {
        channel: 'history:record-updated',
        payload: { id: 'history-1' }
      }
    ])
  })
})
