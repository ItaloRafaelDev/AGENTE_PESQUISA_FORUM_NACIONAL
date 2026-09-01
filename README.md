# Agente CPI

> **Uso autorizado e privacidade:** use esta aplicação somente com autorização para operar a CPI
> Central e a DeskData e para tratar os dados envolvidos. Não compartilhe perfis, sessões,
> credenciais, relatórios ou dados pessoais. Registros de suporte devem usar identificadores
> mascarados; nunca copie um CPF completo para código, documentação, logs ou chamados.

Aplicação Electron para conduzir o fluxo supervisionado CPI Central → DeskData → PDF → CPI a
partir de um dashboard local. A plataforma suportada é somente **Windows 10 e Windows 11 x64**.
macOS, Linux, ARM64, Windows Server e distribuição portátil não são suportados.

## Instalação para o operador

Obtenha do canal interno autorizado o instalador, o ZIP e o manifesto da mesma versão. No exemplo
abaixo, ajuste somente o valor da variável para a versão recebida:

Não há URL pública de repositório definida neste projeto. Confirme a procedência do manifesto antes
de confiar nos hashes: SHA-256 verifica integridade, não identidade do publicador. No PowerShell,
calcule os dois hashes e compare cada resultado com a linha correspondente de `SHA256SUMS.txt`:

```powershell
$releaseVersion = '1.0.0'
$installerPath = ".\Agente-CPI-${releaseVersion}-Setup-x64.exe"
$archivePath = ".\Agente-CPI-${releaseVersion}-Windows-x64.zip"
Get-FileHash -LiteralPath $installerPath -Algorithm SHA256
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
Get-Content -LiteralPath .\SHA256SUMS.txt
```

O instalador NSIS é assistido, x64 e por usuário: não pede elevação, permite escolher a pasta,
cria somente um atalho no menu Iniciar e termina sem abrir a aplicação. Durante a instalação, o
helper empacotado prepara a revisão de Chromium fixada pelo Playwright no cache global do usuário.
É necessária rede somente quando essa revisão fixada está ausente do cache. O download deve
respeitar o proxy autorizado do ambiente. Uma falha aborta a instalação e tenta executar o
desinstalador para rollback; se essa tentativa falhar, registra que a reversão não foi concluída.

Esta distribuição é **não assinada**. Por isso, o Windows SmartScreen pode exibir um alerta mesmo
quando o SHA-256 confere. Valide a origem com o responsável pela distribuição e siga a política de
segurança da organização. Não enfraqueça controles do Windows para instalar o aplicativo.

O ZIP contém a aplicação desempacotada x64. Ele não representa suporte a um target portátil e não
dispensa o Chromium compatível.

## Primeiro uso e operação

1. Abra **Agente CPI** pelo menu Iniciar. A instalação não abre o aplicativo por conta própria.
2. Use o dashboard para abrir o navegador.
3. Faça o login manual na CPI Central e depois na DeskData. Credenciais e cookies não pertencem ao
   repositório ou a arquivos de configuração.
4. Quando as duas sessões estiverem autenticadas, selecione **Login concluído — continuar**.
5. Inicie o agente somente quando estiver pronto para executar pesquisas autorizadas.

O dashboard apresenta o navegador, as duas sessões, a fila, a etapa atual, a contagem regressiva,
os ciclos concluídos e um log operacional curto. Os estados públicos do agente são:

| Estado             | Significado operacional                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `PARADO`           | Nenhuma pesquisa será iniciada; é o estado inicial.                     |
| `INICIANDO`        | O runtime está preparando a execução.                                   |
| `AGUARDANDO_LOGIN` | O operador deve concluir manualmente os logins dos dois portais.        |
| `EXECUTANDO`       | Um ciclo autorizado está em andamento.                                  |
| `PAUSANDO`         | O ciclo atual será concluído antes da pausa.                            |
| `PAUSADO`          | Nenhum novo ciclo começa até **Continuar**.                             |
| `PARANDO`          | O ciclo atual está sendo encerrado sem iniciar outro.                   |
| `OCIOSO`           | A fila está vazia e o próximo exame aguarda a contagem regressiva.      |
| `ERRO_E1`          | A condição E1 impediu nova pesquisa; preserve o navegador e investigue. |

