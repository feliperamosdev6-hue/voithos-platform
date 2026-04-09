# Auditoria Campanhas, Planos e Proximos Passos SaaS

## Objetivo

Consolidar o estado atual da Voithos na virada para webapp SaaS, com foco em:

- disparo de campanhas via WhatsApp NG
- planos odontologicos e financeiro associado
- o que ja foi endurecido
- o que ainda falta para suportar milhares de clinicas
- plano ideal para o modulo de planos odontologicos

## Resumo executivo

Leitura objetiva:

- `Campanhas` ja usam o WhatsApp NG como transporte funcional.
- `Campanhas` ainda nao sao um fluxo SaaS completo de ponta a ponta, porque segmentacao, batches, logs de disparo e analytics ainda dependem fortemente de estado local.
- `Planos odontologicos` ja estao bem mais central-first no financeiro e no CRUD.
- `Planos odontologicos` ainda nao possuem um fluxo canonico proprio de mensageria para:
  - confirmacao de pagamento
  - lembrete de boleto a vencer
  - cobranca de boleto vencido
- o nucleo operacional multi-clinica da Voithos esta significativamente mais maduro do que no inicio da migracao.
- o proximo salto correto nao e abrir novos modulos, e sim fechar os fluxos relacionais que ainda estao parcialmente locais.

## Estado atual de Campanhas

### O que ja esta alinhado

- o app principal possui disparo de campanha via WhatsApp:
  - `ipc/whatsappHandlers.js`
  - `services/whatsappService.js`
  - `main.js`
- a mensagem de campanha usa o mesmo transporte do WhatsApp NG ja endurecido para multi-clinica.
- o CRUD de campanhas ja esta `central-first`:
  - `services/campanhasService.js`
  - `shared/adapters/central-backend-adapter.js`

### O que ainda nao esta totalmente alinhado

- logs de campanha ainda dependem de arquivo local:
  - `campaign_logs.json`
- batches de envio ainda dependem de arquivo local:
  - `campaign_send_batches.json`
- a resolucao de audiencia ainda nasce de leituras locais/espelhadas:
  - pacientes
  - agenda
  - financeiro
  - planos
- analytics de campanha ainda dependem desses batches locais.

### Classificacao

- transporte WhatsApp: `ALINHADO`
- CRUD de campanha: `ALINHADO`
- segmentacao e analytics: `PARCIALMENTE ALINHADOS`
- prontidao SaaS de campanhas: `INTERMEDIARIA`

## Estado atual de Planos odontologicos

### O que ja esta alinhado

- o CRUD de planos ja opera `central-first`:
  - `ipc/plansHandlers.js`
  - `shared/adapters/central-backend-adapter.js`
  - `backend/src/services/financialService.js`
- a criacao do plano ja gera conta financeira canonica no backend central.
- o dashboard de planos ja se apoia em financeiro central.
- o modulo esta isolado por `clinicId`.

### O que ainda falta

- nao existe ainda um fluxo canonico dedicado para WhatsApp de planos.
- hoje nao ha, como produto endurecido, os eventos:
  - `plan_payment_confirmed`
  - `plan_installment_due_soon`
  - `plan_installment_overdue`
- nao existe ainda um outbound proprio de planos com:
  - idempotencia por parcela
  - rastreio por `clinicId`
  - historico por paciente/plano/parcela
- nao existe uma trilha clara para boleto:
  - geracao
  - vencimento
  - reenvio
  - confirmacao de pagamento

### Classificacao

- CRUD de planos: `ALINHADO`
- reflexo financeiro: `ALINHADO`
- cobranca e notificacao automatizada: `NAO ALINHADO`
- prontidao SaaS de planos: `INTERMEDIARIA`

## O que ja foi endurecido na Voithos

### Multi-clinica

- usuarios e perfis alinhados ao shape central
- `clinicId` endurecido nos fluxos criticos
- isolamento de procedimentos por clinica
- isolamento de agenda por clinica
- isolamento de financeiro por clinica
- isolamento de prontuario por clinica
- isolacao de dentistas, filtros e responsaveis por clinica

### Agenda e consultas

- agenda separada de presenca clinica
- `Prontuario > Consultas` refletindo:
  - procedimento
  - dentista
  - data
  - horario
  - compareceu / nao compareceu
- fluxo de confirmacao do paciente refletindo em agenda e notificacoes
- idempotencia de envio de confirmacao endurecida

### Financeiro e gestao

- gestao deixou de zerar indevidamente
- index financeiro e gestao alinhados a fonte central
- receitas e despesas com semantica mais coerente
- responsavel dentista refletido na gestao
- filtros por dentista responsavel scoped por clinica

### Documentos e arquivos

- separacao correta entre `Documentos` e `Arquivos`
- anexos centralizados por `clinicId + patientId + documentId`
- metadado documental `central-first`
- storage binario no backend central com espelho local

