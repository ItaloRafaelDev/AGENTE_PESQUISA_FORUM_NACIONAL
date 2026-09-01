import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '')

const readme = read('README.md')
const architecture = read('docs/architecture/windows-distribution.md')
const supersededDesign = read('docs/superpowers/specs/2026-07-15-readme-installation-design.md')
const roadmap = read('docs/superpowers/plans/2026-07-27-clean-architecture-refactoring-roadmap.md')
const report = read(
  '.superpowers/sdd/2026-08-13-refactoring-stage-9-distribution-implementation-plan/task-8-report.md'
)
const packageJson = JSON.parse(read('package.json')) as { readonly scripts: Record<string, string> }

const taskDocumentation = [
  readme,
  architecture,
  supersededDesign,
  read('docs/superpowers/specs/2026-08-13-refactoring-stage-9-distribution-design.md'),
  roadmap,
  report
].join('\n')

const fullCpfPattern = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g
const incompatibleSuccessOrCompletionPattern =
  /(?:passou(?:\s+com\s+sucesso)?|sucesso|conclu[ií](?:do|da|dos|das|ram|u)|conclus[ãa]o)/i
const signedArtifactClaimPattern =
  /\b(?:aplicativo|instalador|artefato|distribui[çc][ãa]o|build|pacote)\b[^\r\n.!?]{0,240}\b(?:assinad[ao]|assinatura(?:\s+digital)?|unsigned)\b|\b(?:assinad[ao]|assinatura(?:\s+digital)?|unsigned)\b[^\r\n.!?]{0,240}\b(?:aplicativo|instalador|artefato|distribui[çc][ãa]o|build|pacote)\b/i
const canonicalUnsignedPattern =
  /\b(?:n[ãa]o\b[^\r\n.!?]{0,80}\b(?:assinad[ao]|assinatura(?:\s+digital)?)\b|sem\s+assinatura(?:\s+digital)?\b|unsigned\b)/i
const signedArtifactSubjectPattern =
  /\b(?:aplicativo|instalador|artefato|distribui[çc][ãa]o|build|pacote)\b/i
const signatureClauseBoundaryPattern =
  /\s*(?:[,;]|\b(?:e|mas|por[eé]m|contudo|todavia|enquanto|and|but|however|while)\b)\s*/i

