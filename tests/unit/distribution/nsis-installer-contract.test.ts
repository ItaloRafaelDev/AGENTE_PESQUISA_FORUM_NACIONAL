import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface BuilderConfig {
  nsis: {
    deleteAppDataOnUninstall: boolean
    include?: string
  }
}

const installerIncludePath = resolve('build/installer.nsh')
const requireFromTest = createRequire(import.meta.url)

const readInstallerInclude = (): string => readFileSync(installerIncludePath, 'utf8')

const extractMacro = (source: string, name: string): string => {
  const match = source.match(new RegExp(`!macro\\s+${name}\\b([\\s\\S]*?)!macroend`, 'g'))

  expect(match, `${name} must be defined exactly once`).toHaveLength(1)
  return match![0]
}

describe('NSIS installer safety contract', () => {
  it('references the existing custom include and keeps automatic app-data deletion disabled', () => {
    const config = requireFromTest(resolve('electron-builder.config.cjs')) as BuilderConfig

    expect(existsSync(installerIncludePath)).toBe(true)
    expect(config.nsis.include).toBe('build/installer.nsh')
    expect(config.nsis.deleteAppDataOnUninstall).toBe(false)
  })

  it('runs only the fixed packaged Chromium helper in Electron Node mode', () => {
    const customInstall = extractMacro(readInstallerInclude(), 'customInstall')

    expect(customInstall.match(/nsExec::ExecToStack/g)).toHaveLength(1)
    expect(customInstall).toMatch(/nsExec::ExecToStack[^\r\n]*\r?\n\s*Pop \$0\r?\n\s*Pop \$2/)
    expect(customInstall).toContain('$SYSDIR\\cmd.exe')
    expect(customInstall).toMatch(/\/D\s+\/S\s+\/C/)
    expect(customInstall).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(customInstall).toContain('$INSTDIR\\AgenteCPI.exe')
    expect(customInstall).toContain(
      '$INSTDIR\\resources\\app.asar\\out\\main\\install-playwright-chromium.js'
    )
    expect(customInstall).toMatch(/\$\\"\$INSTDIR\\AgenteCPI\.exe\$\\"/)
    expect(customInstall).toMatch(
      /\$\\"\$INSTDIR\\resources\\app\.asar\\out\\main\\install-playwright-chromium\.js\$\\"/
    )
    expect(customInstall).not.toMatch(/GetParameters|GetOptions|\$CMDLINE/)
  })

  it('waits for silent rollback before aborting a failed browser provision', () => {
    const customInstall = extractMacro(readInstallerInclude(), 'customInstall')
    const rollback = customInstall.match(
      /ExecWait\s+[^\r\n]*\$INSTDIR\\\$\{UNINSTALL_FILENAME\}[^\r\n]*\/S[^\r\n]*\$1/
    )

    expect(customInstall).toMatch(/Pop\s+\$0/)
    expect(customInstall).toMatch(/\$0\s*!=\s*["']?0["']?/)
    expect(rollback).not.toBeNull()
    expect(rollback![0]).not.toContain('--delete-app-data')
    expect(customInstall).toMatch(/ClearErrors\r?\n\s*ExecWait/)
    expect(customInstall).toContain('IfErrors rollback_failed')
    expect(customInstall).toContain('StrCmp "$1" "0" rollback_complete rollback_failed')
    const orderedRollbackSteps = [
      '${If} $0 != 0',
      'ClearErrors',
      rollback![0],
      'IfErrors rollback_failed',
      'StrCmp "$1" "0" rollback_complete rollback_failed',
      'rollback_failed:',
      'rollback_complete:',
      'Abort "Não foi possível preparar o Chromium necessário. Tente instalar novamente."'
    ].map((step) => customInstall.indexOf(step))
    expect(orderedRollbackSteps.every((index) => index >= 0)).toBe(true)
    expect(orderedRollbackSteps).toEqual(
      [...orderedRollbackSteps].sort((left, right) => left - right)
    )
    expect(customInstall).toMatch(
      /rollback_failed:\s*DetailPrint[^\r\n]*\r?\n\s*rollback_complete:\s*Abort "Não foi possível preparar o Chromium necessário\. Tente instalar novamente\."/
    )
    expect(customInstall).toContain(
      'Abort "Não foi possível preparar o Chromium necessário. Tente instalar novamente."'
    )
    expect(customInstall).not.toMatch(/RMDir\s+\/r\s+["']?\$INSTDIR/i)
  })

  it('offers one unchecked exact-root local-data cleanup section with fail-closed guards', () => {
    const source = readInstallerInclude()
    const customUninstall = extractMacro(source, 'customUnInstallSection')
    const firstRecursiveDelete = customUninstall.indexOf('RMDir /r')

    expect(source).toContain('!include "FileFunc.nsh"')
    expect(customUninstall.match(/Section\s+\/o\b/g)).toHaveLength(1)
    expect(customUninstall).toContain('RMDir /r "$APPDATA\\agente-cpi"')
    expect(customUninstall).toContain('RMDir /r "$APPDATA\\AgenteCPI"')
    expect(customUninstall).toContain('StrCmp "$APPDATA" "" cleanup_refused')
    expect(customUninstall).toMatch(
      /ClearErrors\r?\n\s*GetFullPathName \$0 "\$APPDATA"\r?\n\s*IfErrors cleanup_refused\r?\n\s*StrCmp "\$0" "\$APPDATA" 0 cleanup_refused/
    )
    expect(customUninstall).toContain('${GetRoot} "$0" $1')
    expect(customUninstall).toContain('StrCmp "$1" "" cleanup_refused')
    expect(customUninstall).toContain('StrCmp "$0" "$1" cleanup_refused')
    expect(customUninstall).toContain('StrCmp "$0" "$1\\" cleanup_refused')
    expect(customUninstall).toMatch(
      /GetFullPathName \$2 "\$0\\agente-cpi"[\s\S]*?\$\{GetParent\} "\$2" \$4[\s\S]*?StrCmp "\$4" "\$0" 0 cleanup_refused/
    )
    expect(customUninstall).toMatch(
      /GetFullPathName \$3 "\$0\\AgenteCPI"[\s\S]*?\$\{GetParent\} "\$3" \$4[\s\S]*?StrCmp "\$4" "\$0" 0 cleanup_refused/
    )
    expect(customUninstall.match(/ClearErrors\r?\n\s*GetFullPathName/g)).toHaveLength(3)
    expect(customUninstall.lastIndexOf('cleanup_refused', firstRecursiveDelete)).toBeGreaterThan(-1)
    expect(customUninstall.lastIndexOf('cleanup_refused', firstRecursiveDelete)).toBeLessThan(
      firstRecursiveDelete
    )
    expect(customUninstall).toContain(
      'DetailPrint "Limpeza de dados locais recusada por caminho inválido."'
    )
  })

  it('audits both cleanup roots recursively for reparse points before any recursive deletion', () => {
    const source = readInstallerInclude()
    const customUninstall = extractMacro(source, 'customUnInstallSection')
    const auditFunction = source.match(
      /Function\s+un\.AuditNoReparsePoints\b([\s\S]*?)FunctionEnd/g
    )

    expect(auditFunction, 'the recursive reparse audit must exist exactly once').toHaveLength(1)
    expect(auditFunction![0]).toMatch(/GetFileAttributesW/)
    expect(auditFunction![0]).toMatch(/0x400/i)
    expect(auditFunction![0]).toMatch(/FindFirst/)
    expect(auditFunction![0]).toMatch(/FindNext/)
    expect(auditFunction![0]).toContain('Call un.AuditNoReparsePoints')

    let cursor = 0
    const orderedSteps = [
      'Push "$2"',
      'Call un.AuditNoReparsePoints',
      'Pop $5',
      'Push "$3"',
      'Call un.AuditNoReparsePoints',
      'Pop $6',
      'StrCmp "$5" "1" 0 cleanup_refused',
      'StrCmp "$6" "1" 0 cleanup_refused',
      'RMDir /r "$APPDATA\\agente-cpi"',
      'RMDir /r "$APPDATA\\AgenteCPI"'
    ].map((step) => {
      const index = customUninstall.indexOf(step, cursor)
      cursor = index < 0 ? cursor : index + step.length
      return index
    })

    expect(orderedSteps.every((index) => index >= 0)).toBe(true)
    expect(orderedSteps).toEqual([...orderedSteps].sort((left, right) => left - right))
  })

  it('forbids shared caches, external data, traversal and dynamic recursive deletion targets', () => {
    const source = readInstallerInclude()
    const recursiveDeletes = [...source.matchAll(/RMDir\s+\/r\s+([^\r\n]+)/gi)].map((match) =>
      match[1].trim()
    )

    expect(source).not.toContain('$LOCALAPPDATA\\ms-playwright')
    expect(source).not.toContain('E:\\PDF-AGENTE-CPI')
    expect(source).not.toContain('$INSTDIR\\..')
    expect(source).not.toMatch(/ReadRegStr[\s\S]*RMDir\s+\/r/i)
    expect(recursiveDeletes).toEqual(['"$APPDATA\\agente-cpi"', '"$APPDATA\\AgenteCPI"'])
  })
})
