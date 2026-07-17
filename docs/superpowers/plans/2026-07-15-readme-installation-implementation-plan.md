# README and Reproducible Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete `README.md` and a fail-fast `scripts/setup-windows.ps1` so an authorized operator can install the Agente CPI from Releases or from a Git clone, with native Electron dependencies, Playwright Chromium, tests, validation, and build prepared consistently.

**Architecture:** Documentation is the source of truth for user-facing installation and operation. A PowerShell setup script performs only deterministic project preparation on Windows, while Vitest source guards verify that the README and script retain the required security, ABI, and no-auto-run properties. Existing project commands remain authoritative; the setup script invokes them instead of duplicating application logic.

**Tech Stack:** Windows PowerShell, Git, Node.js, Corepack, pnpm, Electron 39, electron-vite, `@electron/rebuild`, `better-sqlite3`, Playwright Chromium, Vitest, TypeScript.

## Global Constraints

- Windows 10/11 x64 is the only validated platform.
- macOS and Linux must be labeled experimental.
- Installation must support both Releases and `git clone <URL_DO_REPOSITORIO>`.
- Login is manual; credentials must not be stored in source files or `.env`.
- `.env` may contain only non-sensitive configuration actually consumed by the project.
- The setup script must stop on the first failure.
- The setup script must not delete browser profiles, databases, PDFs, downloads, logs, or screenshots.
- The setup script must not execute `pnpm dev`, start the agent, open a research, or submit a portal action.
- `better-sqlite3` must remain compiled for the Electron ABI.
- SQLite tests must run through the project command `pnpm test`, which uses the Node runtime embedded in Electron.
- Do not use `pnpm exec vitest` as the documented test command.
- No real CPF, name, credential, cookie, token, portal response, or report content may appear in the documentation or tests.
- No Git commit, branch, or push commands are part of this implementation.
- Existing application behavior, dashboard controls, research flow, and classification rules are outside scope.

---

## File Map

- Create `tests/unit/documentation/readme-installation-guard.test.ts`
  - Static contract for README sections, supported-platform wording, security wording, commands, and troubleshooting.
- Create `tests/unit/scripts/setup-windows-guard.test.ts`
  - Static contract for fail-fast PowerShell behavior, native rebuild, Chromium installation, validation, build, and forbidden actions.
- Create `scripts/setup-windows.ps1`
  - Deterministic Windows preparation script.
- Create or replace `README.md`
  - User-final and developer installation and operating guide.
- Modify `.gitignore`
  - Add only missing local-data exclusions without removing existing entries.
- Optionally modify `package.json`
  - Add `packageManager` only when the installed pnpm version can be read and the field is currently absent.
- Preserve `scripts/run-vitest-electron.ts`
  - Existing test launcher that runs Vitest with `ELECTRON_RUN_AS_NODE=1`.

---

### Task 31: Add Failing Documentation and Setup Guards

**Files:**

- Create: `tests/unit/documentation/readme-installation-guard.test.ts`
- Create: `tests/unit/scripts/setup-windows-guard.test.ts`
- Test: the two files above

**Interfaces:**

- Consumes: repository root resolved with `process.cwd()`
- Produces: static contracts for `README.md`, `scripts/setup-windows.ps1`, `.gitignore`, and `package.json`

- [ ] **Step 1: Create the README guard test**

Create `tests/unit/documentation/readme-installation-guard.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readmePath = join(root, 'README.md')
const gitignorePath = join(root, '.gitignore')

function readText(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('README de instalação', () => {
  const source = readText(readmePath)

  it('documenta os dois métodos de distribuição', () => {
    expect(source).toContain('Instalação pelo executável')
    expect(source).toContain('Instalação pelo código-fonte')
    expect(source).toContain('git clone <URL_DO_REPOSITORIO>')
    expect(source).toContain('Releases')
  })

  it('declara somente Windows como plataforma validada', () => {
    expect(source).toContain('Windows 10/11 x64')
    expect(source).toMatch(/macOS e Linux.*experimentais/is)
    expect(source).not.toMatch(/macOS e Linux.*totalmente suportados/is)
  })

  it('documenta preparação, testes e build oficiais', () => {
    expect(source).toContain('.\\scripts\\setup-windows.ps1')
    expect(source).toContain('pnpm dev')
    expect(source).toContain('pnpm test')
    expect(source).toContain('pnpm run validate')
    expect(source).toContain('pnpm run build')
    expect(source).toContain('pnpm run build:win')
    expect(source).not.toContain('pnpm exec vitest')
  })

  it('documenta login manual e não orienta credenciais em arquivo', () => {
    expect(source).toMatch(/login manual/i)
    expect(source).toContain('Login concluído — continuar')
    expect(source).not.toMatch(/CPI_(USER|USERNAME|PASSWORD)\s*=/i)
    expect(source).not.toMatch(/DESKDATA_(USER|USERNAME|PASSWORD)\s*=/i)
  })

  it('documenta o conflito de ABI e a correção oficial', () => {
    expect(source).toContain('better-sqlite3')
    expect(source).toContain('NODE_MODULE_VERSION')
    expect(source).toContain('@electron/rebuild')
    expect(source).toContain('ELECTRON_RUN_AS_NODE')
  })

  it('documenta abertura parada e política E1', () => {
    expect(source).toMatch(/abre.*PARADO/is)
    expect(source).toMatch(/não inicia.*pesquisa/is)
    expect(source).toContain('ERRO_E1')
    expect(source).toMatch(/nenhuma nova pesquisa/is)
  })

  it('documenta dados locais, backup e desinstalação', () => {
    expect(source).toContain('%APPDATA%')
    expect(source).toContain('SQLite')
    expect(source).toContain('Backup')
    expect(source).toContain('Desinstalação')
  })

  it('mantém dados operacionais fora do Git', () => {
    const gitignore = readText(gitignorePath)

    for (const entry of [
      'node_modules/',
      'coverage/',
      '*.db',
      '*.sqlite',
      '*.sqlite3',
      'browser-profile/',
      'downloads/',
      'logs/'
    ]) {
      expect(gitignore).toContain(entry)
    }
  })

  it('não contém dados pessoais ou credenciais de exemplo', () => {
    expect(source).not.toMatch(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)
    expect(source).not.toMatch(/senha\s*[:=]\s*\S+/i)
    expect(source).not.toMatch(/token\s*[:=]\s*\S+/i)
  })
})
```

