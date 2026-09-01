Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [switch]$CaptureOutput
  )

  if ($CaptureOutput) {
    $output = & $Executable @Arguments
  }
  else {
    & $Executable @Arguments | Out-Host
    $output = $null
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Comando da distribuicao falhou."
  }

  return $output
}

function Assert-ReleaseDescendant {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot
  )

  $resolvedReleaseRoot = [System.IO.Path]::GetFullPath($ReleaseRoot)
  $resolvedPath = [System.IO.Path]::GetFullPath($Path)
  $directorySeparators = [char[]]@(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $releasePrefix = $resolvedReleaseRoot.TrimEnd($directorySeparators) + [System.IO.Path]::DirectorySeparatorChar

  if (-not $resolvedPath.StartsWith($releasePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Caminho de distribuicao fora de release.'
  }

  return $resolvedPath
}

function Assert-RegularDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $item = Get-Item -LiteralPath $Path -Force

  if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'Diretorio de distribuicao inseguro.'
  }
}

function Clear-ReleaseOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot
  )

  $topLevelItems = @(Get-ChildItem -LiteralPath $ReleaseRoot -Force)
  $pendingDirectories = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'

  foreach ($item in $topLevelItems) {
    [void](Assert-ReleaseDescendant -Path $item.FullName -ReleaseRoot $ReleaseRoot)
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Saida release contem caminho de redirecionamento.' }
    if ($item.PSIsContainer) { $pendingDirectories.Push($item) }
  }

  while ($pendingDirectories.Count -gt 0) {
    foreach ($item in Get-ChildItem -LiteralPath $pendingDirectories.Pop().FullName -Force) {
      [void](Assert-ReleaseDescendant -Path $item.FullName -ReleaseRoot $ReleaseRoot)
      if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Saida release contem caminho de redirecionamento.' }
      if ($item.PSIsContainer) { $pendingDirectories.Push($item) }
    }
  }

  foreach ($item in $topLevelItems) {
    Remove-Item -LiteralPath $item.FullName -Recurse -Force
  }
}

function Assert-Sha256Manifest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,

    [Parameter(Mandatory = $true)]
    [string[]]$ArtifactPaths
  )

  $manifest = Get-Content -LiteralPath $manifestPath -Raw

  if (-not $manifest.EndsWith("`n") -or $manifest.EndsWith("`n`n") -or $manifest.Contains("`r")) {
    throw 'Manifesto SHA-256 invalido.'
  }

  $lines = $manifest.Substring(0, $manifest.Length - 1).Split("`n")

  if ($lines.Count -ne 2 -or $ArtifactPaths.Count -ne 2) {
    throw 'Manifesto SHA-256 invalido.'
  }

  $expectedHashes = @{}

  foreach ($artifactPath in $ArtifactPaths) {
    $name = [System.IO.Path]::GetFileName($artifactPath)
    $expectedHashes[$name] = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }

  $previousName = $null
  $seenNames = @{}

  foreach ($line in $lines) {
    if ($line -notmatch '^([0-9a-f]{64})  ([^\\/]+)$') {
      throw 'Manifesto SHA-256 invalido.'
    }

    $actualHash = $Matches[1]
    $name = $Matches[2]

    if (
      $seenNames.ContainsKey($name) -or
      -not $expectedHashes.ContainsKey($name) -or
      ($null -ne $previousName -and [string]::CompareOrdinal($previousName, $name) -ge 0)
    ) {
      throw 'Manifesto SHA-256 invalido.'
    }

    $actualBytes = [System.Text.Encoding]::ASCII.GetBytes($actualHash)
    $expectedBytes = [System.Text.Encoding]::ASCII.GetBytes([string]$expectedHashes[$name])

    $difference = 0
    for ($index = 0; $index -lt $actualBytes.Length; $index++) {
      $difference = $difference -bor ($actualBytes[$index] -bxor $expectedBytes[$index])
    }

    if ($difference -ne 0) {
      throw 'Manifesto SHA-256 invalido.'
    }

    $seenNames[$name] = $true
    $previousName = $name
  }

  if ($seenNames.Count -ne $expectedHashes.Count) {
    throw 'Manifesto SHA-256 invalido.'
  }
}

function Invoke-DistributionPhaseSequence {
  param(
    [Parameter(Mandatory = $true)]
    [System.Collections.IDictionary]$Phases
  )

  foreach ($phase in $Phases.GetEnumerator()) {
    Write-Host "==> $($phase.Key)"
    & $phase.Value
  }
}

