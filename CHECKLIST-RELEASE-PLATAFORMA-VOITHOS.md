# Checklist de Release da Plataforma Voithos

Checklist operacional para liberar app principal, backend central e WhatsApp NG sem regressao multi-clinica.

## 1. Saude basica

- Gate local unico antes da release:
  - `npm run gate:platform:local -- --clinicId=<clinicId>`
- Rodar doctor local antes de qualquer bootstrap:
  - `npm run doctor:platform:local`
- Bootstrap local opcional para suporte:
  - `npm run bootstrap:platform:local -- --clinicId=<clinicId>`
- Validar backend central:
  - `http://127.0.0.1:4000/health`
  - fallback: `http://127.0.0.1:4000/api/health`
- Validar WhatsApp NG:
  - `http://127.0.0.1:8099/health`
- Validar Electron com login e contexto da clinica ativa

## 2. Validacao tecnica

- Rodar checks sintaticos dos arquivos alterados
- Rodar `npx tsc -p whatsapp-engine/tsconfig.json --noEmit`
- Rodar build do NG:
  - `cmd /c npm run build`
- Rodar smoke do NG:
  - `npm run smoke:ng -- --clinicId=<clinicId> --strict`
- Rodar smoke unificado da plataforma:
  - `npm run smoke:platform -- --token=<internalToken> --clinicId=<clinicId> --strict`
  - atalho local: `npm run smoke:platform:local -- --clinicId=<clinicId>`

## 3. Validacao multi-clinica

- Confirmar que cada leitura/escrita usa `clinicId`
- Confirmar que clinicas removidas/stale nao reaparecem no desktop
- Confirmar que o NG so provisiona clinica existente no catalogo central
- Confirmar que deprovisionamento bloqueia clinica com jobs ativos

## 4. Fluxos criticos

- Login da clinica ativa
- Agenda:
  - criar agendamento
  - confirmar via WhatsApp NG
  - marcar presenca clinica no prontuario
- Financeiro:
  - procedimento gera financeiro
  - pagamento reflete em gestao
- Gestao:
  - cards financeiros mostram dados reais
- WhatsApp NG:
  - QR/pairing
  - envio teste
  - overview operacional
  - readiness por clinica

## 5. Observabilidade

- Overview do NG sem cards zerados indevidamente
- Monitor sintetico:
  - `syntheticStatus`
  - `centralStatus`
- Sem clinicas em risco critico sem explicacao
- Sem crescimento anormal de:
  - `blockedJobs`
  - `queuedJobs`
  - `coolingDown`
  - `runtimeFailures`

## 6. Retencao e manutencao

- Confirmar ultima rotina de limpeza no NG
- Confirmar ausencia de erro em `maintenance.lastErrorAt`
- Confirmar que jobs ativos nao foram podados

## 7. Go / No-Go

Liberar release apenas se:

- backend central estiver saudavel
- NG estiver saudavel
- smoke da plataforma passar
- clinica piloto passar no readiness
- nao houver risco critico sem mitigacao
- checklist manual dos fluxos principais estiver ok

Segurar release se:

- houver falha no smoke `--strict`
- overview do NG mostrar clinicas criticas sem causa tratada
- agenda, prontuario ou financeiro quebrarem consistencia
- houver vazamento entre clinicas