- [ ] **Step 2: Create the setup-script guard test**

Create `tests/unit/scripts/setup-windows-guard.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'scripts', 'setup-windows.ps1'), 'utf8')

describe('setup-windows.ps1', () => {
  it('usa modo estrito e interrupção imediata', () => {
    expect(source).toContain('Set-StrictMode -Version Latest')
    expect(source).toContain('$ErrorActionPreference = "Stop"')
    expect(source).toContain('$PSNativeCommandUseErrorActionPreference = $false')
    expect(source).toContain('function Invoke-CheckedCommand')
    expect(source).toContain('$LASTEXITCODE')
  })

  it('valida ambiente e arquivos do projeto', () => {
    expect(source).toContain('$IsWindows')
    expect(source).toContain('[Environment]::Is64BitOperatingSystem')
    expect(source).toContain('package.json')
    expect(source).toContain('pnpm-lock.yaml')
    expect(source).toContain('Get-Command git')
    expect(source).toContain('Get-Command node')
    expect(source).toContain('Get-Command corepack')
  })

  it('instala dependências de forma reproduzível', () => {
    expect(source).toContain('pnpm install --frozen-lockfile')
    expect(source).toContain('pnpm run rebuild:native')
    expect(source).toContain('pnpm run playwright:install')
  })

  it('testa better-sqlite3 no runtime do Electron', () => {
    expect(source).toContain('ELECTRON_RUN_AS_NODE')
    expect(source).toContain("require('better-sqlite3')")
    expect(source).toContain("new Database(':memory:')")
  })

  it('executa testes, validação e build', () => {
    expect(source).toContain('pnpm test')
    expect(source).toContain('pnpm run validate')
    expect(source).toContain('pnpm run build')
  })

  it('não inicia aplicação ou agente', () => {
    expect(source).not.toMatch(/Invoke-CheckedCommand\s+['"]pnpm dev/i)
    expect(source).not.toMatch(/Invoke-CheckedCommand\s+['"]pnpm start/i)
    expect(source).not.toContain('flow:run-continuous')
    expect(source).not.toContain('control.start')
  })

  it('não contém exclusão destrutiva de dados locais', () => {
    expect(source).not.toMatch(/Remove-Item.*browser-profile/is)
    expect(source).not.toMatch(/Remove-Item.*\.(db|sqlite|sqlite3)/is)
    expect(source).not.toMatch(/Remove-Item.*downloads/is)
    expect(source).not.toMatch(/Remove-Item.*\.pdf/is)
  })

  it('não solicita ou grava credenciais', () => {
    expect(source).not.toMatch(/Read-Host.*(senha|password|credencial)/i)
    expect(source).not.toMatch(/(CPI|DESKDATA)_(USER|PASSWORD)\s*=/i)
  })
})
```

- [ ] **Step 3: Run the focused tests and verify the RED state**

Run:

```powershell
pnpm test -- `
  tests/unit/documentation/readme-installation-guard.test.ts `
  tests/unit/scripts/setup-windows-guard.test.ts
```

Expected:

- FAIL because `scripts/setup-windows.ps1` does not exist.
- The README test may also fail because the existing README does not contain the required installation contract.
- No application or portal should be opened.

---

### Task 32: Implement the Fail-Fast Windows Setup Script

**Files:**

- Create: `scripts/setup-windows.ps1`
- Test: `tests/unit/scripts/setup-windows-guard.test.ts`

**Interfaces:**

- Consumes:
  - `package.json`
  - `pnpm-lock.yaml`
  - project scripts `rebuild:native`, `playwright:install`, `test`, `validate`, and `build`