function Invoke-WindowsDistribution {
  $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'release'))
  $state = [ordered]@{}

  $phases = [ordered]@{
    'environment checks' = {
      if (
        $env:OS -ne 'Windows_NT' -or
        -not [Environment]::Is64BitOperatingSystem -or
        -not [Environment]::Is64BitProcess -or
        [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64 -or
        [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64
      ) {
        throw 'A distribuicao requer Windows x64.'
      }

      if ([System.IO.Path]::GetFullPath((Get-Location).Path) -ne $repositoryRoot) {
        throw 'Execute a distribuicao a partir da raiz do repositorio.'
      }

      foreach ($requiredFile in @('package.json', 'pnpm-lock.yaml', 'electron-builder.config.cjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot $requiredFile) -PathType Leaf)) {
          throw 'Repositorio de distribuicao invalido.'
        }
      }

      $nodeVersion = [string](Invoke-CheckedCommand -Executable 'node' -Arguments @('--version') -CaptureOutput)
      $pnpmVersion = [string](Invoke-CheckedCommand -Executable 'pnpm' -Arguments @('--version') -CaptureOutput)

      foreach ($credentialName in @('CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD')) {
        if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($credentialName))) {
          throw 'Credencial de assinatura nao permitida na distribuicao.'
        }
      }
      $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
      if ($env:CSC_IDENTITY_AUTO_DISCOVERY -ne 'false') { throw 'Descoberta automatica de assinatura nao desabilitada.' }

      if ($nodeVersion -notmatch '^v?24\.' -or $pnpmVersion -notmatch '^10\.') {
        throw 'A distribuicao requer Node.js 24 e pnpm 10.'
      }

      $packagePath = Join-Path $repositoryRoot 'package.json'
      $identityPath = Join-Path $repositoryRoot 'build/application-identity.json'
      $packageJson = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
      $identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
      $versionPattern = '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$'

      if ($packageJson.version -isnot [string] -or $packageJson.version -notmatch $versionPattern) {
        throw 'Versao invalida no package.json.'
      }

      if (
        $identity.artifactBaseName -isnot [string] -or
        [string]::IsNullOrWhiteSpace($identity.artifactBaseName) -or
        $identity.executableName -isnot [string] -or
        [string]::IsNullOrWhiteSpace($identity.executableName)
      ) {
        throw 'Identidade de distribuicao invalida.'
      }

      if (Test-Path -LiteralPath $releaseRoot) {
        Assert-RegularDirectory -Path $releaseRoot
      }
      else {
        New-Item -ItemType Directory -Path $releaseRoot | Out-Null
      }

      $state.Version = $packageJson.version
      $state.PrepackagedDirectory = Assert-ReleaseDescendant -Path (Join-Path $releaseRoot 'win-unpacked') -ReleaseRoot $releaseRoot
      $state.PackagedExecutable = Assert-ReleaseDescendant -Path (Join-Path $state.PrepackagedDirectory "$($identity.executableName).exe") -ReleaseRoot $releaseRoot
      $state.InstallerPath = Assert-ReleaseDescendant -Path (Join-Path $releaseRoot "$($identity.artifactBaseName)-$($state.Version)-Setup-x64.exe") -ReleaseRoot $releaseRoot
      $state.ArchivePath = Assert-ReleaseDescendant -Path (Join-Path $releaseRoot "$($identity.artifactBaseName)-$($state.Version)-Windows-x64.zip") -ReleaseRoot $releaseRoot
      $state.ManifestPath = Assert-ReleaseDescendant -Path (Join-Path $releaseRoot 'SHA256SUMS.txt') -ReleaseRoot $releaseRoot
    }
    'validate' = {
      Invoke-CheckedCommand -Executable 'pnpm' -Arguments @('run', 'validate')
    }
    'build' = {
      Invoke-CheckedCommand -Executable 'pnpm' -Arguments @('run', 'build')
    }
    'package unpacked' = {
      Clear-ReleaseOutput -ReleaseRoot $releaseRoot
      Invoke-CheckedCommand -Executable 'pnpm' -Arguments @(
        'exec',
        'electron-builder',
        '--config',
        'electron-builder.config.cjs',
        '--dir', '--win', '--x64', '--publish', 'never'
      )

      if (-not (Test-Path -LiteralPath $state.PackagedExecutable -PathType Leaf)) {
        throw 'Aplicativo desempacotado ausente.'
      }

      Assert-RegularDirectory -Path $state.PrepackagedDirectory
    }
    'packaged smoke' = {
      Invoke-CheckedCommand -Executable 'pnpm' -Arguments @('run', 'smoke:packaged', '--', "--executable=$($state.PackagedExecutable)")
    }
    'package installer' = {
      Invoke-CheckedCommand -Executable 'pnpm' -Arguments @(
        'exec',
        'electron-builder',
        '--config',
        'electron-builder.config.cjs',
        '--win', 'nsis', '--x64', '--prepackaged', $state.PrepackagedDirectory,
        '--publish', 'never'
      )

      if (-not (Test-Path -LiteralPath $state.InstallerPath -PathType Leaf)) {
        throw 'Instalador esperado ausente.'
      }
    }
    'archive' = {
      Compress-Archive -Path (Join-Path $state.PrepackagedDirectory '*') -DestinationPath $state.ArchivePath -CompressionLevel Optimal

      if (-not (Test-Path -LiteralPath $state.ArchivePath -PathType Leaf)) {
        throw 'Arquivo ZIP esperado ausente.'
      }
    }
    'hash' = {
      $artifacts = @(
        Get-Item -LiteralPath $state.InstallerPath
        Get-Item -LiteralPath $state.ArchivePath
      ) | Sort-Object -Property Name
      $lines = foreach ($artifact in $artifacts) {
        $hash = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$hash  $($artifact.Name)"
      }
      $manifest = ($lines -join "`n") + "`n"
      [System.IO.File]::WriteAllText($state.ManifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))
    }
    'manifest verification' = {
      Assert-Sha256Manifest -ManifestPath $state.ManifestPath -ArtifactPaths @(
        $state.InstallerPath,
        $state.ArchivePath
      )
    }
    'complete' = {
      foreach ($artifactPath in @($state.InstallerPath, $state.ArchivePath)) {
        $artifact = Get-Item -LiteralPath $artifactPath
        $hash = (Get-FileHash -LiteralPath $artifact.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "$($artifact.FullName) | $($artifact.Length) bytes | sha256=$hash"
      }

      Write-Host $state.ManifestPath
    }
  }

  Invoke-DistributionPhaseSequence -Phases $phases
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-WindowsDistribution
}
