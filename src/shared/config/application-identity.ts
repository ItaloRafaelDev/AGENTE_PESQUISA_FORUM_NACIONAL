import rawIdentity from '../../../build/application-identity.json'

export interface ApplicationIdentity {
  readonly appId: string
  readonly productName: string
  readonly executableName: string
  readonly artifactBaseName: string
  readonly legacyUserDataDirectoryName: string
}

export const APPLICATION_IDENTITY = Object.freeze(rawIdentity satisfies ApplicationIdentity)
