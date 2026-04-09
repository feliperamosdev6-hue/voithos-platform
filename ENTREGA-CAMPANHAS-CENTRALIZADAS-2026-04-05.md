# Entrega Campanhas Centralizadas - 2026-04-05

## Diagnostico final

### O que estava local antes

- `campaign_logs.json`
- `campaign_send_batches.json`
- resolucao de audiencia em `services/campanhasService.js`
- analytics de campanha calculado sobre:
  - pacientes locais
  - agenda local
  - planos locais
  - financeiro local
- frontend ainda montando a audiencia final no renderer

### O que ja estava central-first antes

- CRUD de campanhas, mas ainda guardado em `Clinic.operationalSettings.campaigns`
- transporte de campanha via WhatsApp NG
- isolamento por `clinicId` no desktop

## O que foi centralizado nesta etapa

### Modelagem canonica

Entraram no schema:

- `Campaign`
- `CampaignAudienceSnapshot`
- `CampaignAudienceSnapshotMember`
- `CampaignBatch`
- `CampaignDispatch`

Enums novos:

- `CampaignChannel`
- `CampaignStatus`
- `CampaignBatchStatus`
- `CampaignDispatchStatus`

### Backend central

Arquivos criados:

- `backend/src/repositories/campaignRepository.js`
- `backend/src/services/campaignService.js`
- `backend/src/controllers/campaignController.js`
- `backend/src/routes/campaignRoutes.js`
- `prisma/add_campaign_messaging_tables.sql`

Arquivos alterados:

- `prisma/schema.prisma`
- `backend/src/server.js`
- `backend/src/controllers/clinicController.js`
- `backend/src/repositories/patientRepository.js`
- `backend/src/repositories/patientClinicalRepository.js`
- `backend/src/repositories/financialRepository.js`

### Adapter e desktop

Arquivos alterados:

- `shared/adapters/central-backend-adapter.js`
- `services/campanhasService.js`
- `campanhas.js`
- `campanhas.css`

## O que o backend central passou a decidir

- criacao/edicao/exclusao de campanha
- migracao automatica do legado em `operationalSettings.campaigns`
- resolucao de audiencia por `clinicId`
- snapshot da audiencia
- batches centrais
- dispatch unitario por destinatario
- status do dispatch
- analytics basicos por campanha
- dashboard operacional de campanhas
- historico de logs central

## Segmentacao central implementada

Primeira versao:

- `all_active`
- `birthday_month`
- `inactive_90`
- `inactive_180`
- `never_cleaning`
- `plan_overdue`
- `financial_pending`
- `with_plan`
- `by_dentist`
- `appointment_window`

## Idempotencia e batches

Implementado:

- batch central por campanha e `clinicId`
- snapshot por campanha e `clinicId`
- dispatch individual por destinatario
- bloqueio de duplicidade por chave logica:
  - `campaignId + patientId + channel + dispatchType`
- batches recentes reaproveitaveis para evitar duplicacao de criacao concorrente

## Multi-clinica

O isolamento ficou explicito em:

- `Campaign.clinicId`
- `CampaignAudienceSnapshot.clinicId`
- `CampaignAudienceSnapshotMember.clinicId`
- `CampaignBatch.clinicId`
- `CampaignDispatch.clinicId`

E tambem nos services/repositories:

- toda consulta filtrada por `clinicId`
- audiencia resolvida somente com dados da clinica
- batch e dispatch criados somente no escopo da clinica

## Observabilidade

Logs estruturados adicionados:

- `campaign_created`
- `campaign_updated`
- `campaign_deleted`
- `campaign_legacy_seeded`
- `campaign_replace_completed`
- `campaign_audience_resolved`
- `campaign_batch_created`
- `campaign_dispatch_started`
- `campaign_dispatch_completed`
- `campaign_dispatch_failed`
- `campaign_dispatch_blocked`
- `campaign_analytics_loaded`

Campos recorrentes:

- `clinicId`
- `campaignId`
- `batchId`
- `dispatchId`
- `audienceSize`
- `status`
- `campaign_source=central`

Fallback explicito no desktop:

- `campaign_fallback_to_local=true`

## Provas executadas

### Validacoes de codigo

- `node --check backend/src/services/campaignService.js`
- `node --check backend/src/repositories/campaignRepository.js`
- `node --check backend/src/controllers/campaignController.js`
- `node --check backend/src/routes/campaignRoutes.js`
- `node --check services/campanhasService.js`
- `node --check campanhas.js`
- `node --check shared/adapters/central-backend-adapter.js`
- `node --check backend/src/controllers/clinicController.js`
- `node --check backend/src/server.js`
- `node --check backend/src/repositories/patientRepository.js`
- `node --check backend/src/repositories/patientClinicalRepository.js`
- `node --check backend/src/repositories/financialRepository.js`
- `node --check backend/src/routes/clinicRoutes.js`

### Prisma

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma db execute --file prisma/add_campaign_messaging_tables.sql --schema prisma/schema.prisma`

### Prova controlada multi-clinica sem envio real

Executado via service central:

1. criar campanha temporaria em `clinica dente de carneiro`
2. resolver audiencia
3. criar batch
4. atualizar dispatch para `SENT`
5. carregar logs
6. carregar analytics
7. soft delete da campanha
8. repetir em `clinica macacos me mordam`

Resultado observado:

- clinica A:
  - audiencia `4`
  - batch criado
  - logs centralizados
  - analytics centralizados
- clinica B:
  - audiencia `2`
  - batch criado
  - falha registrada sem vazar para clinica A
  - logs centralizados
  - analytics centralizados

## O que ainda fica como limitacao controlada

- templates globais continuam locais
- transporte ainda e executado pelo cliente via NG, com tracking central
- nao existe worker central dedicado de campanhas ainda
- analytics ainda sao basicos, sem BI
- o fallback local continua existindo para indisponibilidade real do central

## Classificacao final

- CRUD de campanhas: `CENTRALIZADO`
- audiencia: `CENTRALIZADA`
- snapshot de audiencia: `CENTRALIZADO`
- batches: `CENTRALIZADOS`
- dispatch tracking: `CENTRALIZADO`
- logs: `CENTRALIZADOS`
- analytics basicos: `CENTRALIZADOS`
- transporte: `NG MANTIDO`
- multi-clinica: `ISOLADO POR clinicId`

Leitura final:

`Campanhas` deixou de depender estruturalmente de estado local para operar normalmente.

Esta etapa ja funciona como a primeira espinha dorsal da mensageria central da Voithos e prepara o caminho para:

- `plan_installment_due_soon`
- `plan_installment_overdue`
- `plan_payment_confirmed`
- aniversarios
- relacionamento
- reativacao