- Produces:
  - prepared `node_modules`
  - Electron-compatible `better-sqlite3`
  - installed Playwright Chromium
  - validated development build
  - no application process and no research action

- [ ] **Step 1: Create the setup script**

Create `scripts/setup-windows.ps1`:

```powershell
Set-StrictMode -Version Latest

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Write-Section {
  param(
    [Parameter(Mandatory)]
    [string] $Title
  )

  Write-Host ""
  Write-Host "=== $Title ==="
}

function Assert-Command {
  param(
    [Parameter(Mandatory)]
    [string] $Name,

    [Parameter(Mandatory)]
    [string] $InstallMessage
  )

  if ($null -eq (
    Get-Command $Name -ErrorAction SilentlyContinue
  )) {
    throw "$Name não foi encontrado. $InstallMessage"
  }
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory)]
    [string] $Description,

    [Parameter(Mandatory)]
    [scriptblock] $Command
  )

  Write-Host ""
  Write-Host $Description

  & $Command

  if ($LASTEXITCODE -ne 0) {
    throw "$Description falhou. Código: $LASTEXITCODE"
  }
}

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot ".."
)

Set-Location $projectRoot

Write-Section "PREPARAÇÃO DO AGENTE CPI"

if (-not $IsWindows) {
  throw "Este script foi validado apenas no Windows."
}

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "O Agente CPI requer Windows x64."
}

foreach ($requiredFile in @(
  "package.json",
  "pnpm-lock.yaml"
)) {
  if (-not (
    Test-Path -LiteralPath (
      Join-Path $projectRoot $requiredFile
    )
  )) {
    throw "Arquivo obrigatório ausente: $requiredFile"
  }
}

Assert-Command `
  -Name "git" `
  -InstallMessage "Instale o Git e abra um novo PowerShell."

Assert-Command `
  -Name "node" `
  -InstallMessage "Instale uma versão compatível do Node.js e abra um novo PowerShell."

Assert-Command `
  -Name "corepack" `
  -InstallMessage "Instale/ative o Corepack fornecido pelo Node.js."

Write-Section "VERSÕES"

Invoke-CheckedCommand `
  -Description "Consultando Git..." `
  -Command { git --version }

Invoke-CheckedCommand `
  -Description "Consultando Node.js..." `
  -Command { node --version }

Invoke-CheckedCommand `
  -Description "Ativando Corepack..." `
  -Command { corepack enable }

if ($null -eq (
  Get-Command pnpm -ErrorAction SilentlyContinue
)) {
  $packageManager = node -e @'
const packageJson = require('./package.json')

if (
  typeof packageJson.packageManager !== 'string' ||
  !packageJson.packageManager.startsWith('pnpm@')
) {
  process.exit(2)
}

process.stdout.write(packageJson.packageManager)
'@

  if ($LASTEXITCODE -ne 0) {
    throw @"
pnpm não foi encontrado e package.json não define packageManager.
Na máquina de origem, execute 'pnpm --version' e registre
'packageManager': 'pnpm@VERSAO' no package.json.
"@
  }

  Invoke-CheckedCommand `
    -Description "Ativando $packageManager..." `
    -Command {
      corepack prepare $packageManager --activate
    }
}

Invoke-CheckedCommand `
  -Description "Consultando pnpm..." `
  -Command { pnpm --version }

$nodeMajor = [int](
  node -p "Number(process.versions.node.split('.')[0])"
)

if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível consultar a versão principal do Node.js."
}

if ($nodeMajor -lt 22) {
  throw "Node.js 22 ou superior é necessário. Detectado: $nodeMajor."
}

Write-Section "DEPENDÊNCIAS"

Invoke-CheckedCommand `
  -Description "Instalando dependências pelo lockfile..." `
  -Command {
    pnpm install --frozen-lockfile
  }

Write-Section "MÓDULO NATIVO DO ELECTRON"

Invoke-CheckedCommand `
  -Description "Reconstruindo better-sqlite3 para Electron..." `
  -Command {
    pnpm run rebuild:native
  }

Write-Section "CHROMIUM DO PLAYWRIGHT"

Invoke-CheckedCommand `
  -Description "Instalando Chromium..." `
  -Command {
    pnpm run playwright:install
  }

Write-Section "TESTE NATIVO"

$previousElectronRunAsNode = $env:ELECTRON_RUN_AS_NODE

try {
  $env:ELECTRON_RUN_AS_NODE = "1"

  Invoke-CheckedCommand `
    -Description "Testando SQLite dentro do Electron..." `
    -Command {
      pnpm exec electron -e @'
const Database = require('better-sqlite3')
const db = new Database(':memory:')
const row = db.prepare('SELECT 1 AS ok').get()
db.close()

if (!row || row.ok !== 1) {
  process.exit(2)
}

console.log(
  'Electron=' + process.versions.electron +
  ' | Node=' + process.versions.node +
  ' | ABI=' + process.versions.modules +
  ' | better-sqlite3=OK'
)
'@
    }
}
finally {
  if ($null -eq $previousElectronRunAsNode) {
    Remove-Item `
      Env:ELECTRON_RUN_AS_NODE `
      -ErrorAction SilentlyContinue
  }
  else {
    $env:ELECTRON_RUN_AS_NODE =
      $previousElectronRunAsNode
  }
}

Write-Section "TESTES"

Invoke-CheckedCommand `
  -Description "Executando testes oficiais..." `
  -Command {
    pnpm test
  }

Write-Section "VALIDAÇÃO"

Invoke-CheckedCommand `
  -Description "Executando validação global..." `
  -Command {
    pnpm run validate
  }

Write-Section "BUILD"

Invoke-CheckedCommand `
  -Description "Gerando build de desenvolvimento..." `
  -Command {
    pnpm run build
  }

Write-Section "CONCLUÍDO"

Write-Host "Ambiente preparado sem iniciar o aplicativo."
Write-Host ""
Write-Host "Desenvolvimento:"
Write-Host "  pnpm dev"
Write-Host ""
Write-Host "Instalador Windows:"
Write-Host "  pnpm run build:win"
Write-Host ""
Write-Host "Aplicativo descompactado:"
Write-Host "  pnpm run build:unpack"
```

