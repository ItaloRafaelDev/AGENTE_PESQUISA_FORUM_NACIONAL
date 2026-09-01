import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/setup-windows.ps1')
const osArchitectureCheck =
  '[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64'
const processArchitectureCheck =
  '[System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64'

interface PowerShellCommandInventoryItem {
  readonly commandName: string | null
  readonly functionName: string | null
  readonly invocationOperator: string
  readonly text: string
}

function readSetupScript(): string {
  return readFileSync(scriptPath, 'utf8')
}

function assertSetupContract(source: string): void {
  expect(source).toContain('Set-StrictMode -Version Latest')
  expect(source).toContain("$ErrorActionPreference = 'Stop'")
  expect(source.match(/function Invoke-CheckedCommand/g)).toHaveLength(1)
  expect(source).toMatch(/if \(\$LASTEXITCODE -ne 0\) \{\s+throw/)
  expect(source).toContain('& $Executable @Arguments')

  expect(source).toContain('[System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform')
  expect(source).toContain('[System.Runtime.InteropServices.OSPlatform]::Windows')
  expect(source).toContain('[Environment]::Is64BitOperatingSystem')
  expect(source).toContain('[Environment]::Is64BitProcess')
  expect(source).toContain(osArchitectureCheck)
  expect(source).toContain(processArchitectureCheck)
  expect(source).toContain('$PSScriptRoot')
  expect(source).toContain("Join-Path $repositoryRoot 'package.json'")
  expect(source).toContain("Join-Path $repositoryRoot 'pnpm-lock.yaml'")
  expect(source).toMatch(/Test-Path -LiteralPath \$packageJsonPath -PathType Leaf/)
  expect(source).toMatch(/Test-Path -LiteralPath \$lockfilePath -PathType Leaf/)

  expect(source).toContain("@('--version')")
  expect(source).toMatch(/\[int\]\$nodeMatch\.Groups\['major'\]\.Value -ne 24/)
  expect(source).toContain("Get-Command 'corepack'")
  expect(source).toContain("Get-Command 'pnpm'")
  expect(source).toContain("Write-Host 'corepack enable'")
  expect(source).not.toMatch(/Invoke-CheckedCommand[^\r\n]+@\('enable'\)/)
  expect(source).toContain("@('pnpm', '--version')")
  expect(source).toContain("$expectedPackageManager = 'pnpm@10.28.1'")
  expect(source).toContain("if ($pnpmVersion.Trim() -ne '10.28.1')")

  const commands = [
    "@('pnpm', 'install', '--frozen-lockfile')",
    "@('pnpm', 'exec', 'playwright', 'install', 'chromium')",
    "@('pnpm', 'run', 'validate')",
    "@('pnpm', 'run', 'build')"
  ]
  const commandIndexes = commands.map((command) => source.indexOf(command))

  expect(commandIndexes.every((index) => index >= 0)).toBe(true)
  expect(commandIndexes).toEqual([...commandIndexes].sort((left, right) => left - right))
  for (const command of commands) {
    expect(source.split(command)).toHaveLength(2)
  }

  expect(source).not.toMatch(/\b(?:winget|choco|scoop|msiexec|Invoke-WebRequest|curl\.exe)\b/i)
  expect(source).not.toMatch(/\b(?:Read-Host|Get-Credential|Set-ExecutionPolicy)\b/i)
  expect(source).not.toMatch(/\bExecutionPolicy\b/i)
  expect(source).not.toMatch(/https?:\/\//i)
  expect(source).not.toMatch(/git\s+(?:clone|pull|push|config|credential)/i)
  expect(source).not.toMatch(
    /cpi:(?:inspect|test|save|retry)|deskdata:(?:inspect|test|prepare)|flow:(?:test|run)|browser:smoke|smoke:packaged|distribution:windows/i
  )
  expect(source).not.toMatch(/@\('pnpm', 'run', '(?:start|dev)'\)/)
  expect(source).not.toMatch(/\bStart-Process\b|\bInvoke-Expression\b/i)
  expect(source).not.toMatch(
    /\bRemove-Item\b|\bClear-Content\b|\bSet-Content\b|\bAdd-Content\b|\bOut-File\b/i
  )
  expect(source).not.toMatch(/rebuild:native|electron-rebuild/i)
}

function parsePowerShellCommandInventory(
  source: string
): readonly PowerShellCommandInventoryItem[] {
  const encodedSource = Buffer.from(source, 'utf8').toString('base64')
  const command = `
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedSource}'))
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'fixture PowerShell invalida' }
$commands = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.CommandAst]
}, $true) | ForEach-Object {
  $functionName = $null
  $parent = $_.Parent
  while ($null -ne $parent) {
    if ($parent -is [System.Management.Automation.Language.FunctionDefinitionAst]) {
      $functionName = $parent.Name
      break
    }
    $parent = $parent.Parent
  }
  [pscustomobject]@{
    commandName = $_.GetCommandName()
    functionName = $functionName
    invocationOperator = $_.InvocationOperator.ToString()
    text = $_.Extent.Text
  }
})
ConvertTo-Json -Compress -Depth 4 -InputObject @($commands)
`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')

  return JSON.parse(result.stdout.trim()) as readonly PowerShellCommandInventoryItem[]
}

function assertNativeInvocationInventory(source: string): void {
  const inventory = parsePowerShellCommandInventory(source)
  const allowedNamedCommands = new Set([
    'ConvertFrom-Json',
    'Get-Command',
    'Get-Content',
    'Get-Location',
    'Invoke-CheckedCommand',
    'Join-Path',
    'Select-Object',
    'Set-StrictMode',
    'Test-Path',
    'Write-Host'
  ])
  const namedCommands = inventory.filter((item) => item.commandName !== null)
  const dynamicCommands = inventory.filter((item) => item.commandName === null)
  const checkedCommands = inventory.filter((item) => item.commandName === 'Invoke-CheckedCommand')

  expect(namedCommands.every((item) => allowedNamedCommands.has(item.commandName ?? ''))).toBe(true)
  expect(dynamicCommands.map(({ functionName, text }) => ({ functionName, text }))).toEqual([
    {
      functionName: 'Invoke-CheckedCommand',
      text: '& $Executable @Arguments 2>&1'
    },
    { functionName: 'Invoke-CheckedCommand', text: '& $Executable @Arguments' }
  ])
  expect(checkedCommands.map((item) => item.text)).toEqual([
    "Invoke-CheckedCommand -Executable $nodeCommand.Source -Arguments @('--version') -CaptureOutput",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('--version') -CaptureOutput",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', '--version') -CaptureOutput",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'install', '--frozen-lockfile')",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'exec', 'playwright', 'install', 'chromium')",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'run', 'validate')",
    "Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'run', 'build')"
  ])
}