### Procedimentos

- catalogo da clinica agora `central-first`
- lista e valores respeitando a individualidade da clinica

### Campanhas

- CRUD `central-first`
- disparo funcional via WhatsApp

### Relacionamento

- birthdays com estado clinico movido para o dominio central do paciente:
  - `allowsMessages`
  - `lastBirthdayMessageAt`
  - `birthdayMessageYear`

### WhatsApp NG

- RBAC no painel
- observabilidade operacional
- healthcheck
- readiness e smoke
- limites por clinica
- circuit breaker
- retencao automatica
- onboarding e deprovisioning controlados

## O que ainda falta para SaaS vendavel em escala

### Alta prioridade

- centralizar batches e logs de campanhas
- centralizar segmentacao de campanhas
- criar mensageria canonica de planos odontologicos
- fechar E2E multi-clinica com evidencia versionada
- concluir migracao de configuracoes relacionais restantes

### Media prioridade

- alertas externos do NG por ambiente
- carga real do backend central e do NG
- CI de gate e smoke fora da maquina local
- backup e restore drill

### Baixa prioridade

- refinamentos de UX residual
- dashboards executivos extras
- naming e documentacao de operacao

## Plano ideal para Planos odontologicos

### Fase 1. Semantica canonica

Definir os eventos de negocio do modulo:

- `plan_installment_created`
- `plan_installment_due_soon`
- `plan_installment_due_today`
- `plan_installment_overdue`
- `plan_payment_confirmed`
- `plan_payment_failed`
- `plan_canceled`

Cada evento deve carregar:

- `clinicId`
- `patientId`
- `planId`
- `financialAccountId`
- `installmentSequence`
- `dueDate`
- `amount`
- `paymentMethod`
- `externalBillingReference`

### Fase 2. Fonte canonica

Usar o financeiro central como fonte dominante para lembrar e confirmar pagamento.

Regra:

- plano nao decide vencimento sozinho
- a conta/parcela financeira decide
- o plano so agrega contexto comercial e clinico

### Fase 3. Outbound canonico

Criar um outbound proprio para planos no backend central.

Necessidades:

- idempotencia por `clinicId + financialAccountId + eventType`
- status de envio
- tentativa
- ultima tentativa
- historico por paciente e plano
- integracao com `notification events`

### Fase 4. Templates e conteudo

Criar templates canonicamente versionados:

- lembrete de parcela a vencer
- lembrete de parcela vencida
- confirmacao de pagamento
- regularizacao pendente

Com placeholders seguros:

- `{NOME_PACIENTE}`
- `{NOME_CLINICA}`
- `{NOME_PLANO}`
- `{VALOR}`
- `{VENCIMENTO}`
- `{LINK_PAGAMENTO}` quando existir

### Fase 5. UI do produto

No modulo `Planos`, adicionar:

- status de mensageria por plano/parcela
- historico de lembretes
- reenvio manual com auditoria
- motivo de bloqueio quando ja existir envio pendente

Na agenda/gestao/financeiro, nao duplicar regra de planos.

### Fase 6. Boleto e cobranca

Nao amarrar o produto a um provedor de boleto agora.

Primeiro:

- modelar `externalBillingReference`
- modelar `paymentUrl`
- modelar `barcode` ou equivalente

Depois:

- plugar o provedor real sem refazer o dominio interno

### Fase 7. E2E e observabilidade

Adicionar smoke e E2E especificos:

- criacao de plano
- geracao da conta/parcela
- envio de lembrete
- confirmacao de pagamento
- reflexo em financeiro
- reflexo em notificacoes
- isolamento entre duas clinicas

## Ordem ideal das proximas etapas

### Proximo passo 1

Centralizar `batches`, `logs` e `analytics` de `Campanhas` no backend central.

Motivo:

- remove mais um bloco de estado local
- aproxima marketing/relacionamento do modelo SaaS
- reutiliza o NG ja estabilizado como transporte

### Proximo passo 2

Implementar a primeira versao canonica de notificacoes de `Planos odontologicos`.

Escopo minimo certo:

- lembrete de parcela vencendo
- lembrete de parcela vencida
- confirmacao de pagamento manual/automatica

### Proximo passo 3

Fechar E2E multi-clinica com:

- clinica `dente de carneiro`
- clinica `clinica macacos me mordam`

### Proximo passo 4

Partir para a preparacao do webapp:

- retirar dependencias locais restantes
- endurecer auth web
- revisar storage binario e CDN/object storage

## Classificacao final

- campanhas: `funcionais, mas ainda nao totalmente SaaS`
- planos odontologicos: `financeiramente maduros, mas ainda sem mensageria canonica`
- Voithos como produto multi-clinica: `em estado forte de transicao para SaaS vendavel`
- proxima etapa de maior valor: `Campanhas centralizadas + mensageria canonica de Planos`
