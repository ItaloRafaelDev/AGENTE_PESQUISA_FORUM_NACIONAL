import { describe, expect, it } from 'vitest'
import { PauseController } from '@/automation/workflow/pause-controller'

describe('PauseController', () => {
  it('deve pausar imediatamente quando não estiver em operação crítica', () => {
    const controller = new PauseController()

    controller.requestPause()

    expect(controller.isPauseRequested()).toBe(true)
    expect(controller.shouldPauseAtCheckpoint()).toBe(true)
  })

  it('não deve interromper uma operação crítica', () => {
    const controller = new PauseController()

    controller.enterAtomicSection()
    controller.requestPause()

    expect(controller.shouldPauseAtCheckpoint()).toBe(false)

    controller.leaveAtomicSection()

    expect(controller.shouldPauseAtCheckpoint()).toBe(true)
  })

  it('deve respeitar operações críticas aninhadas', () => {
    const controller = new PauseController()

    controller.enterAtomicSection()
    controller.enterAtomicSection()
    controller.requestPause()

    controller.leaveAtomicSection()
    expect(controller.shouldPauseAtCheckpoint()).toBe(false)

    controller.leaveAtomicSection()
    expect(controller.shouldPauseAtCheckpoint()).toBe(true)
  })

  it('deve limpar a solicitação de pausa ao continuar', () => {
    const controller = new PauseController()

    controller.requestPause()
    controller.resume()

    expect(controller.isPauseRequested()).toBe(false)
    expect(controller.shouldPauseAtCheckpoint()).toBe(false)
  })
})
