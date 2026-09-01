import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/build-windows-distribution.ps1')
const osArchitectureCheck =
  '[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64'
const processArchitectureCheck =
  '[System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64'

function readDistributionScript(): string {
  return readFileSync(scriptPath, 'utf8')
}

function phaseIndexes(source: string): number[] {
  return [
    "'environment checks'",
    "'validate'",
    "'build'",
    "'package unpacked'",
    "'packaged smoke'",
    "'package installer'",
    "'archive'",
    "'hash'",
    "'manifest verification'",
    "'complete'"
  ].map((phase) => source.indexOf(phase))
}

function assertExplicitX64Environment(source: string): void {
  expect(source).toContain(osArchitectureCheck)
  expect(source).toContain(processArchitectureCheck)
}

function runInjectedFailure(failingPhase: string): string[] {
  const escapedScriptPath = scriptPath.replaceAll("'", "''")
  const command = `
. '${escapedScriptPath}'
$events = [System.Collections.Generic.List[string]]::new()
$phases = [ordered]@{}
@('environment checks', 'validate', 'build', 'package unpacked', 'packaged smoke', 'package installer', 'archive', 'hash', 'manifest verification', 'complete') | ForEach-Object {
  $phase = $_
  $phases[$phase] = {
    $events.Add($phase)
    if ($phase -eq '${failingPhase}') { throw 'falha injetada' }
  }.GetNewClosure()
}
try { Invoke-DistributionPhaseSequence -Phases $phases } catch {}
ConvertTo-Json -Compress -InputObject @($events)
`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')
  const json = result.stdout.trim().split(/\r?\n/).at(-1)

  return JSON.parse(json ?? '[]') as string[]
}

