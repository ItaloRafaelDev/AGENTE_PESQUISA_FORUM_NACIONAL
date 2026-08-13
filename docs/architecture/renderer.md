# Arquitetura do renderer

## Escopo

O renderer continua sendo uma aplicação React carregada pelo Electron e expõe o mesmo dashboard
aceito ao fim da Etapa 7. A Etapa 8 mudou somente a divisão interna de responsabilidades: não
alterou o DOM público, o CSS, os métodos de `window.agent`, os canais IPC, os DTOs compartilhados
nem a automação CPI/DeskData/PDF.

O ponto público do dashboard permanece
`src/renderer/src/components/AgentDashboard.tsx`; o histórico continua exposto por
`src/renderer/src/components/ResearchHistoryPanel.tsx`.

## Fronteira de preload

`src/renderer/src/api/agent-api.ts` é o único arquivo do renderer que lê `window.agent`. A função
`getAgentApi()` retorna a referência tipada atual de `AgentApi`, sem cache, transformação, retry ou
API genérica. Hooks recebem uma API injetada nos testes ou obtêm a API por esse gateway uma vez para
o ciclo de vida do controller.

O renderer não importa `ipcRenderer`, `IpcRendererEvent` ou `@electron-toolkit/preload`, não acessa
`electronAPI` e não recebe `send`/`invoke` arbitrários. A superfície permitida continua definida no
preload restrito da Etapa 7.

```text
React components
  └─ feature hooks
       └─ getAgentApi()
            └─ window.agent (preload tipado)
```

## Dashboard

| Unidade                                                                 | Responsabilidade implementada                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `dashboard-model.ts`                                                    | snapshots iniciais imutáveis, tipos de ação/log, labels e política pura dos controles |
| `use-mounted-ref.ts`                                                    | guarda compartilhada contra updates após unmount                                      |
| `use-operational-log.ts`                                                | log newest-first, limitado aos dez eventos mais recentes e horário `pt-BR`            |
| `use-dashboard-actions.ts`                                              | lock global `busyAction`, execução primária, log e liberação em `finally`             |
| `use-dashboard-environment.ts`                                          | estado do browser/sessões, refresh e comandos de abrir/fechar browser                 |
| `use-agent-control.ts`                                                  | estado do agente, subscription em tempo real e comandos do agente                     |
| `use-agent-dashboard.ts`                                                | composição dos hooks e hidratação inicial coordenada                                  |
| componentes `*Panel.tsx`, `DashboardHeader.tsx` e `StatusIndicator.tsx` | apresentação determinística recebida por props                                        |

Na montagem, o coordinator inicia no mesmo `Promise.all` as chamadas
`browser.getStatus()`, `control.getState()` e `sessions.getStatus()`. O resultado completo hidrata
os três domínios e adiciona `Estado inicial carregado.`; uma falha mantém os snapshots iniciais e
registra a mensagem pública existente. Revisões por domínio impedem que uma resposta inicial tardia
sobrescreva um evento ou comando mais recente.

`use-agent-control.ts` instala a subscription `control.onStateChanged` sem polling. O cleanup chama
o unsubscribe devolvido pela API. A guarda montada e a geração ativa da hidratação rejeitam
resoluções, rejeições e callbacks retidos depois do cleanup, inclusive no replay de effects em
StrictMode.

Todos os comandos do dashboard compartilham um único lock síncrono. Um comando de browser atualiza
primeiro o snapshot retornado e tenta atualizar somente as sessões; um comando do agente atualiza
primeiro o estado retornado e tenta atualizar browser e sessões juntos. Falhas apenas nesses
refreshes secundários continuam silenciosas e não substituem o sucesso primário.

## Histórico

| Unidade                     | Responsabilidade implementada                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `research-history-model.ts` | page size 50, labels, data/duração e upsert imutável em ordem decrescente                |
| `use-research-history.ts`   | listagem inicial, três subscriptions, reconciliação, feedback, PDFs, clear e lock global |
| `ResearchHistoryTable.tsx`  | tabela e ações de PDF determinísticas, somente a partir de props                         |
| `ResearchHistoryPanel.tsx`  | composição pública dos estados loading, feedback, vazio e populado                       |

A listagem inicial usa exatamente `{ page: 1, pageSize: 50 }`. Enquanto ela está pendente, eventos
CREATED, UPDATED e CLEARED são aplicados imediatamente e registrados em ordem. Quando a página
chega, o hook reaplica esse journal sobre todos os itens retornados; assim, eventos mais novos não
somem e registros não relacionados não são perdidos. Um clear confirmado pelo comando participa do
mesmo journal mesmo quando o evento IPC correspondente não chega.

As três subscriptions são instaladas no effect de hidratação e seus três unsubscribes são chamados
no cleanup. A geração ativa e a guarda montada impedem que listas ou listeners antigos alterem uma
montagem posterior. Open, reveal e clear compartilham um lock síncrono; somente o sucesso do clear
remove as linhas, e os PDFs são preservados.

Datas válidas continuam usando `new Date(value).toLocaleString('pt-BR')`, portanto preservam a
interpretação no fuso local do processo Windows aceita antes da refatoração. Durações, classificações
e status mantêm os fallbacks e textos anteriores.

## Contrato de apresentação

Os componentes de apresentação de feature usam arquivos PascalCase em
`src/renderer/src/features/`. Eles recebem props tipadas e não possuem hooks de estado/effect,
gateway, global `window` ou Electron. Os componentes públicos compõem controllers, estado derivado
e callbacks sem recuperar ownership de persistência, subscriptions, locks, logs ou formatação de
domínio.

A árvore renderizada mantém tags, hierarquia, ordem de irmãos, classes, textos em português,
atributos ARIA, `data-testid`, colunas da tabela, estados condicionais e disabled conditions. O
arquivo `src/renderer/src/assets/main.css` permanece byte a byte no contrato SHA-256
`949A46122B4B9CB8BB2B576879DE779C1AF16E99D50241C0CB8F692E4E6C22E6`.

## Verificação e aceitação

Os testes de renderer caracterizam hidratação, eventos em tempo real, comandos, locks, cleanup,
StrictMode, estados normal/E1/aguardando login, loading/vazio/histórico populado e a assinatura
estrutural do DOM. Guardas recursivas exigem os módulos planejados, restringem o gateway e impedem
efeitos ou APIs de ambiente nos componentes de apresentação. Um teste dedicado protege o hash do
CSS.

Essas verificações automatizadas não substituem a aceitação no Windows. Antes de integração Git, o
usuário ainda deve comparar o renderer real e exercitar browser, agente, sessões, histórico/PDF,
fluxo CPI → DeskData → PDF → CPI, fechamento normal, fechamento durante inicialização e reinício.
