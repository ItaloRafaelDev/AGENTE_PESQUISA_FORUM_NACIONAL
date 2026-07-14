# Relatório Seguro de Classificação DeskData

## Objetivo

Integrar a classificação automática ao script de inspeção da DeskData e exibir somente informações técnicas seguras no terminal.

## Fluxo

1. Capturar e sanitizar o resultado.
2. Criar o snapshot.
3. Classificar o snapshot.
4. Salvar JSON e TXT.
5. Gerar o relatório seguro.
6. Exibir o relatório no terminal.

## Novo componente

Arquivo: src/automation/deskdata/deskdata-classification-report-formatter.ts

Interface pública:

DeskDataClassificationReportFormatter.format(result): string[]

## Saída esperada

Classificação técnica: CONSTA_RESTRICAO
Resultado destinado à CPI: Sim, Consta Restrições
Possui processos: Sim
Possui processos criminais: Sim
Natureza identificável: Sim
Resultado válido: Sim

Os valores booleanos devem ser exibidos somente como Sim ou Não.

## Segurança

O relatório não pode exibir CPF completo, nome, número processual, conteúdo bruto, tabelas, credenciais ou URLs com dados pessoais.

O formatador será puro e não acessará navegador, arquivos, terminal ou variáveis de ambiente.

## Testes

A implementação seguirá RED, GREEN, teste direcionado, integração e pnpm run validate.

## Critérios de aceite

- Classificação técnica correta.
- Rótulo destinado à CPI correto.
- Indicadores booleanos em português.
- Nenhum dado sensível no relatório.
- Três capturas reais continuam classificadas corretamente.
- pnpm run validate sem erros.
