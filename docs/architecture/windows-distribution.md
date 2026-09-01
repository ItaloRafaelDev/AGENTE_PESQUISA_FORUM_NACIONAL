# Distribuição Windows

Esta referência registra a implementação da Etapa 9. O produto distribuído suporta somente Windows
10 e Windows 11 x64; `package.json` é a única fonte da versão.

## Ownership e composição

```text
build/application-identity.json → processo principal e electron-builder
parser de startup → configuração de caminhos → runtime
builder → aplicação desempacotada → smoke → NSIS prepackaged → ZIP e SHA-256
helper do instalador → cache global do Playwright
```

O catálogo `build/application-identity.json` pertence à identidade `Agente CPI`, `AgenteCPI.exe` e
`com.agentecpi.desktop`. `src/shared/config/application-identity.ts` fornece a visão tipada ao
processo principal; `electron-builder.config.cjs` consome diretamente o mesmo JSON. A versão não é
copiada para esse catálogo.

`src/main/startup/application-startup-options.ts` reconhece o modo normal ou o par fechado de
argumentos do smoke. `src/main/startup/configure-application-paths.ts` cria e aplica os caminhos
antes do lock de instância e de `app.whenReady()`. O resultado entra em
`MainApplicationRuntime`; em produção, preserva o banco em `%APPDATA%\agente-cpi`, enquanto a raiz
operacional continua em `%APPDATA%\AgenteCPI`. No smoke, appData, userData e PDFs ficam contidos na
raiz temporária vazia criada por `mkdtemp`. O parser e a configuração revalidam a resolução
canônica antes de qualquer escrita, recusando root reparse, conteúdo preexistente e sobreposição
com o workspace ou o AppData de produção.

## Empacotamento e artefatos

`scripts/build-windows-distribution.ps1` é o único orquestrador completo. Ele verifica Windows x64,
Node.js 24, pnpm 10 e a raiz do repositório; executa validação e build; limpa somente descendentes
auditados de `release`; e empacota uma única aplicação x64 desempacotada. O script então:

1. executa `scripts/smoke-packaged-app.ts` contra `release\win-unpacked\AgenteCPI.exe`;
2. entrega esse mesmo diretório ao electron-builder com `--prepackaged` para produzir o NSIS;
3. arquiva seu conteúdo no ZIP;
4. cria e relê o manifesto SHA-256 do instalador e do ZIP.

Para `<versão>` lida de `package.json`, as saídas públicas são
`Agente-CPI-<versão>-Setup-x64.exe`, `Agente-CPI-<versão>-Windows-x64.zip` e `SHA256SUMS.txt`.
Falhas interrompem a sequência antes da fase seguinte. O pipeline fixa `--publish never`, desabilita
descoberta de assinatura e não contém publicação, portal ou instalador em execução.

## Chromium e NSIS

O include `build/installer.nsh` chama apenas o entrypoint empacotado
`out/main/install-playwright-chromium.js` por `AgenteCPI.exe` em modo Node. Esse entrypoint delega a
`src/main/distribution/playwright-browser-installation.ts`, que resolve o CLI do Playwright instalado
e executa somente `install chromium`. Assim, o fluxo **helper do instalador → cache global do
Playwright** não aceita comando, browser ou URL arbitrários. É necessária rede somente quando a
revisão fixada está ausente do cache. Erro de download aborta a instalação e tenta executar o
desinstalador para rollback; se essa tentativa falhar, registra que a reversão não foi concluída e
não reporta a instalação como utilizável.

O instalador é NSIS assistido, por usuário, não elevado, sem assinatura, com diretório selecionável,
atalho somente no menu Iniciar e sem execução após a conclusão. Instalar por cima é o update manual
suportado.

## Limpeza permitida

Dados são preservados por padrão. A seção opcional do desinstalador fica desmarcada, valida o
AppData e cada parent canônico e audita recursivamente as duas árvores antes de excluir. Se uma raiz
ou qualquer descendente possuir o atributo de reparse point, ambos os audits terminam antes do
primeiro `RMDir` e toda a limpeza é recusada. A allowlist recursiva contém somente:

1. `%APPDATA%\agente-cpi`;
2. `%APPDATA%\AgenteCPI`.

Não há alvo dinâmico vindo da aplicação, registro ou usuário. O desinstalador não remove a pasta pai
selecionada, PDFs externos, `E:\PDF-AGENTE-CPI` ou qualquer cache global do Playwright.

## Fronteira automatizada e manual

O contrato automatizado cobre parsing e isolamento de caminhos, identidade e builder, helper fixo,
ordem/fail-fast do pipeline, allowlist NSIS, geração e verificação do manifesto e smoke isolado. O
smoke abre uma janela, usa somente a API preload de leitura, confirma `PARADO`, navegador parado,
sessões/histórico e os caminhos temporários; não inicia browser, agente ou PDF e não acessa portais.

A automação não substitui a aceitação manual. Login e operação em CPI Central → DeskData → PDF → CPI
são sempre manualmente autorizados e validados no Windows. Também permanecem manuais a conferência
dos hashes recebidos, SmartScreen, instalação/rollback reais, atalhos, preservação de dados,
update-over-install, os dois modos de desinstalação e execução do ZIP.

No checkpoint da Task 8, decisões B preservam os seguintes waivers: o pipeline final, smoke real,
ZIP e hashes da Task 6 não foram verificados após a correção; duas execuções convergentes do setup
da Task 7 não foram realizadas. A documentação não converte contratos automatizados em evidência
E2E.
