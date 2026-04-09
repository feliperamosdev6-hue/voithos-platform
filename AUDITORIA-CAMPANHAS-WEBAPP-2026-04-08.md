# Auditoria Campanhas + Webapp - 2026-04-08

## Resumo executivo

Leitura objetiva desta rodada:

- `Campanhas` continuam maduras no backend central
- a UI de `Campanhas` no desktop está mais rica e mais próxima de produto
- ainda existe contingência local no serviço desktop de campanhas
- a camada web deixou de estar travada em `auth/contexto` e em `Campanhas`
- o webapp ainda não está pronto, mas saiu do estado totalmente placeholder nesse bloco

## O que observei em Campanhas

### O que já está forte

- CRUD central via backend:
  - `/campaigns`
  - `/campaigns/templates`
  - `/campaigns/dashboard`
  - `/campaigns/resolve-audience`
  - `/campaigns/:id/batches`
  - `/campaigns/logs`
  - `/campaigns/:id/result`
- dashboard de saúde de campanhas no frontend
- preview de segmentação
- logs do dia
- resultado de envio por template
- criação de batch central
- tracking de dispatch central

Evidência:

- `backend/src/routes/campaignRoutes.js`
- `backend/src/controllers/campaignController.js`
- `campanhas.js`

### O que ainda não está 100% limpo

No desktop, `services/campanhasService.js` ainda mantém fallback e contingência local:

- `campaign_logs.json`
- `campaign_send_batches.json`

Isso não é mais a fonte dominante.
Mas ainda existe como fallback operacional quando o central estiver indisponível.

Leitura sênior:

- isso é aceitável no desktop enquanto o rollout web não fecha
- não deve ser levado como fonte principal para o webapp

### Classificação atual de Campanhas

- backend central: `FORTE`
- UI desktop: `FORTE`
- fallback local residual: `CONTROLADO`
- prontidão para reaproveitamento no webapp: `BOA`

## O que foi fechado agora na camada web

Em `shared/adapters/web-adapter.js` entrou o primeiro bloco funcional real do webapp:

### Auth/contexto

- `auth.login`
- `auth.signup`
- `auth.logout`
- `auth.currentUser`
- `auth.currentContext`
- `auth.changePassword`
- `auth.listClinics`

### Clínica

- `clinic.get`
- `clinic.save`

### Campanhas

- `campanhas.list`
- `campanhas.create`
- `campanhas.update`
- `campanhas.remove`
- `campanhas.dashboard`
- `campanhas.templates`
- `campanhas.createSendBatch`
- `campanhas.logDelivery`
- `campanhas.logsList`
- `campanhas.resolveAudience`
- `campanhas.result`

### Sessão web

Também entrou persistência simples no browser para:

- token
- usuário
- clínica

## Impacto real desta etapa

Antes desta rodada, o `web-adapter` era praticamente um mapa de placeholders.

Agora:

- login web já tem caminho real
- contexto de clínica já tem caminho real
- `Campanhas` já têm caminho real no web

Métrica objetiva desta rodada:

- `notImplemented(` no `web-adapter`
  - antes: `115`
  - agora: `102`

Ou seja:

- ainda há muita lacuna
- mas o bloco mais estratégico para abrir a frente web já começou a ser fechado

## O que ainda falta na camada web

Os maiores blocos restantes continuam sendo:

- agenda
- pacientes/prontuário
- serviços
- documentos
- financeiro
- planos
- relacionamento
- laboratório
- notificações
- procedimentos

## Classificação final desta rodada

- campanhas centrais: `PRONTAS PARA REUSO WEB`
- auth/contexto web: `BASICO FUNCIONAL`
- clínica web: `BASICO FUNCIONAL`
- campanhas web: `PRIMEIRO BLOCO FUNCIONAL`
- webapp como produto: `AINDA INCOMPLETO`

## Próximo passo correto

Seguir exatamente na frente de fechamento da camada web com:

1. `Agenda`
2. `Pacientes`
3. `Financeiro/Planos`

Essa é a ordem correta porque:

- destrava uso diário real
- reduz dependência do desktop
- reaproveita o núcleo central que já está maduro