**Iniciar**, **Pausar**, **Continuar** e **Parar** respeitam esses estados e ficam bloqueados
durante outra ação. Em E1, confira a mensagem segura no dashboard e a condição do portal antes de
reiniciar. Não tente contornar validações do portal.

## Histórico e PDFs

O histórico mostra início, CPF mascarado, classificação, resultado CPI, status, duração e PDF. As
ações **Abrir PDF** e **Mostrar na pasta** usam o caminho já registrado. **Limpar histórico** remove
os registros somente após confirmação; os PDFs são preservados. Se aparecer **PDF não encontrado**,
confira se a unidade/pasta externa está disponível ou se o arquivo ainda existe, sem editar o banco
manualmente.

## Dados, backup, atualização e desinstalação

Os dados internos pertencem exatamente a:

- `%APPDATA%\agente-cpi`: `userData` legado e banco `agente-cpi.sqlite`;
- `%APPDATA%\AgenteCPI`: perfil do navegador, downloads internos, screenshots, logs e configuração.

Novos PDFs preferem a pasta externa `E:\PDF-AGENTE-CPI`; quando ela não está gravável, a aplicação
usa o diretório interno de downloads. Outros caminhos externos já registrados no histórico também
permanecem externos.

Antes de uma manutenção, feche a aplicação e faça backup dos dois roots AppData e dos PDFs externos
necessários. Para uma **atualização manual**, obtenha e valide a nova versão e faça a instalação por
cima da instalação por usuário existente, escolhendo o mesmo diretório. Esse fluxo preserva banco,
perfil, dados operacionais, PDFs externos e cache do navegador; não existe atualizador em segundo
plano.

Na desinstalação, deixar a opção de limpeza desmarcada remove binários e atalhos e preserva os dados.
A opção separada **Remover dados locais do Agente CPI** vem desmarcada e, se selecionada, pode remover
somente `%APPDATA%\agente-cpi` e `%APPDATA%\AgenteCPI`. PDFs externos sobrevivem à desinstalação e o
cache global do Playwright sobrevive à desinstalação; ambos são preservados até quando a limpeza
opcional é selecionada. Exclua qualquer conteúdo externo somente por um procedimento manual de
retenção autorizado, fora do desinstalador.

Antes de qualquer exclusão, o desinstalador audita integralmente as duas árvores permitidas. Se uma
das raízes ou qualquer descendente for junction, link simbólico ou outro reparse point, toda a
limpeza opcional é recusada sem excluir nenhum dos dois roots.

## Desenvolvimento

Pré-requisitos: Windows x64 suportado, Git já instalado, Node.js 24 x64, Corepack e o gerenciador
declarado no projeto, `pnpm@10.28.1`. Execute tudo na raiz do repositório. A preparação canônica é:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
```

`-ExecutionPolicy Bypass` vale apenas para esse processo do PowerShell; o script não altera a
política global. Ele confirma ambiente e lockfile, instala dependências congeladas, instala o
Chromium do Playwright, valida e compila. Não instala Git/Node, não coleta credenciais e não abre a
aplicação ou os portais.

Preparação manual equivalente, quando necessário para diagnóstico:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright install chromium
corepack pnpm run validate
corepack pnpm run build
```

Comandos cotidianos:

```powershell
pnpm dev
pnpm run typecheck
pnpm test
pnpm run validate
pnpm run build
pnpm run test:coverage
```

`better-sqlite3` contém um módulo nativo. O lifecycle de instalação executa
`pnpm run rebuild:native` para a ABI do Electron; não reutilize um binário recompilado para a ABI do
Node local. Use `pnpm test`, que inicia o runner pelo Electron, em vez de invocar Vitest diretamente.

