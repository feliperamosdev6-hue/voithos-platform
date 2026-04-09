# Entrega - Mensageria Canonica de Planos

## Diagnostico de Reaproveitamento
- A infraestrutura de `CampaignAudienceSnapshot`, `CampaignBatch` e `CampaignDispatch` ja era suficiente como trilho de execucao e tracking de envio.
- O que nao servia diretamente para planos era o acoplamento `campaign-first` de `CampaignBatch.campaignId` e `CampaignDispatch.campaignId`.
- O que foi generalizado:
  - `CampaignBatch.campaignId` passou a ser opcional
  - `CampaignDispatch.campaignId` passou a ser opcional
  - `campaignRepository` passou a aceitar filtros genericos (`sourceType`, `originType`, `eventType`, `entityType`, `entityId`)
- O que permaneceu especifico de campanhas manuais:
  - CRUD de `Campaign`
  - dashboard/analytics de campanhas usando `sourceType = CAMPAIGN`

## Modelagem Implementada
- `PlanMessageEvent`
  - evento logico por `clinicId + financialAccountId + installmentSequence + eventType`
  - status atual do evento
  - template usado
  - `latestBatchId` / `latestDispatchId`
  - `attemptCount` / `manualResendCount`
  - contexto financeiro (`dueDate`, `amount`, `paymentMethod`, `externalBillingReference`, `paymentUrl`, `barcode`)
- enums:
  - `PlanMessageEventType`
  - `PlanMessageStatus`
- `NotificationEventType` expandido com eventos de mensageria de planos

## Eventos Canonicos
- `PLAN_INSTALLMENT_DUE_SOON`
- `PLAN_INSTALLMENT_DUE_TODAY`
- `PLAN_INSTALLMENT_OVERDUE`
- `PLAN_PAYMENT_CONFIRMED`

## Fonte Dominante
- O financeiro central e a fonte da verdade.
- O vinculo plano -> financeiro continua vindo do `FinancialAccount.externalReference = plan:<planId>`.
- O modulo de planos so agrega contexto de UI/comercial.

## Servicos e Rotas
- `backend/src/services/planMessageService.js`
- `backend/src/services/planMessageTemplateService.js`
- `backend/src/services/messagingDispatchService.js`
- `backend/src/repositories/planMessageRepository.js`
- rotas internas:
  - `GET /internal/financial/plans/:planId/messages`
  - `GET /internal/financial/plans/:planId/messages/suggestions`
  - `POST /internal/financial/plans/:planId/messages/send`
  - `POST /internal/financial/plan-messages/:messageId/resend`

## UI e Desktop
- `planos.js` e `planos.css`
  - historico central por plano/parcela
  - status de envio
  - bloqueio idempotente
  - reenvio manual
  - sugestao de evento por parcela
- adapter/preload/ipc centralizados:
  - `shared/adapters/central-backend-adapter.js`
  - `ipc/plansHandlers.js`
  - `preload.js`
  - `shared/adapters/desktop-adapter.js`
  - `shared/adapters/web-adapter.js`

## Testes Executados
- `node --check` na cadeia nova/alterada de backend, adapter, IPC e frontend
- `npx prisma validate`
- `npx prisma generate`
- SQL aplicada:
  - `prisma/add_plan_message_events.sql`
- prova controlada em 2 clinicas com dados temporarios e limpeza ao final
  - Clinica A:
    - `due_soon`, `due_today`, `overdue` detectados
    - envio bloqueado por consentimento/telefone
    - idempotencia bloqueando duplicidade
    - reenvio manual auditado
    - `plan_payment_confirmed` nascendo do `registerPayment`
  - Clinica B:
    - `due_soon`, `due_today`, `overdue` detectados
    - envio aceito pelo trilho central
    - duplicidade bloqueada
    - reenvio manual gerando nova tentativa

## Isolamento Multi-Clinica
- `PlanMessageEvent` sempre scoped por `clinicId`
- sugestoes, historico, reenvio e dispatch sempre scoped por `clinicId`
- batches e dispatches de uma clinica nao entram nas consultas da outra
- dashboards de campanhas continuam filtrando `sourceType = CAMPAIGN`, sem poluicao dos eventos de planos

## Melhorias Aplicadas Alem do Escopo
- extraido `messagingDispatchService` para nao duplicar regras de `refreshBatchStats` e update de dispatch
- `whatsappNgClient` ganhou `sendMessage` generico, evitando novo cliente paralelo
- `financialService.registerPayment` agora dispara o follow-up canonico de `PLAN_PAYMENT_CONFIRMED`

## Limitacoes Restantes
- ainda nao existe job central automatico de `due_soon / due_today / overdue`; a deteccao ja esta pronta e a UI pode disparar/reenviar
- templates ainda sao canonicos no backend, nao configuraveis por clinica
- `paymentUrl` / `barcode` / `externalBillingReference` ja estao suportados no dominio, mas sem provedor externo plugado nesta etapa

## Classificacao Final
- etapa estrutural concluida
- mensageria de planos agora usa a espinha dorsal central de mensageria da Voithos
- pronta para evoluir para jobs automaticos e integracao futura de boleto/link sem retrabalho de dominio