- [ ] **Step 2: Run the setup-script guard**

Run:

```powershell
pnpm test -- `
  tests/unit/scripts/setup-windows-guard.test.ts
```

Expected:

```text
1 test file passed
8 tests passed
```

- [ ] **Step 3: Parse the PowerShell script without executing installation**

Run:

```powershell
$errors = $null

[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path ".\scripts\setup-windows.ps1"),
  [ref] $null,
  [ref] $errors
) | Out-Null

if ($errors.Count -gt 0) {
  $errors | Format-List
  throw "O setup-windows.ps1 contém erro de sintaxe."
}
```

Expected: no output and exit code 0.

---

### Task 33: Add the Complete README and Git Ignore Protections

**Files:**

- Create or replace: `README.md`
- Modify: `.gitignore`
- Test: `tests/unit/documentation/readme-installation-guard.test.ts`

**Interfaces:**

- Consumes: actual package scripts and current runtime behavior
- Produces: installation, operating, build, privacy, troubleshooting, and deployment documentation

- [ ] **Step 1: Add missing `.gitignore` entries without deleting current rules**

Ensure `.gitignore` contains each exact line below. Preserve all existing entries and do not duplicate an entry already present:

```gitignore
node_modules/
out/
dist/
release/
coverage/

.env
.env.*
!.env.example

*.db
*.db-shm
*.db-wal
*.sqlite
*.sqlite-shm
*.sqlite-wal
*.sqlite3
*.sqlite3-shm
*.sqlite3-wal

browser-profile/
downloads/
screenshots/
logs/
```

Do not add a global `*.pdf` rule when the repository contains intentional PDF fixtures. Ignore only the actual runtime download directory.

- [ ] **Step 2: Create the root README**

Create `README.md` with this content:

````markdown
# Agente CPI

Aplicativo desktop para execução controlada do fluxo autorizado de pesquisas da CPI Central e da DeskData, com dashboard em tempo real, fila contínua, classificação, geração e anexação de PDF, histórico local e política de interrupção imediata em erro E1.

> **Uso restrito:** este projeto deve ser utilizado somente por operadores autorizados, dentro da finalidade contratada e de acordo com as políticas dos sistemas acessados. Não publique credenciais, cookies, tokens, perfis do navegador, bancos SQLite, PDFs ou dados pessoais produzidos durante a operação.

## Funcionalidades

- abertura manual do agente pelo dashboard;
- reutilização do navegador e das sessões autenticadas;
- login manual na CPI Central e na DeskData;
- processamento sequencial de uma pesquisa por vez;
- espera automática quando a fila estiver vazia;
- acompanhamento de etapa, fila, ciclos e contagem regressiva;
- pausa, retomada e parada em limites seguros;
- classificação do resultado;
- geração, download, anexação e gravação do PDF;
- histórico persistente em SQLite;
- abertura do PDF e exibição do arquivo na pasta;
- CPF mascarado na interface;
- bloqueio de nova pesquisa após `ERRO_E1`.

## Fluxo operacional

1. O aplicativo abre em `PARADO`.
2. Nenhuma pesquisa é iniciada automaticamente.
3. O operador seleciona **Iniciar agente**.
4. O aplicativo abre ou reutiliza o navegador persistente.
5. Quando necessário, o estado muda para `AGUARDANDO_LOGIN`.
6. O operador faz login manual na CPI Central e na DeskData.
7. O operador seleciona **Login concluído — continuar**.
8. O agente processa uma pesquisa por vez.
9. Quando a fila está vazia, o dashboard mostra a contagem regressiva para a próxima verificação.
10. Em `ERRO_E1`, nenhuma nova pesquisa é iniciada e o navegador permanece aberto para diagnóstico.

## Plataformas

### Validada

- Windows 10/11 x64.

### Experimentais

- macOS;
- Linux.

O fluxo integral dos portais, a abertura de arquivos, os módulos nativos e os instaladores ainda não foram validados em macOS ou Linux. Não considere essas plataformas prontas para produção sem testes completos no sistema de destino.

## Instalação pelo executável

Este método é destinado ao usuário final.

1. Acesse a área de **Releases** do repositório.
2. Baixe o instalador correspondente ao Windows x64.
3. Feche versões anteriores do Agente CPI.
4. Execute o instalador.
5. Caso o Windows SmartScreen seja exibido, confirme a origem do arquivo antes de prosseguir.
6. Abra o Agente CPI.
7. Confirme que o dashboard iniciou em `PARADO`.

Endereço do repositório:

```text
<URL_DO_REPOSITORIO>
```
````

A instalação não exige que credenciais sejam gravadas em arquivos. O login nos portais é manual.

## Instalação pelo código-fonte

Este método é destinado ao desenvolvimento e à implantação técnica.

### Requisitos

- Windows 10/11 x64;
- Git;
- Node.js 22 ou superior, compatível com as dependências do projeto;
- Corepack;
- PowerShell 7 recomendado;
- acesso autorizado à CPI Central;
- acesso autorizado à DeskData;
- conexão com a internet.

Quando não existir um binário precompilado do `better-sqlite3`, a compilação local também poderá exigir:

- Python;
- Visual Studio Build Tools com ferramentas de C++ para desktop;
- Windows SDK.

### Clonar

```powershell
git clone <URL_DO_REPOSITORIO>
Set-Location ".\agente-cpi"
```

### Preparação automática no Windows

```powershell
Set-ExecutionPolicy `
  -Scope Process `
  -ExecutionPolicy Bypass

