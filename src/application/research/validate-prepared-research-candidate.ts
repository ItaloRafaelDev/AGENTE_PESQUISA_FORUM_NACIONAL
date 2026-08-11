import { ApplicationError } from '../errors/application-error'
import type { PreparedResearch } from '../ports/research-preparation-ports'

export interface PreparedResearchRequiredFields {
  researcherLabel: string
  primaryResearcherLabel: string
  statusLabel: string
}

export interface PreparedResearchCandidate extends Omit<
  PreparedResearch,
  'attachmentConfirmed' | 'requiredFieldsConfirmed'
> {
  attachmentConfirmed: boolean
  requiredFields: PreparedResearchRequiredFields
}

export function assertResearchReportHasContent(reportSizeBytes: number, message: string): void {
  if (reportSizeBytes > 0) {
    return
  }

  throw new ApplicationError({
    code: 'PREPARATION',
    message,
    stage: 'DOWNLOADING_PDF'
  })
}

export function assertResearchAttachmentConfirmed(confirmed: boolean, message: string): void {
  if (confirmed) {
    return
  }

  throw new ApplicationError({
    code: 'PREPARATION',
    message,
    stage: 'ATTACHING_PDF'
  })
}

export function assertResearchRequiredFieldsConfirmed(confirmed: boolean, message: string): void {
  if (confirmed) {
    return
  }

  throw new ApplicationError({
    code: 'PREPARATION',
    message,
    stage: 'PREPARING_CPI_RESULT'
  })
}

export function validatePreparedResearchCandidate(
  candidate: PreparedResearchCandidate
): PreparedResearch {
  assertResearchAttachmentConfirmed(
    candidate.attachmentConfirmed,
    'O PDF não foi confirmado no campo de anexo da CPI.'
  )
  assertResearchReportHasContent(
    candidate.report.sizeBytes,
    'O PDF da DeskData possui tamanho inválido.'
  )

  const requiredFieldsConfirmed =
    candidate.requiredFields.researcherLabel === 'Desk Data' &&
    candidate.requiredFields.primaryResearcherLabel === 'Desk Data' &&
    candidate.requiredFields.statusLabel === 'Respondida'

  assertResearchRequiredFieldsConfirmed(
    requiredFieldsConfirmed,
    'Os campos obrigatórios da CPI não foram confirmados.'
  )

  return {
    maskedCpf: candidate.maskedCpf,
    selectedDatasetCount: candidate.selectedDatasetCount,
    classification: candidate.classification,
    report: candidate.report,
    attachmentConfirmed: true,
    requiredFieldsConfirmed: true
  }
}
