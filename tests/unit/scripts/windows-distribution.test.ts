import { describe, expect, it } from 'vitest'
import {
  createSha256Manifest,
  createWindowsArtifactNames,
  parsePackageVersion,
  verifySha256Manifest
} from '../../../scripts/lib/windows-distribution'

const installerName = 'Agente-CPI-1.0.0-Setup-x64.exe'
const archiveName = 'Agente-CPI-1.0.0-Windows-x64.zip'
const installerHash = 'a'.repeat(64)
const archiveHash = 'b'.repeat(64)

describe('contrato puro da distribuicao Windows', () => {
  it('extrai a versao semver canonica do package.json', () => {
    expect(parsePackageVersion({ version: '1.0.0' })).toBe('1.0.0')
    expect(parsePackageVersion({ version: '2.4.0-beta.1+build.7' })).toBe('2.4.0-beta.1+build.7')
  })

  it.each([
    undefined,
    null,
    {},
    { version: 1 },
    { version: '' },
    { version: '1' },
    { version: 'v1.0.0' },
    { version: '01.0.0' },
    { version: '1.0.0.0' },
    { version: '1.0.0-' }
  ])('rejeita package.json sem versao semver valida: %j', (packageJson) => {
    expect(() => parsePackageVersion(packageJson)).toThrow('Versao invalida no package.json.')
  })

  it('deriva os tres nomes publicos da mesma versao', () => {
    expect(createWindowsArtifactNames('1.0.0')).toEqual({
      installer: installerName,
      unpackedArchive: archiveName,
      manifest: 'SHA256SUMS.txt'
    })
  })

  it.each(['', '1.0', 'v1.0.0', '1.0.0.0'])('rejeita versao invalida nos nomes: %j', (version) => {
    expect(() => createWindowsArtifactNames(version)).toThrow('Versao invalida.')
  })

  it('cria duas linhas ordenadas com hashes minusculos e uma quebra final', () => {
    expect(
      createSha256Manifest([
        { name: installerName, sha256: installerHash.toUpperCase() },
        { name: archiveName, sha256: archiveHash }
      ])
    ).toBe(`${installerHash}  ${installerName}\n${archiveHash}  ${archiveName}\n`)
  })

  it.each([
    [[]],
    [[{ name: installerName, sha256: installerHash }]],
    [
      [
        { name: installerName, sha256: installerHash },
        { name: installerName, sha256: archiveHash }
      ]
    ],
    [
      [
        { name: `release/${installerName}`, sha256: installerHash },
        { name: archiveName, sha256: archiveHash }
      ]
    ],
    [
      [
        { name: `..\\${installerName}`, sha256: installerHash },
        { name: archiveName, sha256: archiveHash }
      ]
    ],
    [
      [
        { name: installerName, sha256: 'not-a-hash' },
        { name: archiveName, sha256: archiveHash }
      ]
    ],
    [
      [
        { name: `Agente-CPI-Setup\u0000-x64.exe`, sha256: installerHash },
        { name: archiveName, sha256: archiveHash }
      ]
    ],
    [
      [
        { name: `Agente-CPI-Setup\n-x64.exe`, sha256: installerHash },
        { name: archiveName, sha256: archiveHash }
      ]
    ]
  ])('rejeita entradas inseguras ou incompletas do manifesto: %j', (artifacts) => {
    expect(() => createSha256Manifest(artifacts)).toThrow('Manifesto SHA-256 invalido.')
  })

  it('verifica por leitura independente as duas entradas do manifesto', () => {
    const manifest = createSha256Manifest([
      { name: installerName, sha256: installerHash },
      { name: archiveName, sha256: archiveHash }
    ])

    expect(() =>
      verifySha256Manifest(
        manifest,
        new Map([
          [installerName, installerHash.toUpperCase()],
          [archiveName, archiveHash]
        ])
      )
    ).not.toThrow()
  })

  it.each([
    `${installerHash}  ${installerName}\n`,
    `${installerHash}  ${installerName}\n${archiveHash}  ${installerName}\n`,
    `${installerHash}  C:\\release\\${installerName}\n${archiveHash}  ${archiveName}\n`,
    `${installerHash}  ../${installerName}\n${archiveHash}  ${archiveName}\n`,
    `${installerHash}  ${installerName}\n${'c'.repeat(64)}  ${archiveName}\n`,
    `${installerHash}  ${installerName}\n${archiveHash}  ${archiveName}`,
    `${installerHash.toUpperCase()}  ${installerName}\n${archiveHash}  ${archiveName}\n`
  ])('rejeita manifesto ausente, duplicado, inseguro, divergente ou nao canonico', (manifest) => {
    expect(() =>
      verifySha256Manifest(
        manifest,
        new Map([
          [installerName, installerHash],
          [archiveName, archiveHash]
        ])
      )
    ).toThrow('Manifesto SHA-256 invalido.')
  })
})
