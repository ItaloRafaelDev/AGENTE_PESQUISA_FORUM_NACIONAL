# Relatório Seguro de Classificação DeskData - Plano de Implementação

## Objetivo

Classificar o snapshot capturado e exibir no terminal somente informações técnicas seguras.

## Restrições globais

- Windows e PowerShell.
- Gerenciador pnpm.
- Implementação obrigatoriamente via TDD.
- Parar imediatamente em qualquer erro.
- Não exibir CPF completo, nomes, números processuais ou conteúdo bruto.
- Não alterar os arquivos JSON e TXT já gerados.
- O projeto não está configurado como repositório Git; não executar commits.

## Arquivos

- Criar: src/automation/deskdata/deskdata-classification-report-formatter.ts
- Criar: tests/unit/automation/deskdata/deskdata-classification-report-formatter.test.ts
- Modificar: scripts/inspect-deskdata-process-result.ts
- Manter: src/automation/deskdata/deskdata-inspection-classifier.ts
- Manter: src/domain/research/get-cpi-classification-label.ts

## Etapa 1 - Teste RED do formatador

Criar um teste que exija exatamente seis linhas seguras:

1. Classificação técnica.
2. Resultado destinado à CPI.
3. Possui processos.
4. Possui processos criminais.
5. Natureza identificável.
6. Resultado válido.

Executar somente o teste direcionado e confirmar falha por módulo inexistente.

## Etapa 2 - Implementação GREEN

Criar DeskDataClassificationReportFormatter.

O método format deve receber DeskDataInspectionClassification e retornar string[].

Os booleanos devem ser convertidos para Sim ou Não.

O rótulo da CPI deve ser obtido por getCpiClassificationLabel.

Executar novamente o teste direcionado e exigir aprovação.

## Etapa 3 - Teste de segurança

Adicionar teste confirmando que a saída não contém CPF, número processual ou conteúdo do snapshot.

O formatador não receberá o snapshot bruto, apenas o resultado técnico da classificação.

## Etapa 4 - Integração no script

Após criar o snapshot:

1. Executar DeskDataInspectionClassifier.classify(snapshot).
2. Executar DeskDataClassificationReportFormatter.format(result).
3. Salvar JSON e TXT sem alterações.
4. Exibir cada linha segura com console.log.

## Etapa 5 - Verificação

Executar o teste direcionado do formatador.

Executar o teste de integração com as três capturas reais.

Executar pnpm run validate.

## Critérios de conclusão

- Relatório com exatamente seis linhas.
- Rótulo destinado à CPI correto.
- Booleanos em português.
- Nenhum dado pessoal ou processual no terminal.
- Três amostras reais continuam classificadas corretamente.
- pnpm run validate sem erros.
