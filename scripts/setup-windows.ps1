Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-CheckedCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,

    [Parameter()]
    [string[]]$Arguments = @(),

    [Parameter()]
    [switch]$CaptureOutput
  )

  $displayCommand = "$Executable $($Arguments -join ' ')".Trim()
  Write-Host "> $displayCommand"

  $output = $null
  if ($CaptureOutput) {
    $output = @(& $Executable @Arguments 2>&1)
  }
  else {
    & $Executable @Arguments
  }

  $exitCode = $LASTEXITCODE
  if ($LASTEXITCODE -ne 0) {
    throw "O comando falhou com codigo $exitCode`: $displayCommand"
  }

  if ($CaptureOutput) {
    return ($output -join [Environment]::NewLine).Trim()
  }
}

$isWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
  [System.Runtime.InteropServices.OSPlatform]::Windows
)
if (-not $isWindows) {
  throw 'Este setup requer Windows 10 ou Windows 11.'
}

if (
  -not [Environment]::Is64BitOperatingSystem -or
  -not [Environment]::Is64BitProcess -or
  [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64 -or
  [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64
) {
  throw 'Este setup requer Windows x64 e um processo PowerShell x64.'
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$currentDirectory = [System.IO.Path]::GetFullPath((Get-Location).Path)
if (-not [string]::Equals(
    $currentDirectory.TrimEnd('\', '/'),
    $repositoryRoot.TrimEnd('\', '/'),
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Execute o setup a partir da raiz do repositorio: $repositoryRoot"
}

$packageJsonPath = Join-Path $repositoryRoot 'package.json'
$lockfilePath = Join-Path $repositoryRoot 'pnpm-lock.yaml'
if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
  throw "Arquivo obrigatorio ausente: $packageJsonPath"
}
if (-not (Test-Path -LiteralPath $lockfilePath -PathType Leaf)) {
  throw "Arquivo obrigatorio ausente: $lockfilePath"
}

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$expectedPackageManager = 'pnpm@10.28.1'
if (
  $null -eq $packageJson.packageManager -or
  $packageJson.packageManager -isnot [string] -or
  $packageJson.packageManager -cne $expectedPackageManager
) {
  throw "package.json deve declarar packageManager=$expectedPackageManager."
}

$nodeCommand = Get-Command 'node' -CommandType Application -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
  throw 'Node.js 24 nao foi encontrado. Instale-o manualmente e tente novamente.'
}
$nodeVersion = Invoke-CheckedCommand -Executable $nodeCommand.Source -Arguments @('--version') -CaptureOutput
$nodeMatch = [regex]::Match($nodeVersion.Trim(), '^v(?<major>\d+)\.')
if (-not $nodeMatch.Success -or [int]$nodeMatch.Groups['major'].Value -ne 24) {
  throw "Node.js major 24 e obrigatorio; versao encontrada: $nodeVersion"
}

$corepackCommand = Get-Command 'corepack' -CommandType Application -All -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $corepackCommand) {
  throw 'Corepack nao foi encontrado na instalacao atual do Node.js.'
}
[void](Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('--version') -CaptureOutput)

$pnpmShim = Get-Command 'pnpm' -CommandType Application, ExternalScript -ErrorAction SilentlyContinue
if ($null -eq $pnpmShim) {
  Write-Host 'corepack enable'
  throw 'Os shims do Corepack nao estao disponiveis. Execute manualmente o comando acima e tente novamente.'
}

$pnpmVersion = Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', '--version') -CaptureOutput
if ($pnpmVersion.Trim() -ne '10.28.1') {
  throw "Corepack deve resolver pnpm 10.28.1; versao encontrada: $pnpmVersion"
}

Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'install', '--frozen-lockfile')
Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'exec', 'playwright', 'install', 'chromium')
Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'run', 'validate')
Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'run', 'build')

Write-Host "Setup de desenvolvimento concluido: $repositoryRoot"
