import type { ContinuousResearchStage } from '../agent/continuous-research-stage'
import { ApplicationError } from '../errors/application-error'
import type {
  PrepareResearchDependencies,
  PreparedResearch,
  ResearchIdentity
} from '../ports/research-preparation-ports'
import { classifyDeskDataSpheres } from '../../domain/research/classify-deskdata-spheres'
import {
  mapDeskDataResultToResearchClassification,
  type ResearchPreparationClassification
} from './research-preparation-model'
import {
  assertResearchAttachmentConfirmed,
  assertResearchReportHasContent,
  assertResearchRequiredFieldsConfirmed
} from './validate-prepared-research-candidate'

export type { PreparedResearch, ResearchIdentity }

export class PrepareResearch {
  constructor(private readonly dependencies: PrepareResearchDependencies) {}

  async execute(identity: ResearchIdentity): Promise<PreparedResearch> {
    await this.callPort('PREPARING_DESKDATA', 'Não foi possível preencher o CPF na DeskData.', () =>
      this.dependencies.deskData.fillCpf(identity.cpf)
    )

    const datasets = await this.callPort(
      'PREPARING_DESKDATA',
      'Não foi possível aplicar os conjuntos aprovados da DeskData.',
      () => this.dependencies.deskData.applyApprovedDatasets()
    )

    await this.callPort(
      'SUBMITTING_DESKDATA',
      'Não foi possível enviar a pesquisa para a DeskData.',
      () => this.dependencies.deskData.submitOnce()
    )

    await this.callPort(
      'WAITING_DESKDATA_RESULT',
      'Não foi possível aguardar o resultado da DeskData.',
      () => this.dependencies.deskData.waitUntilResultReady()
    )

    const report = await this.callPort(
      'DOWNLOADING_PDF',
      'Não foi possível gerar o relatório da DeskData.',
      () => this.dependencies.report.create()
    )

    assertResearchReportHasContent(report.sizeBytes, 'O relatório da DeskData está vazio.')

    const processes = await this.callPort(
      'CLASSIFYING_RESULT',
      'Não foi possível interpretar o relatório da DeskData.',
      () => this.dependencies.report.readProcesses(report.reference)
    )

    const evidence = classifyDeskDataSpheres(processes)
    const classification: ResearchPreparationClassification = {
      classification: mapDeskDataResultToResearchClassification(evidence.result),
      evidence
    }

    const cpiResult = await this.callPort(
      'PREPARING_CPI_RESULT',
      'Não foi possível preparar o resultado na CPI.',
      () => this.dependencies.cpi.prepareAndAttach(classification.classification, report.reference)
    )

    assertResearchAttachmentConfirmed(
      cpiResult.attached,
      'O anexo do relatório não foi confirmado pela CPI.'
    )
    assertResearchRequiredFieldsConfirmed(
      cpiResult.requiredFieldsConfirmed,
      'Os campos obrigatórios do resultado da CPI não foram confirmados.'
    )

    return {
      maskedCpf: identity.maskedCpf,
      selectedDatasetCount: datasets.selectedCount,
      classification,
      report,
      attachmentConfirmed: true,
      requiredFieldsConfirmed: true
    }
  }

  private async callPort<T>(
    stage: ContinuousResearchStage,
    message: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      if (error instanceof ApplicationError) {
        throw error
      }

      throw new ApplicationError({
        code: 'INTEGRATION',
        message,
        stage,
        cause: error
      })
    }
  }
}
