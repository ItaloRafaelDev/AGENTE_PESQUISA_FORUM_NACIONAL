# Design — README e instalação reproduzível do Agente CPI

**Data:** 2026-07-15  
**Projeto:** Agente CPI  
**Plataforma validada:** Windows 10/11 x64  
**Plataformas experimentais:** macOS e Linux  
**Distribuição principal:** Git clone e Releases  
**Escopo:** documentação de instalação, operação, build e solução de problemas

## 1. Objetivo

Criar uma documentação de instalação e operação que permita preparar o Agente CPI em outra máquina com o menor número possível de decisões implícitas.

A solução terá dois componentes:

1. `README.md`, com instalação de usuário final e instalação de desenvolvimento.
2. `scripts/setup-windows.ps1`, para automatizar a preparação do projeto no Windows.

O processo não armazenará credenciais no repositório e não iniciará pesquisas automaticamente após a instalação.

## 2. Público-alvo

### Usuário final

Utilizará o aplicativo pelo instalador `.exe`. O README orientará obtenção pela área de Releases, instalação, primeiro login manual, uso do dashboard, atualização e desinstalação.

### Desenvolvedor ou responsável pela implantação

Clonará o repositório e poderá executar, validar, alterar ou gerar o instalador. O README cobrirá pré-requisitos, preparação automatizada e manual, testes, build, empacotamento e diagnóstico.

## 3. Plataformas

Windows 10 e Windows 11 x64 serão declarados como plataformas validadas.

macOS e Linux serão descritos como experimentais. O README deixará explícito que o fluxo completo não foi validado nesses sistemas, que módulos nativos precisam ser reconstruídos para o Electron da plataforma e que a automação dos portais deve ser validada antes do uso em produção.

## 4. Métodos de distribuição

### Instalador

O usuário final baixará o `.exe` pela área de Releases. A URL real não será inventada; será usado um placeholder até o endereço do repositório ser definido.

### Código-fonte

O método principal será:

```bash
git clone <URL_DO_REPOSITORIO>
cd agente-cpi
```

A atualização será documentada com `git pull`, `pnpm install` e `pnpm run validate`.

## 5. Pré-requisitos

### Usuário final

- Windows 10 ou 11 x64;
- acesso autorizado à CPI Central;
- acesso autorizado à DeskData;
- conexão com a internet;
- permissão para executar o instalador;
- espaço para perfil do navegador, banco SQLite e PDFs.

### Desenvolvimento

- Git;
- Node.js compatível com o projeto;
- Corepack;
- pnpm;
- PowerShell 7 recomendado;
- compiladores nativos somente quando necessário;
- acesso autorizado aos portais.

O README recomendará confirmar as versões no `package.json` e no lockfile.

## 6. Script `scripts/setup-windows.ps1`

O script deverá:

1. confirmar Windows x64;
2. confirmar `package.json` e `pnpm-lock.yaml`;
3. verificar Git, Node.js, Corepack e pnpm;
4. ativar pnpm por Corepack quando necessário;
5. executar `pnpm install --frozen-lockfile`;
6. reconstruir `better-sqlite3` para Electron;
7. instalar Chromium do Playwright;
8. testar SQLite dentro do Electron;
9. executar `pnpm run validate`;
10. executar `pnpm run build`;
11. informar os comandos finais.

O script usará modo estrito, interromperá no primeiro erro e validará o código de saída de comandos externos.

O script não armazenará credenciais, não apagará perfil, banco ou PDFs, não iniciará `pnpm dev`, não iniciará o agente e não instalará Git ou Node automaticamente.

## 7. Compatibilidade ABI

O projeto usa `better-sqlite3`, que contém código nativo.

O README explicará que:

- o binário precisa corresponder à ABI do Electron;
- `postinstall` deve reconstruir o módulo para Electron;
- `rebuild:native` deve usar `@electron/rebuild`;
- testes SQLite devem usar o Node incorporado ao Electron;
- não se deve alternar o mesmo binário entre a ABI do Node local e a ABI do Electron;
- o comando oficial será `pnpm test`;
- `pnpm exec vitest` diretamente pode provocar incompatibilidade.

## 8. Estrutura do README

1. Aviso de uso autorizado.
2. Visão geral.
3. Funcionalidades.
4. Fluxo operacional.
5. Plataformas.
6. Requisitos.
7. Instalação pelo `.exe`.
8. Instalação pelo código-fonte.
9. Preparação automática no Windows.
10. Preparação manual.
11. Configuração inicial.
12. Login na CPI Central e DeskData.
13. Uso do dashboard.
14. Estados do agente.
15. Histórico e PDFs.
16. Comandos de desenvolvimento.
17. Testes e validação.
18. Build e empacotamento.
19. Dados locais.
20. Atualização.
21. Backup.
22. Desinstalação.
23. Segurança e privacidade.
24. Solução de problemas.
25. Plataformas experimentais.
26. Limitações conhecidas.
27. Checklist de implantação.
28. Licença e uso interno.

