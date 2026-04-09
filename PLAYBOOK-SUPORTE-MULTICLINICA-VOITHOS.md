# Playbook de Suporte Multi-Clinica Voithos

## Objetivo
Padronizar a triagem, auditoria, reconciliacao e encerramento de incidentes nas clinicas do Voithos, com foco em:

- servicos
- prontuario
- financeiro do paciente
- gestao financeira
- consistencia multi-clinica

Este playbook existe para garantir operacao SaaS confiavel em larga escala, com milhares de clinicas, sem depender de limpeza manual ou analise ad hoc.

## Principios
- Toda analise e correcao deve ser feita por `clinicId`.
- O central e a fonte principal de verdade.
- O shadow local serve como cache operacional, nunca como decisor principal.
- Procedimento e financeiro devem manter relacao `1 procedureId = 1 financialAccount`.
- Nenhuma clinica pode ler, alterar ou herdar dados de outra clinica.

## Dados Minimos do Incidente
Antes de agir, registrar:

- `clinicId`
- usuario logado
- tela onde o erro aparece
- `patientId`
- `prontuario`
- `procedureId`
- `financeId`
- mensagem de erro exibida
- horario aproximado do ocorrido

## Classificacao Rapida
### 1. Servicos
Sintomas:

- erro ao salvar procedimento
- erro de dentista invalido
- procedimento salvo sem reflexo no prontuario
- procedimento salvo sem reflexo no financeiro

### 2. Prontuario
Sintomas:

- paciente errado apos reload
- procedimento aparece e depois some
- detalhes do procedimento incompletos
- exclusao parcial entre ficha clinica e financeiro

### 3. Financeiro do Paciente
Sintomas:

- status pago e pendente divergentes
- procedimento duplicado
- financeiro sem procedimento correspondente
- exclusao nao propaga

### 4. Gestao / Index
Sintomas:

- valores incoerentes
- numeros oscilando no refresh
- valor de outra clinica aparente
- indicador com semantica diferente da tela financeira

## Fluxo Operacional
### Etapa 1. Confirmar Contexto
- confirmar `clinicId` da sessao ativa
- confirmar paciente e clinica no problema relatado
- validar se o erro e reproduzivel

### Etapa 2. Identificar a Fonte
Perguntas obrigatorias:

- a tela esta lendo central ou shadow?
- a tela usa cache/localStorage/sessionStorage?
- o handler usa `clinicId` da sessao?
- o erro e de persistencia, leitura ou sincronizacao?

### Etapa 3. Comparar a Cadeia
Comparar sempre:

- ficha clinica
- financeiro do paciente
- gestao financeira
- index, quando envolver KPI

No caso de procedimento, comparar:

- `procedureId`
- `financeId`
- `paymentStatus`
- `clinicId`

## Invariantes Operacionais
Estas regras devem ser verdadeiras em qualquer clinica:

- `1 procedureId = 1 financialAccount`
- excluir procedimento exclui financeiro vinculado
- excluir financeiro vinculado exclui procedimento
- `Pago / A realizar` = financeiro pago
- `Pago / Realizado` = financeiro pago
- `A realizar / Ag. pagamento` = financeiro pendente
- `Realizado / Ag. pagamento` = financeiro pendente
- reload do prontuario nao pode trocar paciente por storage stale
- dentista selecionado deve pertencer a clinica ativa

## Playbook por Tipo de Incidente
### A. Dentista invalido em Servicos
Checklist:

- confirmar `clinicId` da sessao
- confirmar `dentistaId` enviado
- validar se a UI listou o dentista pelo central
- validar se o backend usou fonte scoped por clinica
- verificar se havia `dentistaId` stale herdado do paciente

Encerrar so quando:

- dentista valido da clinica salvar
- dentista de outra clinica falhar com erro correto
- ausencia de dentista respeitar a regra do fluxo

### B. Procedimento nao refletiu no prontuario
Checklist:

- confirmar se o save foi persistido no central
- confirmar se o reload leu central ou fallback local
- validar se o `procedureId` retornado existe na listagem real do paciente
- verificar se a tela nao esta usando estado otimista apenas

Encerrar so quando:

- o procedimento aparece apos salvar
- continua aparecendo apos reload

### C. Financeiro divergente do procedimento
Checklist:

- localizar `procedureId`
- localizar conta financeira do mesmo `procedureId`
- validar se existe mais de uma conta para o mesmo procedimento
- validar se existe conta sem procedimento ou procedimento sem conta

Encerrar so quando:

- `missingFinance = 0`
- `extraFinance = 0`
- `duplicateFinance = 0`

## Ferramenta de Reconciliacao por Clinica
Existe um handler administrativo:

- `finance.reconcileClinic({ clinicId, dryRun: true })`
- `finance.reconcileClinic({ clinicId, dryRun: false })`

### Modo `dryRun`
Usar primeiro para medir:

- `missingFinance`
- `extraFinance`
- `duplicateFinance`
- `relinkedProcedures`

### Modo `fix`
Usar quando houver divergencia real:

- remove orfaos
- remove duplicados
- cria financeiro faltante
- religa `financeiroId` no procedimento
- reescreve shadow financeiro da clinica a partir do central

## Ordem Correta de Atuacao
1. Auditar
2. Rodar `dryRun`
3. Revisar impacto
4. Rodar `fix`
5. Validar tela
6. Validar multi-clinica
7. Encerrar incidente

## Validacao Pos-Fix
Obrigatorio validar:

- mesmo paciente no prontuario apos reload
- mesmo status em ficha clinica e financeiro
- exclusao em um lado refletindo no outro
- nenhum vazamento para outra clinica

No caso clinico-financeiro, validar:

- `proceduresInFichaClinica`
- `procedureRowsInFinance`
- `missingFinance`
- `extraFinance`
- `duplicateFinance`

## Testes Manuais Minimos por Clinica
1. Criar paciente
2. Abrir prontuario
3. Adicionar procedimento
4. Alterar status para pendente
5. Alterar status para pago
6. Excluir pela ficha clinica
7. Excluir pelo financeiro
8. Dar reload no prontuario
9. Trocar para outra clinica
10. Confirmar isolamento

## Criterios de Encerramento
Um incidente so pode ser encerrado quando:

- o erro foi reproduzido ou auditado com evidencia
- a causa exata foi identificada
- a correcao ficou restrita a clinica ou ao fluxo correto
- os dados ficaram reconciliados
- o comportamento nao vaza entre clinicas

## Sinais de Alerta para Escalacao
Escalar imediatamente quando houver:

- paciente de outra clinica visivel
- dentista de outra clinica sendo aceito
- mais de um financeiro para o mesmo `procedureId`
- procedimento sem `clinicId`
- fallback local mascarando erro do central

## Recomendacoes de Plataforma
Para o Voithos suportar milhares de clinicas:

- manter todas as validacoes sensiveis no backend
- manter reconciliacao automatica por clinica
- padronizar logs com `clinicId`, `patientId`, `procedureId`, `financeId`, `failure_layer`
- exigir regressao multi-clinica antes de release
- nunca depender de limpeza manual como solucao definitiva

## Uso Interno
Este documento deve ser usado por:

- suporte tecnico
- desenvolvimento
- QA
- operacao de incidentes

Quando houver duvida, o principio correto e:

- corrigir por fluxo
- corrigir por fonte de verdade
- corrigir sempre com escopo de clinica
