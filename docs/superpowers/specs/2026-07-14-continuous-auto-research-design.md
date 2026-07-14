# Modo Automático Contínuo do Agente CPI

**Data:** 2026-07-14

## 1. Objetivo

Transformar o fluxo supervisionado atual em um processo automático contínuo que monitore a fila da CPI, execute as pesquisas disponíveis em sequência e permaneça ocioso quando não houver pesquisa.

O agente continuará ativo até receber `Ctrl+C` ou até ocorrer qualquer erro operacional.

## 2. Decisões aprovadas

- Modo de gravação: totalmente automático.
- Confirmação textual `GRAVAR`: removida.
- Confirmação da CPI: o agente aceitará automaticamente o diálogo esperado pelo botão `OK`.
- Execução sequencial: processar uma pesquisa por vez.
- Monitoramento da fila: clicar em `Mostrar Tudo` a cada 60 segundos quando não houver pesquisa.
- Encerramento normal: somente por `Ctrl+C`.
- Política de erro: E1, interromper imediatamente e não avançar para outra pesquisa.
- PDFs permanentes: `E:\PDF-AGENTE-CPI`.

## 3. Regras de classificação

### 3.1 Processo criminal

Quando existir pelo menos um processo criminal, independentemente do polo da pessoa:

- classificação técnica: `CONSTA_RESTRICAO`;
- resultado na CPI: `Sim, Consta Restrições`;
- seletor operacional: `#consta3`.

### 3.2 Somente processos não criminais

- classificação técnica: `HA_INFORMACOES`;
- resultado na CPI: `Há Informações`;
- seletor operacional: `#consta2`.

### 3.3 Nenhum processo

- classificação técnica: `HA_INFORMACOES`;
- resultado na CPI: `Há Informações`;
- seletor operacional: `#consta2`.

### 3.4 Natureza não identificável

- classificação técnica interna: `INDEFINIDO`;
- resultado operacional na CPI: `Há Informações`;
- seletor operacional: `#consta2`;
- o fluxo continua normalmente.

O resultado `Nada Consta` não será utilizado por esse fluxo.

## 4. Fluxo contínuo

### 4.1 Inicialização

1. Abrir o navegador persistente.
2. Abrir ou reutilizar as abas da CPI e DeskData.
3. Solicitar login manual somente quando a sessão não estiver autenticada.
4. Confirmar a fila da CPI e a página `Consultar pessoas` da DeskData.
5. Aplicar o filtro de tipo 29 na CPI.
6. Iniciar o monitor contínuo.

### 4.2 Monitoramento da fila

Em cada verificação, o agente deverá:

1. trazer a aba da CPI para frente;
2. clicar em `Mostrar Tudo`;
3. aguardar a atualização da fila;
4. verificar se existe pesquisa disponível.

Quando não houver pesquisa:

1. registrar estado ocioso no terminal;
2. aguardar 60 segundos;
3. clicar novamente em `Mostrar Tudo`;
4. repetir indefinidamente.

Quando houver pesquisa, o agente deverá iniciar imediatamente um novo ciclo.

## 5. Ciclo de uma pesquisa

1. Abrir somente a primeira pesquisa disponível na CPI.
2. Capturar e validar o CPF.
3. Manter o CPF completo apenas em memória durante o ciclo.
4. Não registrar o CPF completo em logs ou arquivos.
5. Preparar a DeskData para uma nova consulta.
6. Limpar qualquer CPF anterior.
7. Preencher o CPF capturado.
8. Selecionar somente os seis conjuntos aprovados:
   - `basic_data`;
   - `emails_extended`;
   - `addresses_extended`;
   - `phones_extended`;
   - `occupation_data`;
   - `processes`.
9. Enviar exatamente uma consulta à DeskData.
10. Aguardar a rota e o botão de exportação do resultado.
11. Capturar o conteúdo necessário para análise.
12. Classificar o resultado conforme as regras aprovadas.
13. Clicar em `Exportar` exatamente uma vez.
14. Capturar o download iniciado pela aba atual ou pela nova aba.
15. Salvar o PDF em `E:\PDF-AGENTE-CPI` com nome técnico sem CPF ou nome.
16. Validar extensão, tamanho e assinatura `%PDF-`.
17. Preparar os campos da CPI.
18. Anexar o PDF no campo `#MainPage_FileUpload1`.
19. Reaplicar e validar os campos após o anexo.
20. Salvar automaticamente a pesquisa.
21. Aceitar automaticamente o diálogo esperado da CPI.
22. Confirmar que o formulário concluiu a gravação.
23. Retornar a DeskData para `https://deskdata.com.br/pessoas/`.
24. Limpar o campo CPF.
25. Retornar à fila da CPI.
26. iniciar imediatamente a próxima verificação.

## 6. Validações obrigatórias antes da gravação

A ação `Alterar` somente poderá ser executada quando todas as condições forem verdadeiras:

