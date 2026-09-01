import { timingSafeEqual } from 'node:crypto'
import { posix, win32 } from 'node:path'
import applicationIdentity from '../../build/application-identity.json'

export interface WindowsArtifactNames {
  readonly installer: string
  readonly unpackedArchive: string
  readonly manifest: 'SHA256SUMS.txt'
}

interface Sha256Artifact {
  readonly name: string
  readonly sha256: string
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SHA256_CASE_INSENSITIVE_PATTERN = /^[0-9a-f]{64}$/i

function isValidVersion(value: unknown): value is string {
  return typeof value === 'string' && SEMVER_PATTERN.test(value)
}

function isSafeBasename(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    !Array.from(name).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    }) &&
    name !== '.' &&
    name !== '..' &&
    name === posix.basename(name) &&
    name === win32.basename(name) &&
    !posix.isAbsolute(name) &&
    !win32.isAbsolute(name)
  )
}

function normalizeHash(hash: unknown): string | undefined {
  return typeof hash === 'string' && SHA256_CASE_INSENSITIVE_PATTERN.test(hash)
    ? hash.toLowerCase()
    : undefined
}

function validateArtifacts(artifacts: readonly Sha256Artifact[]): readonly Sha256Artifact[] {
  if (!Array.isArray(artifacts) || artifacts.length !== 2) {
    throw new Error('Manifesto SHA-256 invalido.')
  }

  const normalized: Sha256Artifact[] = []

  for (const artifact of artifacts) {
    if (typeof artifact !== 'object' || artifact === null) {
      throw new Error('Manifesto SHA-256 invalido.')
    }

    const name = Reflect.get(artifact, 'name')
    const sha256 = normalizeHash(Reflect.get(artifact, 'sha256'))

    if (!isSafeBasename(name) || sha256 === undefined) {
      throw new Error('Manifesto SHA-256 invalido.')
    }

    normalized.push({ name, sha256 })
  }

  const names = normalized.map(({ name }) => name.toLowerCase())

  if (new Set(names).size !== normalized.length) {
    throw new Error('Manifesto SHA-256 invalido.')
  }

  return normalized
}

function hashesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'ascii')
  const rightBytes = Buffer.from(right, 'ascii')

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function parsePackageVersion(packageJson: unknown): string {
  const version =
    typeof packageJson === 'object' && packageJson !== null
      ? Reflect.get(packageJson, 'version')
      : undefined

  if (!isValidVersion(version)) {
    throw new Error('Versao invalida no package.json.')
  }

  return version
}

export function createWindowsArtifactNames(version: string): WindowsArtifactNames {
  if (!isValidVersion(version)) {
    throw new Error('Versao invalida.')
  }

  return {
    installer: `${applicationIdentity.artifactBaseName}-${version}-Setup-x64.exe`,
    unpackedArchive: `${applicationIdentity.artifactBaseName}-${version}-Windows-x64.zip`,
    manifest: 'SHA256SUMS.txt'
  }
}

export function createSha256Manifest(artifacts: readonly Sha256Artifact[]): string {
  const normalized = validateArtifacts(artifacts)
  const sorted = [...normalized].sort(({ name: left }, { name: right }) =>
    left < right ? -1 : left > right ? 1 : 0
  )

  return `${sorted.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n')}\n`
}

export function verifySha256Manifest(manifest: string, hashes: ReadonlyMap<string, string>): void {
  if (!manifest.endsWith('\n') || manifest.endsWith('\n\n') || manifest.includes('\r')) {
    throw new Error('Manifesto SHA-256 invalido.')
  }

  const lines = manifest.slice(0, -1).split('\n')
  const entries: Sha256Artifact[] = []

  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)

    if (!match || !SHA256_PATTERN.test(match[1])) {
      throw new Error('Manifesto SHA-256 invalido.')
    }

    entries.push({ sha256: match[1], name: match[2] })
  }

  const validated = validateArtifacts(entries)
  const sortedNames = [...validated.map(({ name }) => name)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0
  )

  if (
    hashes.size !== 2 ||
    validated.some(({ name }, index) => name !== sortedNames[index]) ||
    [...hashes.keys()].some((name) => !isSafeBasename(name))
  ) {
    throw new Error('Manifesto SHA-256 invalido.')
  }

  for (const { name, sha256 } of validated) {
    const expectedHash = normalizeHash(hashes.get(name))

    if (expectedHash === undefined || !hashesMatch(sha256, expectedHash)) {
      throw new Error('Manifesto SHA-256 invalido.')
    }
  }
}
