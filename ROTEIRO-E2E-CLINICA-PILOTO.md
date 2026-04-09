# Roteiro E2E - Clinica Piloto

Clinica piloto atual:

- `6666fe38-8a65-48a4-b171-dd0203be8b95`
- `Dente de Carneiro`

Objetivo:

- executar ponta a ponta dos fluxos criticos da Voithos
- registrar evidencias por fluxo
- separar claramente:
  - o que ja esta pronto para automacao
  - o que ainda depende de runtime real do WhatsApp

## 1. Pre-flight obrigatorio

### 1.1 Doctor

```powershell
cmd /c npm run doctor:platform:local
```

Esperado:

- Postgres online
- Redis online
- `.env` raiz e NG presentes
- tokens internos configurados

### 1.2 Bootstrap local

```powershell
cmd /c npm run bootstrap:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95
```

Esperado:

- backend central sobe
- NG sobe
- smoke da plataforma executa

### 1.3 Estado atual conhecido

Leitura da ultima execucao real:

- `central.health`: OK
- `ng.health`: OK
- `ng.operations.overview`: OK
- `ng.clinic.<clinicId>`: OK

O que foi corrigido:

- o `smoke --strict` deixou de reprovar a clinica no primeiro ciclo de reconexao do socket
- o readiness agora espera a recuperacao live da instancia antes de concluir falha

Leitura sênior:

- plataforma local sobe
- a clinica piloto ja passa no readiness da plataforma
- o E2E completo nao esta mais bloqueado pelo boot do NG nesta captura

## 2. Fluxos E2E que ja podem rodar

### 2.1 Login e contexto

- login na clinica piloto
- validar `clinicId`
- validar que usuarios e dentistas pertencem a clinica

### 2.2 Paciente e prontuario

- cadastrar paciente
- abrir prontuario
- recarregar
- confirmar persistencia do mesmo paciente

### 2.3 Servicos e financeiro

- criar procedimento sem dentista
- criar procedimento com dentista da clinica
- validar aparicao na ficha clinica
- validar aparicao no financeiro do paciente
- validar reflexo na gestao

### 2.4 Agenda e consultas

- criar consulta na agenda
- validar aparicao em `Prontuario > Consultas`
- marcar `Compareceu`
- marcar `Nao compareceu`
- validar que a presenca clinica nao muda o status principal da agenda

### 2.5 Gestao e index

- index:
  - `Seu dia hoje`
  - `Controle financeiro`
- gestao:
  - faturamento
  - despesas
  - saldo
  - a receber

## 3. Fluxos E2E que dependem de runtime real do WhatsApp

### 3.1 Confirmacao do paciente por WhatsApp

Pre-condicao:

- instancia da clinica conectada de forma estavel
- `smokePassed=true` no readiness da clinica

Fluxo:

- criar agendamento
- disparar confirmacao
- paciente responder `1`
- validar confirmacao da agenda
- paciente responder `2`
- validar remarcacao

### 3.2 Observabilidade do NG

- validar painel admin
- validar overview operacional
- validar configuracoes
- validar readiness da clinica

## 4. Estado atual do bloqueio

No momento desta consolidacao:

- nao ha bloqueio estrutural no boot da plataforma
- a clinica piloto passou no readiness com `smokePassed=true`

Observacao importante:

- ainda pode haver oscilacao real de socket no runtime do WhatsApp, porque isso depende de sessao, rede e provedor
- por isso o fluxo live continua devendo evidencia manual ou automatizada por execucao

## 5. Criterio de liberacao para automacao E2E

Automatizar primeiro:

1. login e contexto
2. paciente e prontuario
3. servicos e financeiro
4. agenda e consultas
5. gestao e index

Automatizar depois:

6. WhatsApp live

Condicao para automatizar WhatsApp live:

- readiness da clinica piloto precisa continuar passando com:
  - `smokePassed=true`

## 6. Registro de evidencia

Para cada fluxo, registrar:

- tela de origem
- payload esperado
- efeito esperado na tela destino
- validacao por `clinicId`
- screenshot ou log quando necessario

## 7. Proximo passo tecnico recomendado

Antes de automatizar o E2E com WhatsApp live:

1. confirmar `smokePassed=true`
2. rerodar:

```powershell
cmd /c npm run smoke:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95
```

Se isso passar:

- a Voithos fica pronta para iniciar a suite E2E por fluxo