.\scripts\setup-windows.ps1
```

O script:

- valida Windows x64;
- verifica Git, Node.js, Corepack e pnpm;
- instala as dependências pelo lockfile;
- reconstrói o `better-sqlite3` para o Electron;
- instala o Chromium usado pelo Playwright;
- testa SQLite dentro do Electron;
- executa os testes;
- executa a validação global;
- gera o build;
- para imediatamente no primeiro erro.

O script não abre o aplicativo, não inicia o agente, não realiza pesquisas, não solicita credenciais e não apaga dados locais.

### Preparação manual

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm run rebuild:native
pnpm run playwright:install
pnpm test
pnpm run validate
pnpm run build
```

## Executar em desenvolvimento

```powershell
pnpm dev
```

Confirme os seguintes pontos:

- o dashboard abre;
- o estado inicial é `PARADO`;
- nenhuma janela de pesquisa é iniciada antes de **Iniciar agente**;
- o histórico carrega sem exibir CPF completo.

## Configuração inicial e login manual

1. Abra o aplicativo.
2. Selecione **Iniciar agente**.
3. Aguarde a abertura do navegador.
4. Faça login manual na CPI Central.
5. Deixe aberta a fila autenticada esperada pelo aplicativo.
6. Faça login manual na DeskData.
7. Deixe aberta a página de consulta de pessoas.
8. Volte ao dashboard.
9. Selecione **Login concluído — continuar**.

Não armazene usuário ou senha da CPI Central ou da DeskData no `.env`, no código, no README, em scripts ou em arquivos versionados.

O perfil persistente do navegador conserva a sessão localmente. Proteja a conta do Windows e não compartilhe esse perfil.

## Controles do dashboard

### Iniciar agente

Abre ou reutiliza o navegador e inicia o fluxo somente após a ação do operador.

### Pausar

Se não houver ciclo ativo, pausa imediatamente. Quando uma pesquisa já estiver em andamento, conclui as operações seguras do ciclo e pausa antes de iniciar a próxima.

### Continuar

Retoma o agente e reutiliza o navegador e as sessões quando ainda forem válidos.

### Parar

Se não houver ciclo ativo, para imediatamente. Quando uma pesquisa estiver em andamento, conclui o limite seguro definido pelo runtime e não inicia outra.

### Login concluído — continuar

Valida a sessão da CPI Central e da DeskData. O processamento somente continua quando as duas sessões esperadas forem reconhecidas.

## Estados principais

- `PARADO`: agente sem execução.
- `INICIANDO`: preparação do navegador e do runtime.
- `AGUARDANDO_LOGIN`: uma ou ambas as sessões precisam de login manual.
- `EXECUTANDO`: ciclo de pesquisa em andamento.
- `OCIOSO`: fila sem pesquisa disponível; aguardando próxima verificação.
- `PAUSANDO`: pausa solicitada durante um ciclo.
- `PAUSADO`: nenhuma nova pesquisa será iniciada até a retomada.
- `PARANDO`: parada solicitada durante um ciclo.
- `ERRO_E1`: erro bloqueante; nenhuma nova pesquisa será iniciada.

## Histórico e PDFs

O histórico é persistido localmente em SQLite e pode conter:

- CPF mascarado;
- classificação;
- resultado gravado na CPI;
- status;
- horários;
- duração;
- caminho do PDF;
- etapa ou erro seguro.