## Distribuição Windows

O único comando completo de distribuição é:

```powershell
pnpm run distribution:windows
```

Ele valida o ambiente e o projeto, compila, cria `release\win-unpacked`, executa o smoke offline do
aplicativo desempacotado, gera o instalador a partir desse mesmo pacote, cria o ZIP e gera/verifica
`SHA256SUMS.txt`. Não publica nem assina artefatos. Para executar somente o smoke de um pacote já
existente:

```powershell
$packagedExecutable = 'C:\Aplicativos\Agente CPI\AgenteCPI.exe'
pnpm run smoke:packaged -- "--executable=$packagedExecutable"
```

O smoke consulta apenas estados iniciais isolados (`PARADO`, navegador parado, sessões e histórico),
sem abrir CPI Central ou DeskData. Sua raiz é criada vazia por `mkdtemp`, resolvida canonicamente e
revalidada antes de qualquer escrita; reparse points, conteúdo preexistente e sobreposição com o
workspace ou AppData de produção são recusados. Veja
[Arquitetura da distribuição](docs/architecture/windows-distribution.md).

## Solução de problemas

| Sintoma                                | Verificação e recuperação segura                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Corepack ou pnpm incompatível          | Confirme Node.js 24, execute `corepack --version` e confira `packageManager: pnpm@10.28.1`; corrija Node/Corepack sem mudar o lockfile.         |
| `NODE_MODULE_VERSION`/`better-sqlite3` | Feche o app, restaure dependências pelo setup ou execute `pnpm run rebuild:native`; depois rode `pnpm run validate`.                            |
| Chromium ausente                       | Em desenvolvimento, rode `corepack pnpm exec playwright install chromium`; no instalador, restaure acesso de rede autorizado e tente novamente. |
| Falha de proxy ou download do Chromium | Valide conectividade, certificado e proxy com a equipe responsável. Preserve TLS, SmartScreen, antivírus e políticas corporativas.              |
| Alerta do SmartScreen                  | Confira origem e SHA-256 e peça validação ao responsável; a ausência de assinatura é uma limitação conhecida desta etapa.                       |
| SQLite bloqueado                       | Feche todas as instâncias antes de backup, atualização ou restauração. Não remova arquivos WAL/SHM de um processo ativo.                        |
| Perfil do navegador em uso             | Encerre a outra instância que possui o perfil e reabra pelo menu Iniciar; não compartilhe nem copie o perfil entre usuários.                    |
| Sessão não reconhecida                 | Mantenha o navegador aberto, autentique manualmente CPI Central e DeskData e use **Login concluído — continuar**.                               |
| E1                                     | Pare novas tentativas, leia o estágio e a mensagem, corrija a condição e reinicie somente após confirmar o portal.                              |
| PDF não encontrado                     | Verifique a unidade e o arquivo externo ou `%APPDATA%\AgenteCPI\downloads`; o histórico preserva o caminho original.                            |
| Distribuição interrompida              | Leia a primeira fase que falhou, corrija a causa e reexecute o comando canônico; uma fase com erro impede as fases seguintes.                   |

Não altere globalmente política de PowerShell, TLS, antivírus ou controles do Windows como forma de
diagnóstico. Não publique artefatos, logs, banco, perfil ou PDFs como evidência de suporte.

## Limites e aceite

A distribuição atual não inclui assinatura, atualização em segundo plano, publicação automática,
instalação por máquina, execução elevada, atalho na área de trabalho ou abertura da aplicação ao
final. A aceitação manual no Windows deve confirmar instalação em diretório escolhido, download e
rollback do Chromium, atalhos, login/fluxo real autorizado, atualização, ambos os modos de
desinstalação, preservação externa, ZIP e orientação do SmartScreen antes de qualquer integração Git
ou publicação.
