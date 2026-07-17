# Design — Classificação de processos por Esfera

**Data:** 2026-07-15  
**Projeto:** Agente CPI  
**Fonte da classificação:** campo estruturado `Esfera` da página da DeskData  
**Status:** aprovado para planejamento de implementação

## 1. Objetivo

Substituir a classificação baseada em palavras do texto geral por uma regra determinística baseada exclusivamente no campo `Esfera` de cada processo exibido na DeskData.

## 2. Regra principal

```text
Existe pelo menos um processo com Esfera criminal?
SIM → SIM_CONSTA_RESTRICAO
NÃO → HA_INFORMACOES
```

Mapeamento para a CPI:

```text
SIM_CONSTA_RESTRICAO → Sim, Consta Restrições
HA_INFORMACOES → Há Informações
```

## 3. Fonte da decisão

A página da DeskData será a fonte da classificação.

O PDF permanecerá no fluxo para download, validação, histórico, comprovação e anexação na CPI. Ele não será usado para decidir entre os dois resultados.

## 4. Precedência

Somente `Esfera` poderá definir criminalidade.

Os campos abaixo serão ignorados para a decisão:

- Vara;
- Assunto;
- Tipo;
- Classe;
- Tribunal;
- Comarca;
- Órgão;
- Status;
- texto geral do cartão;
- cabeçalho da página;
- conteúdo textual do PDF.

Exemplo obrigatório:

```text
Vara: Juizado Especial Cível e Criminal
Esfera: Civil
Resultado: HA_INFORMACOES
```

## 5. Esferas criminais

Valores iniciais reconhecidos:

```text
Criminal
Penal
Criminal Militar
Criminal/Penal
Especial Criminal
Juizado Especial Criminal
Cível e Criminal
Civil e Criminal
Civil/Criminal
Criminal e Cível
Criminal e Civil
```

Após normalização, será criminal quando:

1. o valor for exatamente `penal`;
2. o valor contiver a palavra isolada `criminal`;
3. corresponder a um alias controlado do domínio.

A correspondência será aplicada somente ao valor de `Esfera`.

## 6. Normalização

A normalização deverá:

- remover espaços laterais;
- reduzir espaços duplicados;
- converter para minúsculas;
- remover acentos;
- padronizar quebras de linha;
- converter `/`, `-`, `&` e pontuação em espaços;
- reduzir novamente espaços duplicados.

Exemplos:

```text
"  ESPECIAL CRIMINAL  " → "especial criminal"
"Criminal/Penal" → "criminal penal"
"CÍVEL E CRIMINAL" → "civel e criminal"
```

## 7. Valores ausentes ou desconhecidos

Quando o cartão for lido corretamente, mas `Esfera` estiver ausente, vazia, nula ou desconhecida, o processo será tratado como não criminal.

Se nenhuma outra Esfera criminal existir:

```text
HA_INFORMACOES
```

Isso não se aplica a falha técnica de leitura.

## 8. Ausência de processos

Se a seção `Processos` carregar corretamente e informar que não existem registros:

```text
HA_INFORMACOES
```

## 9. Múltiplos processos

Todos os processos serão analisados.

```text
Qualquer Esfera criminal em qualquer página
→ SIM_CONSTA_RESTRICAO
```

Exemplos:

```text
Civil + Trabalhista → HA_INFORMACOES
Civil + Criminal → SIM_CONSTA_RESTRICAO
Civil + Especial Criminal → SIM_CONSTA_RESTRICAO
```

## 10. Status

O Status não altera a classificação.

Processos criminais ativos, arquivados, baixados, suspensos, encerrados ou finalizados continuarão gerando:

```text
SIM_CONSTA_RESTRICAO
```

## 11. Coleta completa

O RPA deverá:

1. localizar a seção `Processos`;
2. confirmar o carregamento;
3. identificar os cartões;
4. expandir cartões recolhidos;
5. extrair o campo `Esfera`;
6. percorrer todas as páginas;
7. deduplicar processos;
8. validar a integridade;
9. classificar somente após a coleta completa.

Mesmo após encontrar Esfera criminal, a coleta continuará para comprovar integridade.

## 12. Paginação

Interface conceitual:

```ts
interface ProcessCollectionProgress {
  currentPage: number
  totalPages: number | null
  expectedProcessCount: number | null
  collectedProcessCount: number
  visitedPageSignatures: string[]
}
```

Em cada página:

1. aguardar estabilização;
2. expandir cartões;
3. coletar registros;
4. registrar assinatura;
5. armazenar apenas registros novos;
6. avançar quando houver próxima página;
7. confirmar mudança real de conteúdo;
8. impedir loops.

Sem contador total, o fim será:

```text
fim da paginação + ausência de novos registros
```

## 13. Deduplicação

Prioridade da chave técnica:

1. número do processo normalizado;
2. ID interno do elemento;
3. assinatura técnica do cartão.

Campos secundários poderão compor a assinatura apenas para deduplicação, nunca para classificar.

## 14. Extração

O extrator buscará `Esfera` dentro do cartão atual.

Estratégias permitidas:

