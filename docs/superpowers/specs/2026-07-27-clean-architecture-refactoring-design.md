# Refatoração arquitetural incremental do Agente CPI

**Data:** 27 de julho de 2026
**Status:** aprovado em conversa, aguardando revisão do documento
**Escopo:** refatoração integral, correção de erros confirmados, validação e publicação

## 1. Objetivo

Reorganizar integralmente o Agente CPI para obter uma base profissional, legível, segura,
testável e sustentável, sem alterar o comportamento funcional ou visual existente.

A refatoração deve:

- preservar fluxos, regras de negócio, telas, textos, interações e integrações;
- preservar banco SQLite, histórico, PDFs, perfil do Chromium e sessões autenticadas;
- eliminar duplicações, código legado e arquivos sem uso comprovado;
- corrigir erros confirmados durante a etapa em que forem encontrados;
- estabelecer fronteiras arquiteturais verificáveis;
- manter o projeto executável e validado após cada etapa;
- produzir e validar um instalador Windows;
- terminar com teste manual do usuário e, somente após sua aprovação explícita, um único
  commit e publicação direta na branch principal.

## 2. Restrições aprovadas

### 2.1 Compatibilidade comportamental

O comportamento funcional e visual atual é a baseline obrigatória. Refatorações não podem
alterar:

- ordem e semântica do ciclo CPI → DeskData → CPI;
- regras de classificação;
- estados públicos do agente;
- canais e respostas IPC consumidos pelo renderer;
- textos, layout, CSS, responsividade ou interações da interface;
- formato e significado dos registros de histórico;
- política atual de mascaramento de CPF;
- modo como pausa e parada aguardam a conclusão segura de operações não idempotentes.

Uma correção de bug é a única exceção. Ela deve possuir causa raiz identificada e teste de
regressão antes da alteração da implementação.

### 2.2 Plataforma

O suporte oficial será restrito ao Windows. Configurações e documentação para macOS ou Linux
que não sejam funcionais serão removidas. O código continuará evitando acoplamentos
desnecessários ao sistema operacional quando isso não aumentar a complexidade.

### 2.3 Compatibilidade de dados

Devem permanecer compatíveis:

- `app.getPath('userData')/agente-cpi.sqlite`;
- `%APPDATA%/AgenteCPI/browser-profile`;
- sessões e cookies do perfil persistente;
- registros históricos existentes;
- caminhos já persistidos para PDFs;
- PDFs previamente baixados.

Nenhuma migração pode exigir reinicialização do perfil ou descarte do banco.

### 2.4 Validação externa

São permitidas inspeções e validações não destrutivas nas plataformas CPI Central e DeskData.
Qualquer teste que grave, confirme, anexe ou altere uma pesquisa real exige autorização
específica do usuário no momento da execução.

### 2.5 Git e publicação

- Não haverá commits intermediários.
- Cada etapa terá checkpoint por testes, revisão de diff e relatório de resultado.
- O único commit dependerá de teste manual e aprovação explícita do usuário.
- Após todos os gates, o resultado será integrado e enviado diretamente à branch principal.
- A branch principal e o remoto serão identificados por inspeção antes da integração.
- Não será utilizado `force push`.

## 3. Estratégia

Será utilizada refatoração incremental no projeto atual. Não haverá reescrita completa nem
segunda aplicação executada em paralelo.

Cada mudança seguirá estas regras:

1. proteger o comportamento relevante com teste;
2. executar a alteração estrutural mínima;
3. validar o escopo alterado;
4. executar os gates proporcionais ao risco;
5. revisar o diff antes de avançar.

Movimentações de arquivos, renomeações e mudanças comportamentais não serão misturadas quando
isso prejudicar a revisão.

## 4. Arquitetura-alvo

```text
src/
├── domain/          Regras de negócio puras, tipos e classificações
├── application/     Casos de uso, orquestração, estados e portas
├── infrastructure/  Playwright, plataformas, PDF, SQLite, arquivos e logs
├── main/            Ciclo Electron, composition root e IPC
├── preload/         Ponte segura entre main e renderer
├── renderer/        Interface React
└── shared/          Contratos serializáveis de IPC
```

### 4.1 Direção das dependências

```text
renderer       → shared
preload        → shared
main           → application + infrastructure + shared
infrastructure → application + domain
application    → domain
domain         → nenhuma camada externa
```

