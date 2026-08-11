# Núcleo de aplicação

Esta referência descreve o núcleo application implementado. Os adapters externos da Etapa 6
ficam em `src/infrastructure/automation`; sua composição, ownership e compatibilidade estão em
[Adapters externos implementados](external-adapters.md).

```text
main ──compose──> application <──implement── infrastructure
                         │
                         └──> domain
```

`src/application` importa somente `application` e `domain`. `src/main/main-application-runtime.ts`
é o composition root de produção e cria uma instância de `ResearchHistoryService`,
`AgentStateMachine` e `ContinuousAgentCoordinator`. O mapper em `src/main` projeta o estado
canônico no DTO serializável já existente; renderer, preload, canais IPC e DTOs não pertencem ao
número de estado da aplicação.

## Casos de uso e proprietários

| Componente                          | Responsabilidade implementada                                                                                           | Não possui                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `AgentStateMachine`                 | snapshot canônico, transições, validação do CPF mascarado e publicação defensiva                                        | IPC, Electron, Playwright ou sessão               |
| `ContinuousAgentCoordinator`        | start/login/pause/resume/stop, uma operação ativa, um `ExecutionControl`, histórico do ciclo e falha pública sanitizada | páginas, selectors, polling ou DTO público        |
| `RunContinuousResearch`             | repetição sequencial, estados da fila, numeração e checkpoints entre ciclos                                             | refresh, delays ou cancelamento nativo do browser |
| `RunResearchCycle`                  | ordem de um ciclo, stages, save único, cleanup histórico DeskData e retorno à fila                                      | frames, páginas ou controllers concretos          |
| `PrepareResearch`                   | DeskData → relatório → classificação → preparação CPI e guards semânticos                                               | download físico, parser PDF ou controles CPI      |
| `validatePreparedResearchCandidate` | confirmação de anexo, PDF não vazio e labels obrigatórios herdados                                                      | handles Playwright ou persistência                |
| `ResearchHistoryService`            | ciclo ativo, duração, persistência, eventos, cleanup terminal e sanitização                                             | SQLite, UUID ou relógio concretos                 |

O ciclo application executa, nesta ordem:

1. abrir a próxima pesquisa CPI;
2. ler a identidade ativa;
3. preparar a DeskData;
4. executar a preparação e classificação;
5. salvar uma única vez na CPI;
6. fechar o resultado histórico da DeskData quando aplicável;
7. preparar a próxima busca DeskData;
8. retornar à fila CPI.

A preparação executa `fillCpf`, datasets aprovados, submit único, espera do resultado, criação e
leitura do relatório, classificação por esfera e preparação/anexo CPI. O full CPF fica confinado
às closures ativas de preenchimento e de desambiguação/resolução da DeskData; resultados, hooks,
estado público, histórico e logs recebem somente a máscara.

## Portas semânticas e adapters