1. rótulo e valor semanticamente associados;
2. linha `Esfera: valor`;
3. células ou blocos adjacentes;
4. atributo de acessibilidade homologado.

Fallbacks proibidos:

- texto completo do cartão;
- Vara;
- Assunto;
- Tipo;
- Classe;
- Tribunal;
- Status;
- PDF.

Saída:

```ts
interface DeskDataProcessRecord {
  processKey: string
  processNumber: string | null
  sphereRaw: string | null
  sourcePage: number
}
```

## 15. Classificador

Assinatura conceitual:

```ts
function classifyDeskDataResult(processes: DeskDataProcessRecord[]): DeskDataClassification
```

Resultado:

```ts
interface DeskDataClassification {
  result: 'SIM_CONSTA_RESTRICAO' | 'HA_INFORMACOES'

  reason: 'CRIMINAL_SPHERE_FOUND' | 'NO_CRIMINAL_SPHERE'

  totalProcesses: number
  normalizedSpheres: string[]
}
```

Falhas técnicas não serão representadas como classificação.

## 16. Componentes

### `DeskDataProcessCollector`

Localiza a seção, expande cartões, percorre paginação, deduplica e valida integridade.

### `DeskDataSphereExtractor`

Extrai somente o valor ligado ao rótulo `Esfera`.

### `normalizeProcessSphere`

Normaliza o valor para comparação.

### `isCriminalSphere`

Reconhece Esferas criminais.

### `classifyDeskDataResult`

Decide o resultado final.

### Fluxo contínuo

Solicita a coleta, converte falhas em `ERRO_E1`, usa a classificação, preserva o PDF e grava na CPI.

## 17. Fluxo completo

```text
Abrir pesquisa
→ Executar consulta
→ Aguardar resultado
→ Localizar Processos
→ Expandir cartões
→ Extrair Esferas
→ Percorrer páginas
→ Deduplicar
→ Validar integridade
→ Classificar
→ Baixar e validar PDF
→ Preencher CPI
→ Anexar PDF
→ Salvar
→ Concluir ciclo
```

## 18. Falhas técnicas

Geram `ERRO_E1`:

- seção `Processos` não localizada;
- carregamento indefinido;
- spinner permanente;
- erro da página;
- cartão obrigatório não expande;
- quebra estrutural que impede leitura;
- paginação não avança;
- conteúdo não muda após Próximo;
- loop entre páginas;
- quantidade esperada divergente;
- coleta interrompida;
- integridade não comprovada.

Comportamento:

```text
ERRO_E1
→ não classificar
→ não gravar resultado
→ não salvar pesquisa
→ manter navegador aberto
→ não iniciar nova pesquisa
```

Distinção:

```text
Esfera ausente em cartão lido corretamente
→ HA_INFORMACOES

Falha que impede confirmar a leitura
→ ERRO_E1
```

## 19. PDF

O PDF continuará sendo baixado, validado, anexado e registrado no histórico.

A classificação não dependerá de palavras do PDF.

## 20. Logs

Permitido:

- quantidade esperada e coletada;
- página atual;
- total de páginas;
- Esferas normalizadas;
- resultado;
- motivo;
- erro técnico seguro;
- duração.

Proibido:

- CPF completo;
- nome completo;
- credenciais;
- cookies;
- tokens;
- texto integral do processo;
- conteúdo integral do PDF.

## 21. Testes de domínio

- [ ] Nenhum processo → `HA_INFORMACOES`.
- [ ] Civil, Cível e Trabalhista → `HA_INFORMACOES`.
- [ ] Esfera ausente, vazia ou desconhecida → `HA_INFORMACOES`.
- [ ] Criminal, Penal, Criminal Militar, Especial Criminal e Juizado Especial Criminal → `SIM_CONSTA_RESTRICAO`.
- [ ] Civil/Criminal, Cível e Criminal e Criminal e Civil → `SIM_CONSTA_RESTRICAO`.
- [ ] Civil + Trabalhista + Criminal → `SIM_CONSTA_RESTRICAO`.
- [ ] “Criminal” somente na Vara ou Assunto, com Esfera Civil → `HA_INFORMACOES`.
- [ ] Criminal arquivado, baixado ou suspenso → `SIM_CONSTA_RESTRICAO`.

## 22. Testes de normalização

- [ ] Ignorar caixa.
- [ ] Remover acentos.
- [ ] Remover espaços laterais.
- [ ] Reduzir espaços duplicados.
- [ ] Padronizar `/`, `-`, `&` e quebras de linha.
- [ ] Não transformar Civil em criminal.
- [ ] Não analisar campos secundários.

## 23. Testes do extrator

- [ ] Rótulo e valor no mesmo bloco.
- [ ] Rótulo e valor separados.
- [ ] Linha `Esfera: valor`.
- [ ] Campo vazio.
- [ ] Campo ausente.
- [ ] Vara contendo “Criminal” e Esfera Civil.
- [ ] Assunto contendo “Criminal” e Esfera Civil.
- [ ] Cartão recolhido.
- [ ] Estrutura não homologada → erro técnico.

Fixtures deverão ser sintéticas e anonimizadas.