O histórico não deve armazenar CPF completo, credenciais ou o conteúdo integral da pesquisa.

O botão **Limpar histórico** remove registros do histórico. Ele não deve apagar os PDFs.

Quando o arquivo existir, use:

- **Abrir PDF** para abrir no visualizador padrão;
- **Mostrar na pasta** para revelar o arquivo no gerenciador do sistema.

Quando o arquivo não existir, o dashboard deve informar `PDF não encontrado` sem encerrar o aplicativo.

## Comandos do projeto

```powershell
pnpm dev
pnpm test
pnpm run test:watch
pnpm run test:coverage
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm run validate
pnpm run build
pnpm run build:unpack
pnpm run build:win
pnpm run playwright:install
pnpm run rebuild:native
```

Use `pnpm test` para executar os testes.

Não use o comando direto `pnpm exec` com o CLI do Vitest para os testes que carregam SQLite. O projeto inicia o Vitest com o Node incorporado ao Electron para manter a mesma ABI do módulo nativo.

## `better-sqlite3` e `NODE_MODULE_VERSION`

`better-sqlite3` contém um arquivo nativo chamado `better_sqlite3.node`. Esse arquivo precisa ser compilado para a ABI do runtime que o carrega.

O aplicativo usa a ABI do Electron. O Node.js instalado no terminal pode usar outra ABI. Quando elas não coincidem, ocorre um erro semelhante a:

```text
The module was compiled against a different Node.js version
NODE_MODULE_VERSION
```

Correção oficial do projeto:

```powershell
pnpm run rebuild:native
pnpm test
```

O rebuild usa `@electron/rebuild`. Os testes usam `ELECTRON_RUN_AS_NODE=1` por meio do executor do projeto.

Não tente corrigir alternando repetidamente entre `pnpm rebuild better-sqlite3` no Node local e o rebuild para Electron. Isso substitui o mesmo binário nativo por versões incompatíveis.

## Build

### Build da aplicação

```powershell
pnpm run build
```

### Aplicativo descompactado

```powershell
pnpm run build:unpack
```

### Instalador Windows

```powershell
pnpm run build:win
```

Consulte a configuração do `electron-builder` para localizar o diretório final de saída.

Antes de distribuir um instalador:

```powershell
pnpm run validate
pnpm run build:win
```

Teste o instalador em uma máquina ou usuário do Windows diferente do ambiente de desenvolvimento.

## Atualização pelo código-fonte

Pare o agente e feche o aplicativo antes de atualizar.

```powershell
git pull
pnpm install --frozen-lockfile
pnpm run rebuild:native
pnpm run playwright:install
pnpm run validate
pnpm run build
```

Quando o lockfile não tiver mudado, alguns passos podem não baixar novos arquivos, mas devem continuar seguros.

## Dados locais

No Windows, dados operacionais podem ser mantidos sob o diretório de dados do usuário, incluindo áreas como:

```text
%APPDATA%\AgenteCPI\
```

O Electron também define um diretório `userData` para dados da aplicação. Dependendo da composição atual, esse diretório pode conter o banco SQLite do dashboard.

Os dados podem incluir:

- perfil persistente do navegador;
- cookies e sessões;
- banco SQLite;
- PDFs;
- downloads;
- logs;
- screenshots técnicos.

Não copie esses arquivos para o repositório.

## Backup

1. Pare o agente.
2. Feche o aplicativo.
3. Confirme que o navegador automatizado foi encerrado quando for necessário copiar o perfil.
4. Copie o diretório operacional e o diretório `userData` para uma área segura.
5. Proteja o backup como dado confidencial.
6. Não envie o backup por canais públicos.

Copiar um banco SQLite enquanto ele está em uso pode produzir um backup inconsistente. Feche a aplicação antes da cópia.

## Desinstalação

A remoção do aplicativo pelo Windows pode não apagar os dados persistentes do usuário.

Para remover somente o programa:

1. Pare o agente.
2. Feche o aplicativo.
3. Use **Aplicativos instalados** no Windows.
4. Desinstale o Agente CPI.

Para remover também os dados locais:

1. faça backup quando necessário;
2. confirme que o aplicativo e o navegador estão fechados;
3. localize o diretório operacional em `%APPDATA%`;
4. localize o `userData` do Electron;
5. remova os diretórios somente após confirmar que não contêm PDFs ou histórico que precisem ser preservados.

O `scripts/setup-windows.ps1` nunca executa essa limpeza.

## Segurança e privacidade

- use somente contas autorizadas;
- não compartilhe o perfil do navegador;
- não grave credenciais no repositório;
- não publique banco SQLite, PDFs ou logs;
- não exponha CPF completo na interface ou em logs públicos;
- mantenha o Windows atualizado;
- restrinja o acesso ao diretório de dados;
- revise o histórico antes de compartilhar capturas de tela;
- não execute pesquisas fora da finalidade autorizada;
- interrompa o uso quando um portal apresentar comportamento inesperado.

## Solução de problemas

### `pnpm` não encontrado

```powershell
corepack enable
pnpm --version
```

