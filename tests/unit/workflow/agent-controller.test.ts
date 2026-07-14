import { describe, expect, it } from 'vitest'
import { AgentController } from '@/automation/workflow/agent-controller'

describe('AgentController', () => {
  it('deve iniciar parado e entrar em inicialização', () => {
    const controller = new AgentController()

    expect(controller.getState()).toBe('PARADO')
    expect(controller.start()).toBe('INICIALIZANDO')
  })

  it('deve executar o fluxo de login e aguardar pesquisas', () => {
    const controller = new AgentController()

    controller.start()
    controller.markWaitingForLogin()
    controller.markReady()
    controller.beginWaitingForResearch()

    expect(controller.getState()).toBe('AGUARDANDO_NOVA_PESQUISA')
  })

  it('deve iniciar o processamento de uma pesquisa', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginWaitingForResearch()
    controller.beginProcessing()

    expect(controller.getState()).toBe('PROCESSANDO')
  })

  it('deve pausar imediatamente quando estiver fora de uma operação crítica', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginProcessing()

    expect(controller.requestPause()).toBe('PAUSADO')
    expect(controller.getSnapshot().pauseRequested).toBe(true)
  })

  it('deve aguardar o fim de uma operação crítica antes de pausar', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginProcessing()
    controller.enterAtomicSection()

    expect(controller.requestPause()).toBe('PAUSANDO')
    expect(controller.getState()).toBe('PAUSANDO')

    expect(controller.leaveAtomicSection()).toBe('PAUSADO')
  })

  it('deve continuar do estado anterior após uma pausa segura', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginProcessing()
    controller.requestPause()

    expect(controller.resume()).toBe('PROCESSANDO')
    expect(controller.getSnapshot().pauseRequested).toBe(false)
  })

  it('deve pausar por segurança ao atingir o limite de erros', () => {
    const controller = new AgentController({
      maxConsecutiveErrors: 2
    })

    controller.start()
    controller.markReady()
    controller.beginProcessing()

    controller.recordFailure()
    expect(controller.getState()).toBe('PROCESSANDO')

    controller.recordFailure()

    expect(controller.getState()).toBe('PAUSADO_POR_SEGURANCA')
    expect(controller.getSnapshot().circuitOpen).toBe(true)
    expect(controller.getSnapshot().consecutiveErrors).toBe(2)
  })

  it('deve zerar os erros consecutivos após uma operação bem-sucedida', () => {
    const controller = new AgentController()

    controller.recordFailure()
    controller.recordFailure()
    controller.recordSuccess()

    expect(controller.getSnapshot().consecutiveErrors).toBe(0)
    expect(controller.getSnapshot().circuitOpen).toBe(false)
  })

  it('deve iniciar com o modo seguro ativado por padrão', () => {
    const controller = new AgentController()

    expect(controller.getSnapshot().safeMode).toBe(true)
  })
})

describe('AgentController.stopSafely', () => {
  it('deve encerrar com segurança e voltar ao estado PARADO', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginProcessing()

    expect(controller.stopSafely()).toBe('PARADO')
    expect(controller.getState()).toBe('PARADO')
  })

  it('deve permanecer PARADO quando já estiver encerrado', () => {
    const controller = new AgentController()

    expect(controller.stopSafely()).toBe('PARADO')
  })
})

describe('AgentController.markTemporaryError', () => {
  it('deve entrar em erro temporário durante a espera da fila', () => {
    const controller = new AgentController()

    controller.start()
    controller.markReady()
    controller.beginWaitingForResearch()

    expect(controller.markTemporaryError()).toBe('ERRO_TEMPORARIO')
    expect(controller.getState()).toBe('ERRO_TEMPORARIO')
  })
})