## 24. Testes de coleta e paginação

- [ ] Uma página e várias páginas.
- [ ] Um e vários processos.
- [ ] Cartões recolhidos.
- [ ] Processo repetido em páginas.
- [ ] Paginação sem contador.
- [ ] Última página sem Próximo.
- [ ] Próximo desabilitado.
- [ ] Conteúdo não muda → `ERRO_E1`.
- [ ] Loop → `ERRO_E1`.
- [ ] Cartão não expande → `ERRO_E1`.
- [ ] Quantidade divergente → `ERRO_E1`.
- [ ] Seção ausente → `ERRO_E1`.
- [ ] Mensagem explícita sem processos → `HA_INFORMACOES`.

## 25. Testes de integração

- [ ] Restrição seleciona **Sim, Consta Restrições**.
- [ ] Não criminal seleciona **Há Informações**.
- [ ] E1 não seleciona nem salva resultado.
- [ ] E1 não inicia outro CPF.
- [ ] PDF continua sendo baixado e anexado.
- [ ] Resultado somente é salvo após coleta completa.
- [ ] Criminal em qualquer página prevalece.

## 26. Checkpoints de implementação

### Checkpoint 1 — Domínio

- [ ] Criar testes RED.
- [ ] Implementar normalização.
- [ ] Implementar `isCriminalSphere`.
- [ ] Atualizar classificador.
- [ ] Executar testes e typecheck.

### Checkpoint 2 — Extração

- [ ] Criar fixtures sintéticas.
- [ ] Criar testes RED.
- [ ] Implementar extração por rótulo.
- [ ] Provar que Vara e Assunto são ignorados.
- [ ] Testar campos vazios e ausentes.

### Checkpoint 3 — Coleta

- [ ] Implementar expansão.
- [ ] Implementar paginação.
- [ ] Implementar deduplicação.
- [ ] Implementar assinaturas.
- [ ] Implementar validação de integridade.
- [ ] Implementar erros técnicos.

### Checkpoint 4 — Integração

- [ ] Conectar ao ciclo.
- [ ] Remover classificação textual do caminho de produção.
- [ ] Preservar PDF.
- [ ] Preservar E1.
- [ ] Atualizar histórico e logs seguros.
- [ ] Executar testes, validação e build.

### Checkpoint 5 — Homologação real

- [ ] Sem processos.
- [ ] Apenas Civil.
- [ ] Apenas não criminal.
- [ ] Criminal.
- [ ] Especial Criminal.
- [ ] Civil + Criminal.
- [ ] Vara com “Criminal” e Esfera Civil.
- [ ] Criminal arquivado ou baixado.
- [ ] Mais de uma página.
- [ ] Falha controlada de paginação.
- [ ] E1 sem nova pesquisa.
- [ ] Download e anexo do PDF.

## 27. Migração

Antes:

```text
texto geral / palavras / inferência
→ classificação
```

Depois:

```text
campo Esfera de todos os processos
→ normalização
→ classificação
```

A lógica antiga não permanecerá como fallback no fluxo de produção.

## 28. Compatibilidade preservada

- login manual;
- perfil persistente;
- execução sequencial;
- fila contínua;
- fila vazia;
- política E1;
- PDF;
- histórico SQLite;
- dashboard;
- pausa;
- retomada;
- parada segura.

## 29. Fora do escopo

- interpretação jurídica por Assunto, Vara ou Status;
- classificação por IA;
- OCR como caminho principal;
- alteração de login;
- alteração visual do dashboard;
- alteração do instalador;
- reprocessamento automático de pesquisas antigas;
- paralelismo.

## 30. Critérios de aceite

- [ ] Somente Esfera determina criminalidade.
- [ ] Campos secundários são ignorados.
- [ ] Todos os processos e páginas são lidos.
- [ ] Qualquer Esfera criminal gera **Sim, Consta Restrições**.
- [ ] Esfera ausente ou desconhecida gera **Há Informações**.
- [ ] Nenhum processo gera **Há Informações**.
- [ ] Status não altera resultado.
- [ ] Falha técnica gera `ERRO_E1`.
- [ ] E1 não grava nem inicia nova pesquisa.
- [ ] Navegador permanece aberto em E1.
- [ ] PDF continua sendo anexado.
- [ ] Testes, validação e build passam.
- [ ] Casos reais são homologados.
- [ ] Fixtures não contêm dados reais.

## 31. Decisões aprovadas

- Fonte: página da DeskData.
- Campo decisório: `Esfera`.
- PDF: comprovação e anexo.
- Esfera ausente/desconhecida: `HA_INFORMACOES`.
- Nenhum processo: `HA_INFORMACOES`.
- Qualquer criminal: `SIM_CONSTA_RESTRICAO`.
- Composta com componente criminal: criminal.
- Especial Criminal: criminal.
- Juizado Especial Criminal: criminal.
- Penal: criminal.
- Status: ignorado.
- Vara e demais campos: ignorados.
- Leitura: todos os cartões e páginas.
- Falha de coleta: `ERRO_E1`.
- Fallback textual: proibido em produção.