describe('pipeline PowerShell de distribuicao Windows', () => {
  it('requer explicitamente Windows e processo X64, nao apenas 64 bits', () => {
    assertExplicitX64Environment(readDistributionScript())
  })

  it('rejeita a mutacao que confia somente nos booleanos de 64 bits', () => {
    const source = readDistributionScript()
    const mutated = source
      .replace(osArchitectureCheck, '$false')
      .replace(processArchitectureCheck, '$false')

    expect(mutated).not.toBe(source)
    expect(() => assertExplicitX64Environment(mutated)).toThrow()
  })

  it('declara seguranca, runner nativo checado e ordem canonica das fases', () => {
    const source = readDistributionScript()
    const indexes = phaseIndexes(source)

    expect(source).toContain('Set-StrictMode -Version Latest')
    expect(source).toContain("$ErrorActionPreference = 'Stop'")
    expect(source.match(/function Invoke-CheckedCommand/g)).toHaveLength(1)
    expect(source).toContain('if ($LASTEXITCODE -ne 0)')
    expect(source).toMatch(/if \(\$LASTEXITCODE -ne 0\) \{\s+throw/)
    expect(indexes.every((index) => index >= 0)).toBe(true)
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right))
    expect(source).toContain("@('run', 'validate')")
    expect(source).toContain("@('run', 'build')")
    expect(source).toContain("'--dir', '--win', '--x64'")
    expect(source).toContain("@('run', 'smoke:packaged'")
    expect(source).toContain("'--win', 'nsis', '--x64', '--prepackaged'")
    expect(source).toContain('Compress-Archive')
    expect(source.match(/Get-FileHash/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('Get-Content -LiteralPath $manifestPath -Raw')
  })

  it('limita toda remocao e staging a descendentes comprovados de release', () => {
    const source = readDistributionScript()

    expect(source).toContain('function Assert-ReleaseDescendant')
    expect(source).toContain("Join-Path $repositoryRoot 'release'")
    expect(source).toContain("Join-Path $releaseRoot 'win-unpacked'")
    expect(source).not.toMatch(/Remove-Item\s+(-[^\r\n]+\s+)*\$repositoryRoot\b/)
    expect(source.match(/Assert-ReleaseDescendant/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('$state.PrepackagedDirectory')
    expect(source).toContain("'--prepackaged', $state.PrepackagedDirectory")
  })

  it('valida descendencia com as APIs disponiveis no Windows PowerShell 5.1', () => {
    const escapedScriptPath = scriptPath.replaceAll("'", "''")
    const command = `
. '${escapedScriptPath}'
$repositoryRoot = [System.IO.Path]::GetFullPath((Get-Location).Path)
$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'release'))
[void](Assert-ReleaseDescendant -Path (Join-Path $releaseRoot.ToUpperInvariant() 'win-unpacked') -ReleaseRoot $releaseRoot.ToLowerInvariant())
foreach ($unsafePath in @($releaseRoot, $repositoryRoot, (Join-Path $repositoryRoot 'release-sibling'), (Join-Path $releaseRoot '..\\escape'))) {
  try {
    [void](Assert-ReleaseDescendant -Path $unsafePath -ReleaseRoot $releaseRoot)
    throw 'guard aceitou caminho inseguro'
  }
  catch {
    if ($_.Exception.Message -eq 'guard aceitou caminho inseguro') { throw }
  }
}
'ok'
`
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    })

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('ok')
  })

  it('preflight recusa junction aninhada antes de apagar release ou alvo externo', () => {
    const escapedScriptPath = scriptPath.replaceAll("'", "''")
    const command = `. '${escapedScriptPath}'; $root=Join-Path ([IO.Path]::GetTempPath()) ('acpi-audit-'+[guid]::NewGuid().ToString('N')); $release=Join-Path $root 'release'; $external=Join-Path $root 'external'; $junction=Join-Path $release 'nested\\redirect'; try { New-Item -ItemType Directory -Path (Join-Path $release 'nested') -Force|Out-Null; New-Item -ItemType Directory -Path $external -Force|Out-Null; Set-Content (Join-Path $release 'keep.txt') 'release'; Set-Content (Join-Path $external 'keep.txt') 'external'; & cmd.exe /d /c mklink /J $junction $external|Out-Null; if($LASTEXITCODE-ne 0){throw 'fixture'}; try{Clear-ReleaseOutput $release;throw 'accepted'}catch{if($_.Exception.Message-eq 'accepted'){throw}}; if(!(Test-Path (Join-Path $release 'keep.txt'))-or !(Test-Path (Join-Path $external 'keep.txt'))){throw 'deleted'}; 'ok' } finally { if(Test-Path $junction){& cmd.exe /d /c rmdir $junction|Out-Null}; if(Test-Path $root){Remove-Item $root -Recurse -Force} }`
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe('ok')
  })

  it('executa Assert-Sha256Manifest real no Windows PowerShell 5.1', () => {
    const escapedScriptPath = scriptPath.replaceAll("'", "''")
    const command = `. '${escapedScriptPath}'; $root=Join-Path ([IO.Path]::GetTempPath()) ('acpi-hash-'+[guid]::NewGuid().ToString('N')); try { New-Item -ItemType Directory $root|Out-Null; $a=Join-Path $root 'a.exe';$b=Join-Path $root 'b.zip';$m=Join-Path $root 'SHA256SUMS.txt';[IO.File]::WriteAllText($a,'a');[IO.File]::WriteAllText($b,'b');$lines=@($a,$b)|%{$i=Get-Item $_;"$((Get-FileHash $_ -Algorithm SHA256).Hash.ToLowerInvariant())  $($i.Name)"};[IO.File]::WriteAllText($m,(($lines-join "\`n")+"\`n"),[Text.UTF8Encoding]::new($false));Assert-Sha256Manifest $m @($a,$b);[IO.File]::WriteAllText($a,'changed');try{Assert-Sha256Manifest $m @($a,$b);throw 'accepted'}catch{if($_.Exception.Message-eq 'accepted'){throw}};'ok'}finally{if(Test-Path $root){Remove-Item $root -Recurse -Force}}`
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('ok')
  })

  it('nao contem publicacao, assinatura, portais ou versao independente', () => {
    const source = readDistributionScript()

    expect(source).not.toMatch(/git\s+push|github\s+release|signtool/i)
    expect(source.match(/'--publish', 'never'/g)).toHaveLength(2)
    expect(source).toContain("$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'")
    expect(source).toContain(
      "@('CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD')"
    )
    expect(source).not.toMatch(
      /cpi:(inspect|test|save)|deskdata:(inspect|test|prepare)|flow:(test|run)|browser:smoke/i
    )
    expect(source).not.toMatch(/['"]v?\d+\.\d+\.\d+(?:[-+][^'"]+)?['"]/)
    expect(source).toContain("Join-Path $repositoryRoot 'package.json'")
  })

  it('registra o unico comando canonico e ignora somente saidas locais', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
      readonly scripts?: Readonly<Record<string, string>>
    }
    const gitignore = readFileSync(resolve('.gitignore'), 'utf8')

    expect(packageJson.scripts?.['distribution:windows']).toBe(
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-distribution.ps1'
    )
    expect(gitignore).toMatch(/^\/release\/$/m)
    expect(gitignore).toMatch(/^\/agente-cpi-smoke-\*\/$/m)
  })

  it.each([
    ['validate', ['environment checks', 'validate']],
    [
      'packaged smoke',
      ['environment checks', 'validate', 'build', 'package unpacked', 'packaged smoke']
    ],
    [
      'manifest verification',
      [
        'environment checks',
        'validate',
        'build',
        'package unpacked',
        'packaged smoke',
        'package installer',
        'archive',
        'hash',
        'manifest verification'
      ]
    ]
  ])('interrompe fases posteriores quando %s falha', (failingPhase, expectedEvents) => {
    expect(runInjectedFailure(failingPhase)).toEqual(expectedEvents)
  })
})