A tabela definitiva de portas e implementações concretas está em [Adapters externos implementados](external-adapters.md#portas-e-adapters-concretos). Referências de relatório continuam dados opacos para os casos de uso: application não resolve, concatena, cria ou inspeciona paths físicos.

## Ciclo de vida

| Origem                        | Comando/evento      | Destino                      | Observação                                               |
| ----------------------------- | ------------------- | ---------------------------- | -------------------------------------------------------- |
| `STOPPED` ou `FAILED`         | start               | `STARTING`                   | preserva o contador concluído e limpa progresso anterior |
| `STARTING`                    | sessão ausente      | `WAITING_LOGIN`              | não publica E1                                           |
| `STARTING` ou `WAITING_LOGIN` | sessão autenticada  | `IDLE`                       | prepara a execução contínua                              |
| `IDLE`                        | pesquisa disponível | `RUNNING`                    | abre um único histórico ativo                            |
| `RUNNING`                     | espera da fila      | `IDLE`                       | mantém a operação contínua ativa                         |
| estado ativo pausável         | pause               | `PAUSE_REQUESTED` → `PAUSED` | conclui o ciclo em curso antes de pausar                 |
| `PAUSED`                      | resume              | `STARTING`                   | revalida a sessão antes de executar                      |
| estado ativo parável          | stop                | `STOP_REQUESTED` → `STOPPED` | STOP prevalece sobre PAUSE                               |
| operação ativa                | falha               | `FAILED`                     | falha o histórico, sanitiza e publica E1                 |

Start ativo, resume fora de `PAUSED` e confirmação de login fora de `WAITING_LOGIN` preservam as
mensagens de validação existentes. O mapper de fronteira mantém `PARADO`, `INICIANDO`,
`AGUARDANDO_LOGIN`, `OCIOSO`, `EXECUTANDO`, `PAUSANDO`, `PAUSADO`, `PARANDO` e `ERRO_E1`.

## Pause, stop e cleanup cooperativos

Existe um `ExecutionControl` por operação canônica. STOP não pode ser rebaixado para PAUSE. O
coordenador registra controle e promise antes de publicar `STARTING` e reavalia a diretiva:

- antes da primeira chamada ao workspace;
- depois de iniciar/reutilizar o browser;
- depois de consultar autenticação;
- depois de preparar context, páginas e filtro;
- depois de publicar o estado inicial e antes de iniciar o runner.

O loop contínuo reavalia a diretiva antes da espera da fila, depois do callback `WAITING_QUEUE`,
depois da espera, depois de `RESEARCH_AVAILABLE` e depois de `CYCLE_COMPLETED`. O workspace
adapter converte a diretiva para `AbortSignal` apenas quando nenhum ciclo está ativo. Durante um
ciclo, attachment e save não são interrompidos nem repetidos; o abort ocorre após o resultado
conhecido e impede a próxima consulta. Listeners de abort e subscriptions do token são removidos em
`finally`.

O histórico remove o contexto ativo em `finally` nos terminais de sucesso e falha, inclusive se
persistência ou notificação terminal lançar. Uma nova execução não reutiliza o ID, CPF mascarado ou
estado terminal anterior.

## Tradução de erros

1. Portas técnicas lançam seus erros no adapter.
2. `PrepareResearch` e `RunResearchCycle` preservam `ApplicationError` existente ou criam uma
   `ApplicationError` com código, stage, mensagem segura e causa interna.
3. A facade Playwright converte a falha de stage para o contrato legado
   `ContinuousResearchStageError` sem expor a causa por IPC.
4. `ContinuousAgentCoordinator` falha o histórico ativo, solicita STOP no controle, sanitiza a
   mensagem e publica `FAILED` com stage e timestamp.
5. `ContinuousAgentIpcAdapter` projeta somente o estado público clonado.

Cancelamentos nativos só são normalizados quando o erro é reconhecido como `AbortError` ou
`ABORT_ERR`. Uma falha técnica concorrente com pause/stop continua sendo falha. Não há retry
genérico nem replay de attachment ou save.

## Limites de dados sensíveis

- O full CPF existe somente nas closures ativas que preenchem e resolvem/desambiguam a DeskData;
  não é retido em resultados, estado, histórico ou logs.
- Estado, callbacks, resultados, histórico e logs usam `***.***.***-NN`.
- `AgentStateMachine` rejeita um `currentMaskedCpf` fora do formato mascarado.
- Erros retêm a causa apenas internamente; sanitizadores de infraestrutura protegem persistência e
  estado público.
- Cookies, tokens, HTML, perfil do browser e handles Playwright não atravessam portas application.
- O path físico do PDF permanece necessário no adapter/histórico compatível, mas não é manipulado
  pelos casos de uso.

## Contratos preservados

O composition root continua abrindo o SQLite canônico em `userData`, marcando históricos
inacabados, reutilizando `%APPDATA%\AgenteCPI\browser-profile`, resolvendo o diretório de PDF antes
do runner e encerrando coordenador, browser, handlers e banco nessa ordem. Os handlers IPC do
agente e histórico, preload, tipos shared e renderer permanecem fora do diff da Etapa 5.