Restrições:

- `domain` não importa Electron, Playwright, React, SQLite, Zod ou infraestrutura;
- `application` não conhece páginas Playwright, caminhos físicos ou Electron;
- `shared` não importa `application`, `automation` ou `infrastructure`;
- `main` é o único composition root;
- adaptadores implementam portas definidas pela camada consumidora;
- contratos IPC contêm apenas dados serializáveis;
- testes automáticos impedem dependências invertidas.

## 5. Organização dos módulos

```text
domain/
└── research/

application/
├── agent/
├── research/
├── history/
└── ports/

infrastructure/
├── browser/
├── platforms/
│   ├── cpi/
│   └── deskdata/
├── documents/
├── persistence/
├── config/
└── logging/
```

### 5.1 Critérios de granularidade

- Funções puras não serão transformadas em classes sem necessidade.
- Classes de um método serão consolidadas quando não possuírem estado, ciclo de vida ou
  substituição relevante.
- Classes serão mantidas para adaptadores com estado, recursos externos ou ciclo de vida.
- Nomes como `Manager`, `Service` e `Controller` exigem uma responsabilidade correspondente.
- Arquivos de aproximadamente 80 a 250 linhas são uma orientação, não um limite artificial.
- Cada módulo expõe uma API pública pequena e mantém detalhes internos privados.
- Código será agrupado por comportamento do negócio, não por padrão mecânico.

## 6. Fluxo funcional preservado

```text
Iniciar agente
→ garantir navegador
→ validar sessões
→ consultar fila CPI
→ abrir pesquisa
→ ler e mascarar CPF
→ preparar e executar consulta DeskData
→ baixar e interpretar PDF
→ classificar resultado
→ preencher e anexar resultado na CPI
→ confirmar gravação
→ registrar histórico
→ preparar próxima consulta
→ retornar à fila
```

Pausa e parada devem preservar o limite seguro atual: operações idempotentes podem ser
canceladas; operações de gravação em andamento devem alcançar um estado conhecido antes do
encerramento.

## 7. Persistência e configuração

### 7.1 SQLite

O runtime continuará usando `better-sqlite3`. Drizzle, seus scripts e sua configuração serão
removidos.

O schema terá:

- uma fonte de verdade;
- migrações incrementais e transacionais;
- versão controlada por `PRAGMA user_version`;
- backup validado antes de mudança estrutural;
- índices coerentes com consultas reais;
- constraints para estados e valores de domínio quando compatíveis com dados existentes;
- teste de abertura e migração de uma cópia representativa do banco atual.

### 7.2 Configuração

URLs, caminhos, intervalos, retries e timeouts terão uma fonte única validada por Zod.
Aplicativo e scripts usarão a mesma configuração.

O diretório `E:\PDF-AGENTE-CPI` será mantido como padrão quando estiver disponível. Quando a
unidade ou diretório não puder ser utilizado, novos PDFs serão gravados em diretório
operacional seguro da aplicação. Caminhos históricos não serão reescritos.

### 7.3 Privacidade

- CPF completo pode existir apenas em memória durante a operação necessária.
- Banco, logs, eventos, erros, screenshots e artefatos não podem persistir CPF completo.
- Mensagens são normalizadas, limitadas e sanitizadas antes de cruzar IPC ou chegar ao banco.
- Dados do perfil persistente não serão copiados para documentação ou fixtures.

## 8. Tratamento de erros

Erros serão classificados como:

- validação;
- autenticação;
- plataforma externa;
- documento ou PDF;
- persistência;
- cancelamento;
- falha interna.

Regras:

- estados e mensagens públicas existentes serão mantidos;
- `catch` silencioso será permitido somente para limpeza segura e local;
- retries serão limitados a operações idempotentes;
- anexar, confirmar e salvar não podem executar duas vezes;
- erros armazenados ou exibidos devem ser sanitizados;
- correções de bugs exigem reprodução e teste de regressão.

## 9. Estratégia de testes

### 9.1 Camadas

- Testes unitários para domínio, aplicação e adaptadores determinísticos.
- Testes de contrato para IPC, configuração, persistência e seletores.
- Testes de integração para SQLite, PDF e ciclo completo com portas controladas.
- Testes do renderer preservando conteúdo, estados e interações.
- Smoke tests reais e não destrutivos para autenticação, páginas e disponibilidade dos
  controles externos.

