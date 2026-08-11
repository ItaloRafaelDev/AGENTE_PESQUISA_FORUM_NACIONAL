import type { ContinuousAgentCoordinator } from '../../application/agent/continuous-agent-coordinator'
import type { AgentPublicState } from '../../shared/types/agent-runtime-api'
import type { ContinuousAgentControlService } from '../ipc/register-continuous-agent-ipc-handlers'
import { toAgentPublicState } from '../mappers/agent-public-state-ipc-mapper'

export class ContinuousAgentIpcAdapter implements ContinuousAgentControlService {
  constructor(private readonly coordinator: ContinuousAgentCoordinator) {}

  getSnapshot(): AgentPublicState {
    return toAgentPublicState(this.coordinator.getSnapshot())
  }

  subscribe(listener: (state: AgentPublicState) => void): () => void {
    return this.coordinator.subscribe((state) => {
      listener(toAgentPublicState(state))
    })
  }

  async start(): Promise<AgentPublicState> {
    return toAgentPublicState(await this.coordinator.start())
  }

  async pause(): Promise<AgentPublicState> {
    return toAgentPublicState(await this.coordinator.pause())
  }

  async resume(): Promise<AgentPublicState> {
    return toAgentPublicState(await this.coordinator.resume())
  }

  async stop(): Promise<AgentPublicState> {
    return toAgentPublicState(await this.coordinator.stop())
  }

  async loginCompleted(): Promise<AgentPublicState> {
    return toAgentPublicState(await this.coordinator.loginCompleted())
  }
}