function readCurrentPowerShellArchitectures(): string {
  const command = `
$os = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
$process = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
"$os|$process"
`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')

  return result.stdout.trim()
}

function runCorepackResolution(source: string): {
  readonly commandCount: number
  readonly executable: string
} {
  const assignment = source.match(/^\$corepackCommand = .*$/m)?.[0]

  expect(assignment).toBeDefined()

  const command = `
function Select-Executable {
  param([Parameter(Mandatory = $true)][string]$Executable)
  return $Executable
}
${assignment}
$selected = Select-Executable -Executable $corepackCommand.Source
ConvertTo-Json -Compress -InputObject @{
  commandCount = @($corepackCommand).Count
  executable = $selected
}
`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    windowsHide: true
  })

  expect(result.status).toBe(0)
  expect(result.stderr).toBe('')

  return JSON.parse(result.stdout.trim()) as {
    readonly commandCount: number
    readonly executable: string
  }
}

describe('setup de desenvolvimento Windows', () => {
  it('valida o ambiente e executa somente a sequencia convergente aprovada', () => {
    assertSetupContract(readSetupScript())
  })

  it('resolve deterministicamente um unico executavel Corepack no Windows atual', () => {
    const result = runCorepackResolution(readSetupScript())

    expect(result.commandCount).toBe(1)
    expect(result.executable).toMatch(/corepack\.(?:cmd|exe)$/i)
  })

  it('confirma arquitetura X64 explicita com APIs disponiveis no Windows PowerShell 5.1', () => {
    expect(readCurrentPowerShellArchitectures()).toBe('X64|X64')
  })

  it('mantem um inventario fechado de exatamente sete comandos nativos checados', () => {
    assertNativeInvocationInventory(readSetupScript())
  })

  it('rejeita a mutacao que confia somente nos booleanos de 64 bits', () => {
    const source = readSetupScript()
    const mutated = source
      .replace(osArchitectureCheck, '$false')
      .replace(processArchitectureCheck, '$false')

    expect(mutated).not.toBe(source)
    expect(() => assertSetupContract(mutated)).toThrow()
  })

  it('rejeita execucao nativa direta fora do helper checado', () => {
    const source = readSetupScript()
    const mutated = source.replace(
      'Write-Host "Setup de desenvolvimento concluido: $repositoryRoot"',
      `& $nodeCommand.Source @('--version')\n\nWrite-Host "Setup de desenvolvimento concluido: $repositoryRoot"`
    )

    expect(mutated).not.toBe(source)
    expect(() => assertNativeInvocationInventory(mutated)).toThrow()
  })

  it('rejeita uma oitava chamada ao helper checado', () => {
    const source = readSetupScript()
    const mutated = source.replace(
      'Write-Host "Setup de desenvolvimento concluido: $repositoryRoot"',
      `Invoke-CheckedCommand -Executable $corepackCommand.Source -Arguments @('pnpm', 'run', 'dev')\n\nWrite-Host "Setup de desenvolvimento concluido: $repositoryRoot"`
    )

    expect(mutated).not.toBe(source)
    expect(() => assertNativeInvocationInventory(mutated)).toThrow()
  })

  it('rejeita a mutacao que instala sem lockfile congelado', () => {
    const source = readSetupScript()
    const mutated = source.replace(", '--frozen-lockfile'", '')

    expect(mutated).not.toBe(source)
    expect(() => assertSetupContract(mutated)).toThrow()
  })

  it('rejeita a mutacao que ignora codigo de saida nao zero', () => {
    const source = readSetupScript()
    const mutated = source.replace('if ($LASTEXITCODE -ne 0) {', 'if ($false) {')

    expect(mutated).not.toBe(source)
    expect(() => assertSetupContract(mutated)).toThrow()
  })
})