- resultado da DeskData capturado;
- classificação calculada;
- PDF baixado e validado;
- PDF anexado na CPI;
- exatamente um arquivo confirmado no campo de upload;
- `Pesquisador/Fonte` igual a `Desk Data`;
- `Pesquisador/Fonte 1º` igual a `Desk Data`;
- `Status` igual a `Respondida`;
- resultado da CPI coerente com a classificação operacional;
- nenhuma fonte selecionada como `Indefinido`;
- campo de resposta não alterado;
- botão `Alterar` localizado de forma única.

A preparação deverá ser executada antes e depois do anexo para neutralizar alterações causadas pela renderização dinâmica da CPI.

## 7. Confirmação automática da CPI

Após clicar em `Alterar`, o agente deverá aguardar um diálogo do tipo `confirm`.

O diálogo somente será aceito quando a mensagem corresponder ao padrão esperado:

`Deseja Realmente Alterar esta Pesquisa?`

Quando o diálogo for válido:

- clicar automaticamente em `OK`;
- aguardar a navegação ou atualização do formulário;
- registrar a confirmação no terminal.

Qualquer diálogo diferente deverá ser recusado e tratado como erro.

## 8. Proteção contra duplicidade

Cada instância de ciclo deverá possuir controladores novos para impedir reutilização de estado entre pesquisas.

As seguintes ações deverão possuir bloqueio de execução única por ciclo:

- envio da consulta DeskData;
- exportação do PDF;
- anexo do PDF;
- clique em `Alterar`;
- confirmação do diálogo.

O agente não poderá repetir automaticamente uma etapa que possa gerar cobrança, duplicidade ou gravação incorreta.

## 9. Política de erro E1

Qualquer erro interromperá imediatamente todo o ciclo contínuo.

Quando ocorrer uma falha:

- não abrir outra pesquisa;
- não enviar nova consulta DeskData;
- não tentar salvar novamente automaticamente;
- não retornar à fila para continuar;
- manter o navegador aberto;
- registrar a etapa e uma mensagem segura no terminal;
- aguardar intervenção manual;
- não expor CPF completo no erro.

O processo somente poderá ser reiniciado manualmente depois da análise da falha.

## 10. Interrupção por Ctrl+C

O primeiro `Ctrl+C` deverá:

- sinalizar cancelamento;
- impedir o início de uma nova pesquisa;
- interromper a espera de 60 segundos;
- finalizar com segurança quando não houver uma operação crítica em andamento.

Durante uma operação crítica já iniciada, o agente não deverá abandonar a pesquisa em um estado indeterminado. A interrupção será aplicada no próximo ponto seguro.

## 11. Componentes previstos

### `ContinuousResearchRunner`

Responsável pelo laço principal, contagem de ciclos, cancelamento e política E1.

### `SingleResearchCycle`

Responsável por executar exatamente uma pesquisa completa, sem possuir laço interno.

### `CpiQueueMonitor`

Continuará responsável por clicar em `Mostrar Tudo`, verificar disponibilidade e aguardar 60 segundos quando a fila estiver vazia.

### `FullResearchPreparationWorkflow`

Continuará responsável por consulta, classificação, PDF e preparação da CPI.

### `CpiResearchConfirmedSaveController`

Continuará responsável pelo clique único em `Alterar` e aceite seguro do diálogo.

### `DeskDataNextSearchController`

Continuará responsável por retornar para `Consultar pessoas` e limpar o CPF anterior.

## 12. Saída segura no terminal

O terminal poderá apresentar:

- número sequencial do ciclo;
- estado da fila;
- quantidade de verificações;
- CPF mascarado;
- classificação técnica;
- resultado destinado à CPI;
- caminho local do PDF técnico;
- tamanho do PDF;
- confirmação do anexo;
- confirmação da gravação;
- horário da próxima verificação.

O terminal não deverá apresentar CPF completo, nome completo ou conteúdo integral do resultado.

## 13. Testes

A implementação deverá seguir TDD.

Serão exigidos testes para:

- processamento sequencial de duas pesquisas;
- espera de 60 segundos com fila vazia;
- clique em `Mostrar Tudo` em cada verificação;
- retomada automática quando surgir pesquisa;
- gravação sem confirmação textual;
- aceite automático do diálogo esperado;
- bloqueio de diálogo inesperado;
- interrupção imediata pela política E1;
- encerramento por `Ctrl+C`;
- não iniciar novo ciclo após cancelamento;
- criação de novos controladores por pesquisa;
- retorno da DeskData para nova consulta;
- ausência de CPF completo em logs e resultados.

Antes do teste real serão executados:

- Prettier;
- ESLint;
- typecheck;
- testes unitários direcionados;
- testes relacionados;
- `pnpm run validate`.

## 14. Critérios de aceite

A funcionalidade será considerada concluída quando:

1. o agente processar pesquisas em sequência sem confirmação manual;
2. cada pesquisa gerar exatamente uma consulta DeskData;
3. cada pesquisa gerar exatamente um PDF válido;
4. a CPI receber os campos, o resultado e o PDF corretos;
5. o diálogo da CPI for confirmado automaticamente;
6. a DeskData ficar pronta para a próxima consulta;
7. a fila vazia for verificada novamente a cada 60 segundos;
8. o agente permanecer ocioso sem encerrar;
9. qualquer erro interromper todo o processo;
10. `Ctrl+C` encerrar o modo contínuo com segurança.