### 9.2 Gates

A conclusão exige:

- typecheck de Node e renderer;
- ESLint sem erros e sem avisos relevantes;
- Prettier aprovado;
- todos os testes aprovados;
- cobertura sem regressão;
- no mínimo 85% de linhas, funções e statements e 80% de branches em `domain` e
  `application`;
- verificação automatizada das dependências arquiteturais;
- build de produção;
- geração do instalador Windows;
- inicialização do aplicativo instalado;
- smoke test externo não destrutivo;
- working tree revisado antes do commit final.

## 10. Segurança Electron

Sem alterar a interface:

- remover a API Electron genérica exposta ao renderer quando confirmado que não possui uso;
- expor apenas métodos tipados e necessários pelo preload;
- validar entradas IPC no processo main;
- limitar eventos IPC ao contrato público;
- bloquear navegação da janela principal para origens não autorizadas;
- validar protocolos antes de abrir URLs externas;
- avaliar `sandbox: true` por teste de compatibilidade, sem ativá-lo se quebrar uma necessidade
  comprovada;
- manter `contextIsolation: true` e `nodeIntegration: false`.

## 11. Frontend

`AgentDashboard` e `ResearchHistoryPanel` serão divididos em hooks e componentes coesos.

A refatoração deve preservar:

- árvore DOM observável pelos testes;
- classes CSS;
- textos;
- estados de loading, sucesso e erro;
- atalhos e ações;
- dimensões, responsividade e aparência;
- comportamento do contador e das atualizações em tempo real.

Não haverá redesign.

## 12. Limpeza do repositório

Uma remoção exige evidência de ausência de uso por:

- busca de imports e referências;
- inspeção de scripts e configuração;
- testes e build;
- verificação de que o arquivo não é entrada operacional documentada.

Serão candidatos:

- dependências e configurações sem implementação real;
- backups gerados;
- arquivos de contexto temporário;
- artefatos duplicados;
- scripts substituídos;
- arquivos herdados do template;
- configurações de plataformas não suportadas.

Documentação operacional e evidências ainda necessárias serão preservadas ou consolidadas.

## 13. Etapas de execução

### Etapa 1 — Baseline e proteção

Registrar contratos e cobertura, completar testes críticos e catalogar duplicações, código
legado e erros reproduzíveis.

### Etapa 2 — Higiene

Corrigir pipeline e formatação, remover itens obsoletos comprovados e padronizar ferramentas e
nomenclatura.

### Etapa 3 — Fronteiras arquiteturais

Criar as camadas-alvo, corrigir a direção das dependências e adicionar testes arquiteturais.

### Etapa 4 — Configuração e persistência

Centralizar configuração, remover Drizzle, versionar migrações e validar compatibilidade.

### Etapa 5 — Núcleo da aplicação

Separar controle do agente, ciclo e histórico; consolidar estados, cancelamento e erros.

### Etapa 6 — Adaptadores

Reorganizar CPI, DeskData, navegador e PDF; centralizar seletores, esperas e políticas de
idempotência.

### Etapa 7 — Electron e segurança

Restringir preload, IPC, navegação e encerramento.

### Etapa 8 — Frontend

Separar estado e apresentação sem mudança visual ou funcional.

### Etapa 9 — Testes, distribuição e documentação

Concluir cobertura, integração, smoke, instalador Windows, README e documentação arquitetural.

### Etapa 10 — Entrega

Executar todos os gates, revisar o diff integral e entregar o aplicativo para teste manual. O
commit, a integração na branch principal e a publicação sem force push só podem acontecer
depois de o usuário declarar explicitamente que o resultado está correto.

## 14. Critério de conclusão

O trabalho estará concluído somente quando:

- todas as etapas estiverem validadas;
- comportamento e aparência estiverem preservados, salvo bugs corrigidos com regressão;
- dados e sessões existentes forem compatíveis;
- não restar código legado ou duplicação conhecida dentro do escopo;
- arquitetura e segurança estiverem verificadas automaticamente;
- instalador Windows tiver sido gerado e iniciado;
- smoke externo não destrutivo tiver sido aprovado;
- documentação representar o código final;
- o usuário tiver testado e aprovado explicitamente o resultado;
- somente depois dessa aprovação, um único commit tiver sido integrado e enviado à branch
  principal.
