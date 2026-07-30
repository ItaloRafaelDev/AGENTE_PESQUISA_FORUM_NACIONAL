# Configuração e persistência

Esta referência descreve as decisões operacionais consolidadas na Etapa 4. O suporte oficial
continua restrito ao Windows.

## Configuração da aplicação

`src/infrastructure/config/app-config.ts` é a fonte única dos valores ativos. O módulo define o
contrato tipado, valida os dados com Zod e devolve objetos imutáveis. A composição principal
chama `parseAppConfig()` uma vez antes de abrir o navegador ou o banco. Não há arquivo JSON,
tela de configuração ou sobrescrita por variável de ambiente.

Valores de plataforma:

| Campo            | Valor                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Fila CPI         | `https://adm.cpicentral.com.br/zpersEspecial/pesquisas/aguardando/mod_t_aguardando.aspx` |
| Pessoas DeskData | `https://app.deskdata.com.br/pessoas/`                                                   |

Temporização:

| Campo                             |     Valor |
| --------------------------------- | --------: |
| Verificação da fila               | 60.000 ms |
| Navegação da página da plataforma | 45.000 ms |
| Navegação geral                   | 30.000 ms |
| Ação em elemento                  | 10.000 ms |
| Leitura de elemento               |  5.000 ms |
| Início de download                | 30.000 ms |
| Polling de busca CPI              |    250 ms |
| Polling do formulário DeskData    |    250 ms |
| Polling do resultado DeskData     |    500 ms |
| Navegação do histórico DeskData   |    250 ms |
| Estabilização do filtro da fila   |    700 ms |
| Estabilização após envio          |  1.000 ms |
| Retorno à fila                    |  3.000 ms |

Limites ativos:

| Campo                           | Tentativas |
| ------------------------------- | ---------: |
| Busca do frame CPI              |         40 |
| Busca da identidade CPI         |         40 |
| Busca do anexo CPI              |         40 |
| Busca do resultado CPI          |         40 |
| Estabilização do resultado CPI  |          3 |
| Formulário DeskData pronto      |         40 |
| Busca do resultado DeskData     |        180 |
| Navegação do histórico DeskData |        120 |

## Caminhos no Windows

A composição principal fornece `app.getPath('appData')` e `app.getPath('userData')` ao resolvedor.
O banco de produção permanece no diretório `userData` do Electron, com o nome
`agente-cpi.sqlite`. Ele não é movido para a raiz operacional.

A raiz operacional é `%APPDATA%\AgenteCPI` e contém:

- `browser-profile`, que preserva cookies e sessões;
- `downloads`;
- `screenshots`;
- `logs`;
- `config`.

Os scripts operacionais obtêm `%APPDATA%` somente por
`scripts/support/windows-operational-config.ts` e usam o mesmo resolvedor. O teste de navegador
continua fornecendo uma raiz isolada.

Para novos PDFs, `E:\PDF-AGENTE-CPI` é criado e verificado primeiro. Se esse diretório não puder
ser criado ou escrito, a aplicação usa `%APPDATA%\AgenteCPI\downloads`. Se os dois destinos
falharem, o erro do fallback é propagado. Caminhos de PDFs já gravados no histórico não são
normalizados nem reescritos.

## Banco e migrações

`better-sqlite3` é o único runtime de persistência. O schema atual do histórico é a versão `1`,
controlada por `PRAGMA user_version`. O repositório delega a evolução do schema ao executor
síncrono de migrações antes de disponibilizar consultas.

Na transição exata de `0` para `1`:

- um banco novo recebe a tabela `research_history` e os três índices atuais;
- um banco existente tem colunas, tipos, nulabilidade, chave primária e índices validados;
- colunas e índices adicionais compatíveis são preservados;
- linhas existentes e valores de `pdf_path` não são copiados, transformados ou reescritos;
- quando o schema existente é compatível, somente `user_version` é adotado como `1`.

Cada passo executa a alteração e a atualização de `user_version` na mesma transação. Uma falha
reverte ambos. Uma versão acima de `1` é recusada sem downgrade e antes da ativação de WAL.
`foreign_keys = ON` permanece por conexão, e `journal_mode = WAL` é aplicado somente depois da
compatibilidade e das migrações bem-sucedidas.

Qualquer migração estrutural futura exige primeiro um backup validado. Ela também precisa de
design aprovado e testes representativos antes de alterar tabela, coluna, índice ou constraint.

Drizzle ORM, Drizzle Kit, seus scripts e `drizzle.config.ts` foram removidos após ser verificada a
ausência de uso em runtime. A definição do schema e a execução das migrações pertencem agora
diretamente à infraestrutura baseada em `better-sqlite3`.

## Validação automatizada

Execute na raiz do repositório:

```powershell
pnpm run validate
pnpm run build
pnpm run test:coverage
git diff --check
```

O gate inclui typecheck de Node e renderer, contratos estruturais de tipos, ESLint sem warnings,
Prettier, suíte completa, bundles de produção e cobertura. Fixtures, testes, mensagens e
documentação não podem introduzir um CPF completo; use somente identificadores sintéticos
mascarados.