function parsePowerShellBlocks(markdown: string): readonly string[] {
  const executable = process.env.SystemRoot
    ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
  const parser =
    '$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(), [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }'

  return [...markdown.matchAll(/```powershell\r?\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .map((source) => {
      if (/<[^>]+>/.test(source)) {
        return 'Placeholder angular não executável.'
      }

      const parsed = spawnSync(executable, ['-NoProfile', '-Command', parser], {
        encoding: 'utf8',
        input: source,
        windowsHide: true
      })

      return parsed.status === 0 ? '' : parsed.stderr || parsed.stdout
    })
    .filter(Boolean)
}

function assertHonestStage9Status(document: string): void {
  const task6Section =
    document.match(/(?:^|\n)- \*\*Task 6[^\n]*[\s\S]*?(?=\n- \*\*Task 7)/i)?.[0] ?? ''
  const task7Section =
    document.match(/(?:^|\n)- \*\*Task 7[^\n]*[\s\S]*?(?=\n- |\n## |$)/i)?.[0] ?? ''

  expect(document).toMatch(
    /Task 5[\s\S]{0,300}Agente-CPI-1\.0\.0-Setup-x64\.exe[\s\S]{0,200}(?:nunca executado|never executed)/i
  )
  expect(task6Section).toContain('DONE_AUTOMATED_GATE_ONLY')
  expect(task6Section).toMatch(
    /pipeline final[\s\S]{0,80}smoke[\s\S]{0,80}ZIP[\s\S]{0,80}hashes[\s\S]{0,120}n[ãa]o (?:foram |permanecem )?verificados/i
  )
  expect(task7Section).toContain('DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVER')
  expect(task7Section).toMatch(/duas execu[çc][õo]es[\s\S]{0,240}idempot[êe]ncia/i)
  expect(task7Section).toMatch(/idempot[êe]ncia[\s\S]{0,160}n[ãa]o (?:foi |permanece )?verificada/i)

  for (const taskSection of [task6Section, task7Section]) {
    expect(taskSection).not.toMatch(incompatibleSuccessOrCompletionPattern)
  }

  expect(document).toMatch(/aceita[çc][ãa]o manual Windows[\s\S]{0,160}permanece pendente/i)
}

function assertNoSignedArtifactClaims(document: string): void {
  for (const sentenceOrLine of document.split(/\r?\n|(?<=[.!?])\s+/)) {
    let activeSubject = ''

    for (const clause of sentenceOrLine.split(signatureClauseBoundaryPattern)) {
      activeSubject = clause.match(signedArtifactSubjectPattern)?.[0] ?? activeSubject
      const subjectClause = signedArtifactSubjectPattern.test(clause)
        ? clause
        : `${activeSubject} ${clause}`

      if (signedArtifactClaimPattern.test(subjectClause)) {
        expect(subjectClause).toMatch(canonicalUnsignedPattern)
      }
    }
  }
}

describe('Windows distribution documentation', () => {
  it('documents the supported operator and developer workflow with real commands', () => {
    expect(readme).toContain('Windows 10 e Windows 11 x64')
    expect(readme).toContain('Node.js 24')
    expect(readme).toContain('pnpm@10.28.1')

    for (const command of [
      'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1',
      'pnpm dev',
      'pnpm run validate',
      'pnpm run build',
      'pnpm run test:coverage',
      'pnpm run distribution:windows'
    ]) {
      expect(readme).toContain(command)
    }

    expect(readme).toContain('Agente-CPI-${releaseVersion}-Setup-x64.exe')
    expect(readme).toContain('Agente-CPI-${releaseVersion}-Windows-x64.zip')
    expect(readme).toContain('SHA256SUMS.txt')
    expect(readme).toContain('Get-FileHash')

    expect(parsePowerShellBlocks(readme)).toEqual([])
    expect(readme).not.toMatch(/```powershell[\s\S]*?<[^>]+>[\s\S]*?```/i)
    expect(readme).toContain('pnpm run smoke:packaged -- "--executable=$packagedExecutable"')

    const commandExamples = [...readme.matchAll(/```powershell\r?\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .join('\n')
    const documentedScripts = [
      ...commandExamples.matchAll(/\bpnpm(?:\s+run)?\s+([a-z][\w:-]*)/gi)
    ].map((match) => match[1])

    for (const scriptName of new Set(documentedScripts)) {
      if (scriptName === 'install' || scriptName === 'exec') continue
      expect(packageJson.scripts, `script pnpm documentado: ${scriptName}`).toHaveProperty(
        scriptName
      )
    }

    for (const path of [
      'scripts/setup-windows.ps1',
      'scripts/build-windows-distribution.ps1',
      'scripts/smoke-packaged-app.ts',
      'docs/architecture/windows-distribution.md'
    ]) {
      expect(existsSync(path), `arquivo documentado: ${path}`).toBe(true)
    }
  })

  it('sets safe installation, operation, update and uninstall expectations', () => {
    expect(readme).toMatch(/uso autorizado/i)
    expect(readme).toMatch(/assistid[ao]/i)
    expect(readme).toMatch(
      /rede[\s\S]{0,160}somente[\s\S]{0,160}revis[ãa]o fixada[\s\S]{0,160}ausente[\s\S]{0,160}cache/i
    )
    expect(readme).toMatch(
      /aborta a instala[çc][ãa]o[\s\S]{0,160}tenta[\s\S]{0,160}rollback[\s\S]{0,240}registra[\s\S]{0,160}n[ãa]o (?:foi|for|puder ser) conclu[ií]d/i
    )
    expect(readme).toMatch(/não assinad[ao][\s\S]{0,240}SmartScreen/i)
    expect(readme).toMatch(/login manual[\s\S]{0,240}CPI Central[\s\S]{0,240}DeskData/i)
    expect(readme).toContain('PARADO')
    expect(readme).toContain('AGUARDANDO_LOGIN')
    expect(readme).toContain('PAUSADO')
    expect(readme).toContain('ERRO_E1')
    expect(readme).toMatch(/histórico[\s\S]{0,240}PDF/i)
    expect(readme).toMatch(/atualiza[çc][ãa]o manual/i)
    expect(readme).toMatch(/instala[çc][ãa]o\s+por\s+cima|instalar\s+por\s+cima/i)

    expect(readme).toContain('%APPDATA%\\agente-cpi')
    expect(readme).toContain('%APPDATA%\\AgenteCPI')
    expect(readme).toMatch(/desinstala[çc][ãa]o[\s\S]{0,500}preserv/i)
    expect(readme).toMatch(/PDFs externos[\s\S]{0,240}(sobrevivem|preservad)/i)
    expect(readme).toMatch(/cache global do Playwright[\s\S]{0,240}(sobrevive|preservad)/i)
  })

  it('documents recovery without claiming or recommending unsafe capabilities', () => {
    for (const topic of [
      'better-sqlite3',
      'Corepack',
      'Chromium',
      'proxy',
      'SmartScreen',
      'SQLite bloqueado',
      'perfil do navegador',
      'sessão',
      'E1',
      'PDF não encontrado'
    ]) {
      expect(readme).toMatch(new RegExp(topic, 'i'))
    }

    expect(readme).toMatch(
      /macOS, Linux, ARM64, Windows Server e distribui[çc][ãa]o port[aá]til[^.]*n[ãa]o s[ãa]o suportad/i
    )
    expect(readme).not.toMatch(/https?:\/\//i)
    expect(readme).not.toMatch(
      /(?:desativ|desabilit)[^\n.]{0,100}(?:antiv[ií]rus|SmartScreen|TLS|pol[ií]tica de execu[çc][ãa]o)/i
    )
    expect(readme).toMatch(/termina sem abrir a aplica[çc][ãa]o/i)
    expect(readme).toMatch(/fa[çc]a o login manual/i)
    expect(readme).toMatch(/inicie o agente somente quando/i)
    expect(readme).not.toMatch(
      /(?:abre|abrir[aá]|login|inicia|iniciar[aá]|start)[^\n.]{0,80}autom[aá]tic/i
    )
    expect(readme).not.toMatch(/auto-?update|atualiza[çc][ãa]o autom[aá]tica/i)
    assertNoSignedArtifactClaims(readme)
    expect(readme).not.toMatch(
      /(?:remov|apag|exclu)[^\n.]{0,100}(?:PDFs? externos?|cache global do Playwright)/i
    )
  })

  it('records implemented ownership and the automated/manual boundary', () => {
    for (const ownership of [
      'build/application-identity.json → processo principal e electron-builder',
      'parser de startup → configuração de caminhos → runtime',
      'builder → aplicação desempacotada → smoke → NSIS prepackaged → ZIP e SHA-256',
      'helper do instalador → cache global do Playwright',
      '%APPDATA%\\agente-cpi',
      '%APPDATA%\\AgenteCPI'
    ]) {
      expect(architecture).toContain(ownership)
    }

    expect(architecture).toMatch(
      /somente[\s\S]{0,120}%APPDATA%\\agente-cpi[\s\S]{0,120}%APPDATA%\\AgenteCPI/i
    )
    expect(architecture).toMatch(/automatizad[ao][\s\S]{0,300}manual/i)
    expect(architecture).toMatch(/CPI Central[\s\S]{0,120}DeskData[\s\S]{0,160}manual/i)
    expect(architecture).toMatch(
      /tenta[\s\S]{0,160}rollback[\s\S]{0,240}registra[\s\S]{0,160}n[ãa]o (?:foi|for|puder ser) conclu[ií]d/i
    )
    expect(architecture).toMatch(
      /rede[\s\S]{0,160}somente[\s\S]{0,160}revis[ãa]o fixada[\s\S]{0,160}ausente[\s\S]{0,160}cache/i
    )
  })

  it('supersedes the historical design and keeps Stage 9 status honest', () => {
    const stage9SpecPath =
      'docs/superpowers/specs/2026-08-13-refactoring-stage-9-distribution-design.md'

    expect(existsSync(stage9SpecPath)).toBe(true)
    expect(supersededDesign.slice(0, 800)).toContain('SUPERSEDED')
    expect(supersededDesign.slice(0, 800)).toContain(
      '(2026-08-13-refactoring-stage-9-distribution-design.md)'
    )
    expect(supersededDesign.slice(0, 800)).toMatch(
      /cross-platform[\s\S]{0,160}n[ãa]o (?:s[ãa]o|é) mais v[aá]lid/i
    )

    assertHonestStage9Status(roadmap)
    assertHonestStage9Status(report)
    expect(roadmap).not.toMatch(
      /Task 6[^\n]*(?:pipeline|smoke)[^\n]*(?:passou|conclu[ií]d|sucesso)/i
    )
    expect(roadmap).not.toMatch(/Task 7[^\n]*idempot[êe]ncia[^\n]*(?:passou|comprovad)/i)
    expect(roadmap).not.toMatch(/idempot[êe]ncia verificad[ao]/i)
  })

  it('detects invalid PowerShell, privacy, waiver and signature claim mutations', () => {
    const invalidPowerShell = readme.replace('$releaseVersion', '<versão>')
    const syntheticCpf = `${['123', '456', '789'].join('.')}-${['0', '0'].join('')}`
    const softenedStatus = roadmap.replace(
      '**Task 7 — `DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVER`:',
      '**Task 7 — `DONE`:'
    )
    const falseTask6Success = roadmap.replace(
      'DONE_AUTOMATED_GATE_ONLY`:',
      'DONE_AUTOMATED_GATE_ONLY`:\n  O pipeline passou com sucesso.'
    )
    const falseTask7Conclusion = roadmap.replace(
      'DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVER`:',
      'DONE_AUTOMATED_GATE_ONLY_WITH_E2E_WAIVER`:\n  A execução foi concluída.'
    )

    expect(parsePowerShellBlocks(invalidPowerShell)).not.toEqual([])
    expect(taskDocumentation.match(fullCpfPattern)).toBeNull()
    expect(`${taskDocumentation}\n${syntheticCpf}`.match(fullCpfPattern)).toEqual([syntheticCpf])
    expect(() => assertHonestStage9Status(softenedStatus)).toThrow()
    expect(() => assertHonestStage9Status(falseTask6Success)).toThrow()
    expect(() => assertHonestStage9Status(falseTask7Conclusion)).toThrow()

    for (const signedClaim of [
      'Esta distribuição é assinada.',
      'Este build é assinado.',
      'Este pacote é assinado.',
      'O pacote vem com assinatura digital.',
      'A distribuição final é assinada.',
      'A distribuição é assinada, mas o pacote não é assinado.',
      'O aplicativo é assinado; o instalador não é assinado.',
      'O artefato é assinado e o build não é assinado.'
    ]) {
      expect(() => assertNoSignedArtifactClaims(`${readme}\n${signedClaim}`)).toThrow()
    }

    for (const canonicalUnsignedClaim of [
      'Esta distribuição não é assinada.',
      'O pacote vem sem assinatura.',
      'The build is unsigned.'
    ]) {
      expect(() =>
        assertNoSignedArtifactClaims(`${readme}\n${canonicalUnsignedClaim}`)
      ).not.toThrow()
    }
  })
})