Quando `package.json` definir `packageManager`, o Corepack poderá ativar a versão registrada.

### Chromium do Playwright não instalado

```powershell
pnpm run playwright:install
```

### Erro de `NODE_MODULE_VERSION`

```powershell
pnpm run rebuild:native
pnpm test
pnpm run validate
```

Não use o Vitest diretamente pelo Node local para testes SQLite.

### Compilação nativa falhou

Instale Python, Visual Studio Build Tools, ferramentas de C++ para desktop e Windows SDK. Depois:

```powershell
pnpm run rebuild:native
```

### Perfil do navegador em uso

Feche outras instâncias do Agente CPI e processos do navegador iniciados pelo aplicativo. Não apague o perfil como primeira tentativa.

### Login não reconhecido

- confirme que a CPI está na fila autenticada;
- confirme que a DeskData está na página de consulta de pessoas;
- volte ao dashboard;
- selecione **Login concluído — continuar**.

### Fila da CPI não localizada

Confirme a autenticação, a página esperada e se o portal alterou navegação, frames ou seletores. Não force a execução quando o portal estiver diferente.

### Página da DeskData não localizada

Abra manualmente a área de consulta de pessoas e repita a validação de login.

### PDF não encontrado

Confirme se o download foi concluído, se o arquivo ainda existe e se não foi movido por ferramenta externa. O aplicativo não deve encerrar por causa desse erro.

### Banco SQLite bloqueado

Feche outras instâncias do aplicativo e ferramentas que estejam mantendo o banco aberto. Não exclua o banco sem backup.

### Porta de desenvolvimento ocupada

Feche a instância anterior do `pnpm dev` e confirme processos Node/Electron ainda ativos antes de iniciar novamente.

### SmartScreen ou antivírus

Confirme a origem do instalador. Instaladores não assinados podem gerar alertas. Não desative permanentemente o antivírus para executar o aplicativo.

### `ERRO_E1`

O erro E1 bloqueia a próxima pesquisa. Preserve o navegador aberto, consulte a etapa e a mensagem segura exibidas no dashboard e corrija a causa antes de reiniciar.

## macOS e Linux

O projeto contém scripts de build para outras plataformas, mas macOS e Linux são experimentais.

Antes de usar nessas plataformas:

- reconstrua módulos nativos;
- instale os navegadores do Playwright;
- valide abertura e revelação de PDFs;
- valide persistência do perfil;
- execute todos os testes;
- valide o fluxo real dos portais;
- trate assinatura e notarização no macOS;
- trate bibliotecas de sistema e formato de pacote no Linux.

Não distribua como versão suportada antes dessa validação.

## Limitações conhecidas

- portais externos podem alterar telas, frames, textos ou seletores;
- autenticação depende de login manual;
- módulo SQLite depende da ABI do Electron;
- instaladores não assinados podem gerar alerta;
- macOS e Linux ainda não foram validados;
- disponibilidade, preço e regras dos serviços externos não são controlados pelo aplicativo;
- “funcionar em outra máquina” depende dos pré-requisitos, permissões, acesso aos portais e compatibilidade do ambiente.

## Checklist de implantação

- [ ] Repositório clonado.
- [ ] Lockfile preservado.
- [ ] Git, Node.js, Corepack e pnpm verificados.
- [ ] Dependências instaladas.
- [ ] `better-sqlite3` reconstruído para Electron.
- [ ] Chromium instalado.
- [ ] `pnpm test` aprovado.
- [ ] `pnpm run validate` aprovado.
- [ ] `pnpm run build` aprovado.
- [ ] Aplicativo abre em `PARADO`.
- [ ] Nenhuma pesquisa inicia automaticamente.
- [ ] Login manual nas duas plataformas validado.
- [ ] Fila vazia e contagem regressiva validadas.
- [ ] Histórico sem CPF completo validado.
- [ ] Abertura e localização de PDF validadas.
- [ ] Pausa, retomada e parada validadas.
- [ ] E1 validado sem iniciar nova pesquisa.
- [ ] Instalador testado em outra conta ou máquina Windows.

## Licença e uso interno

Defina a licença e as regras de distribuição do repositório antes de publicar Releases.

Na ausência de uma licença explícita, considere o código de uso interno e não autorizado para redistribuição pública.

````

- [ ] **Step 3: Run the README guard test**

Run:

```powershell
pnpm test -- `
  tests/unit/documentation/readme-installation-guard.test.ts
````

Expected:

```text
1 test file passed
9 tests passed
```

- [ ] **Step 4: Run both installation guard suites**

Run:

```powershell
pnpm test -- `
  tests/unit/documentation/readme-installation-guard.test.ts `
  tests/unit/scripts/setup-windows-guard.test.ts
```

Expected: both files pass.

---

### Task 34: Pin the pnpm Runtime When Missing

**Files:**

- Modify: `package.json`
- Test: existing installation guard suites and project validation

**Interfaces:**

- Consumes: output of `pnpm --version`
- Produces: exact `packageManager: "pnpm@<installed-version>"` when the field is absent