## 9. Operação documentada

O aplicativo abre em `PARADO`. Nenhuma consulta ou custo é gerado antes de o operador clicar em **Iniciar agente**.

Quando as sessões não estiverem autenticadas, o estado será `AGUARDANDO_LOGIN`. O operador fará login manual na CPI Central e na DeskData e usará **Login concluído — continuar**.

Controles:

- **Iniciar:** abre ou reutiliza o navegador;
- **Pausar:** conclui o ciclo atual e pausa antes do próximo;
- **Continuar:** reutiliza navegador e sessão válidos;
- **Parar:** conclui o ciclo atual e não inicia outro;
- **Login concluído — continuar:** valida as duas sessões.

Em fila vazia, o dashboard exibirá a contagem regressiva. O valor de 60 segundos somente será documentado se continuar correspondente ao código final.

Em E1, o agente não inicia nova pesquisa, o navegador permanece aberto e o dashboard mostra uma mensagem segura.

## 10. Dados locais

O README identificará os caminhos atuais do código para:

- perfil persistente do navegador;
- banco SQLite;
- PDFs;
- logs e artefatos, quando existentes.

A documentação não deverá repetir caminhos antigos se a composição atual usar o `userData` do Electron.

## 11. Configuração e credenciais

O `.env` será usado apenas para configurações não sensíveis, caso o projeto realmente possua essas variáveis.

Não serão versionados:

- usuários e senhas;
- CPF real;
- nomes completos pesquisados;
- cookies;
- tokens;
- banco SQLite;
- PDFs;
- conteúdo integral de relatórios.

O login manual será o padrão.

## 12. Testes e build

Comandos esperados:

```bash
pnpm test
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm run validate
pnpm run build
pnpm run build:unpack
pnpm run build:win
```

Os comandos finais deverão corresponder ao `package.json` vigente.

macOS e Linux terão comandos apenas experimentais e avisos sobre assinatura, notarização, bibliotecas do sistema e rebuild de módulos nativos.

## 13. Solução de problemas

O README cobrirá:

- `NODE_MODULE_VERSION` incompatível;
- `better_sqlite3.node` não carregado;
- Chromium ausente;
- pnpm ou Corepack ausentes;
- compiladores nativos ausentes;
- login não reconhecido;
- fila da CPI não localizada;
- página da DeskData não localizada;
- PDF não encontrado;
- banco SQLite bloqueado;
- perfil do navegador em uso;
- porta de desenvolvimento ocupada;
- antivírus ou SmartScreen;
- erro E1.

Cada item terá causa provável, verificação e correção.

## 14. Privacidade e uso autorizado

O README começará com um aviso sobre:

- uso restrito a operadores autorizados;
- respeito às políticas dos sistemas acessados;
- proibição de compartilhar perfis de navegador;
- não publicação de dados pessoais;
- não registro de CPF completo;
- finalidade de uso autorizada.

## 15. `.gitignore`

A documentação recomendará validar cobertura para:

```text
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
*.sqlite3
downloads/
screenshots/
logs/
browser-profile/
*.pdf
```

A lista deverá respeitar fixtures intencionais do projeto.

## 16. Critérios de aceite

A entrega será aceita quando:

1. `README.md` existir na raiz.
2. `scripts/setup-windows.ps1` existir.
3. o script parar no primeiro erro.
4. uma máquina Windows com Git e Node conseguir clonar e preparar o projeto.
5. o módulo nativo for reconstruído para Electron.
6. Chromium for instalado.
7. testes, validação e build forem aprovados.
8. `pnpm dev` abrir em `PARADO`.
9. nenhuma credencial precisar ser salva em arquivo.
10. macOS e Linux não forem declarados como validados.
11. nenhum dado pessoal real aparecer.
12. o conflito de ABI já observado estiver documentado.

## 17. Fora do escopo

- instalação automática de Git;
- instalação automática de Node;
- armazenamento de credenciais;
- atualização automática;
- assinatura digital;
- publicação automática em Releases;
- CI/CD;
- suporte garantido a macOS e Linux;
- alteração do fluxo de pesquisa;
- alteração do dashboard;
- alteração das regras de classificação.

## 18. Decisões finais

- Git clone como método principal;
- Releases como distribuição adicional;
- documentação para usuário final e desenvolvedor;
- Windows validado;
- macOS e Linux experimentais;
- login manual;
- `.env` apenas para dados não sensíveis;
- preparação automática e manual;
- interrupção no primeiro erro;
- preservação dos dados locais;
- nenhuma execução automática do agente durante a instalação.