- [ ] **Step 1: Inspect the package-manager field**

Run:

```powershell
node -p "require('./package.json').packageManager ?? ''"
pnpm --version
```

Expected:

- first command prints the configured value or an empty line;
- second command prints the pnpm version currently used by the validated project.

- [ ] **Step 2: Add the exact current pnpm version only when absent**

Run:

```powershell
$packageManager = node -p "require('./package.json').packageManager ?? ''"

if ([string]::IsNullOrWhiteSpace($packageManager)) {
  $pnpmVersion = pnpm --version

  if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível consultar a versão do pnpm."
  }

  $temporaryScript = Join-Path `
    $env:TEMP `
    "agente-cpi-set-package-manager.cjs"

  @"
const fs = require('node:fs')
const packageJson = JSON.parse(
  fs.readFileSync('package.json', 'utf8')
)

packageJson.packageManager = 'pnpm@$pnpmVersion'

fs.writeFileSync(
  'package.json',
  JSON.stringify(packageJson, null, 2) + '\n'
)
"@ | Set-Content `
    -LiteralPath $temporaryScript `
    -Encoding utf8

  try {
    node $temporaryScript

    if ($LASTEXITCODE -ne 0) {
      throw "Não foi possível atualizar package.json."
    }
  }
  finally {
    Remove-Item `
      -LiteralPath $temporaryScript `
      -Force `
      -ErrorAction SilentlyContinue
  }

  pnpm exec prettier --write package.json

  if ($LASTEXITCODE -ne 0) {
    throw "O Prettier falhou em package.json."
  }
}
```

Expected: `package.json` contains the validated pnpm version and no dependency versions are changed.

- [ ] **Step 3: Confirm native and test scripts remain present**

Run:

```powershell
node -e @'
const scripts = require('./package.json').scripts

for (const name of [
  'rebuild:native',
  'postinstall',
  'test',
  'playwright:install',
  'validate',
  'build',
  'build:win'
]) {
  if (!scripts[name]) {
    throw new Error('Script ausente: ' + name)
  }
}

console.log('Scripts obrigatórios presentes.')
'@
```

Expected:

```text
Scripts obrigatórios presentes.
```

---

### Task 35: Run Complete Non-Destructive Verification

**Files:**

- Verify: all files created or modified in Tasks 31–34

**Interfaces:**

- Consumes: completed documentation and setup implementation
- Produces: evidence that tests, validation, build, and initial dashboard state pass without starting a research

- [ ] **Step 1: Format the changed files**

Run:

```powershell
pnpm exec prettier --write `
  README.md `
  .gitignore `
  scripts/setup-windows.ps1 `
  tests/unit/documentation/readme-installation-guard.test.ts `
  tests/unit/scripts/setup-windows-guard.test.ts `
  package.json
```

Expected: Prettier completes. If `.gitignore` or PowerShell is reported as unsupported, rerun only for supported file types and preserve the manual formatting of the unsupported file.

- [ ] **Step 2: Run focused tests**

Run:

```powershell
pnpm test -- `
  tests/unit/documentation/readme-installation-guard.test.ts `
  tests/unit/scripts/setup-windows-guard.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 3: Run the global validation**

Run:

```powershell
pnpm run validate
```

Expected: typecheck, lint, formatting checks, and all tests pass.

- [ ] **Step 4: Run the production build**

Run:

```powershell
pnpm run build
```

Expected: main, preload, and renderer builds complete with exit code 0.

- [ ] **Step 5: Execute the setup script on the already configured machine**

Run:

```powershell
Set-ExecutionPolicy `
  -Scope Process `
  -ExecutionPolicy Bypass

.\scripts\setup-windows.ps1
```

Expected:

- dependency install uses the frozen lockfile;
- native rebuild passes;
- Chromium installation passes;
- native SQLite test passes;
- tests, validation, and build pass;
- the application does not open.

- [ ] **Step 6: Perform the final visual smoke test**

Run:

```powershell
pnpm dev
```

Verify manually:

1. The dashboard opens in `PARADO`.
2. No portal action starts automatically.
3. No research is consumed.
4. The history panel loads.
5. Close the app without selecting **Iniciar agente**.

Expected: clean shutdown without a native-module error.

- [ ] **Step 7: Confirm repository safety**

Run:

```powershell
git status --short
```

Review only; do not commit.

Expected changed/new files:

```text
README.md
.gitignore
package.json
scripts/setup-windows.ps1
tests/unit/documentation/readme-installation-guard.test.ts
tests/unit/scripts/setup-windows-guard.test.ts
```

Existing native-test launcher changes from the earlier ABI correction may also appear. No database, PDF, browser profile, download, log, credential, or `.env` file should be listed.

---

## Final Acceptance

The implementation is complete only after:

- focused guards pass;
- global `validate` passes;
- production `build` passes;
- setup script passes on the current Windows machine;
- `pnpm dev` opens in `PARADO`;
- no native ABI error appears;
- no research starts during verification;
- no sensitive local artifact appears in Git status.
