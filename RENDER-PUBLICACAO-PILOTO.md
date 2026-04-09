# Publicacao piloto da Voithos na Render

## Objetivo

Subir a primeira versao web/piloto da Voithos com custo baixo, sem quebrar:

- backend central
- WhatsApp NG
- multi-clinica
- agenda, prontuario, financeiro, campanhas e relacionamento

## Stack recomendada para comecar barato

- `Render Static Site` para `voithos-web`
- `Render Web Service` para `voithos-backend`
- `Render Web Service` para `voithos-whatsapp-ng`
- `Neon` ou `Render Postgres` para banco
- `Upstash Redis` ou Redis gerenciado para o NG

Se o foco for o menor custo inicial com menos servicos pagos dentro da Render, a combinacao mais economica tende a ser:

- compute na Render
- Postgres no Neon
- Redis no Upstash

## Servicos a criar

### 1. voithos-whatsapp-ng

- Tipo: `Web Service`
- Root directory: `whatsapp-engine`
- Build command: `npm ci && npm run build`
- Start command: `npm run start:all:headless`
- Health check path: `/health`

### 2. voithos-backend

- Tipo: `Web Service`
- Root directory: `.`
- Build command: `npm ci && npx prisma generate`
- Start command: `npm run backend:start`
- Health check path: `/health`

### 3. voithos-web

- Tipo: `Static Site`
- Root directory: `.`
- Build command: `node scripts/build-render-web.mjs`
- Publish directory: `render-static`

## Variaveis de ambiente

### voithos-whatsapp-ng

Obrigatorias:

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `REDIS_HOST=...`
- `REDIS_PORT=...`
- `REDIS_PASSWORD=...` se houver
- `INTERNAL_API_TOKEN=...`
- `SERVICE_INTERNAL_API_TOKEN=...`
- `CENTRAL_BACKEND_BASE_URL=https://SEU-BACKEND.onrender.com`
- `ADMIN_PANEL_TOKEN=...`
- `ADMIN_PANEL_READONLY_TOKEN=...`
- `AUTH_ENCRYPTION_KEY_HEX=...`

Recomendadas:

- `SESSIONS_DIR=.sessions`
- `WHATSAPP_APPOINTMENT_QUICK_REPLIES_ENABLED=false`
- `WORKER_CONCURRENCY=4`
- `MESSAGE_MAX_ATTEMPTS=3`

### voithos-backend

Obrigatorias:

- `NODE_ENV=production`
- `DATABASE_URL=...`
- `WHATSAPP_NG_BASE_URL=https://SEU-NG.onrender.com`
- `WHATSAPP_NG_SERVICE_TOKEN=` mesmo valor de `SERVICE_INTERNAL_API_TOKEN` do NG
- `BACKEND_INTERNAL_API_TOKEN=...`
- `PUBLIC_APP_BASE_URL=https://SEU-WEB.onrender.com`
- `APPOINTMENT_ACTION_BASE_URL=https://SEU-BACKEND.onrender.com`
- `VOITHOS_SUPERADMIN_EMAIL=...`
- `VOITHOS_SUPERADMIN_PASSWORD=...`
- `VOITHOS_SUPERADMIN_CLINIC_EMAIL=...`
- `VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform`

Recomendadas:

- `CLINICAL_DOCUMENTS_STORAGE_ROOT=/var/data/patient-documents`
- `PLAN_MESSAGE_SCHEDULER_ENABLED=true`
- `PLAN_MESSAGE_SCHEDULER_INTERVAL_MINUTES=60`
- `PLAN_MESSAGE_SCHEDULER_LIMIT_PER_CLINIC=200`
- `PLAN_MESSAGE_DUE_SOON_DAYS=3`
- `APPOINTMENT_ACTION_TOKEN_TTL_HOURS=36`

### voithos-web

Obrigatoria:

- `WEB_CENTRAL_BACKEND_BASE_URL=https://SEU-BACKEND.onrender.com`

## Segredos: como gerar

Para tokens e chaves, use valores longos e aleatorios.

Exemplos de campos que nao devem usar placeholder:

- `BACKEND_INTERNAL_API_TOKEN`
- `INTERNAL_API_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`
- `ADMIN_PANEL_TOKEN`
- `ADMIN_PANEL_READONLY_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX`
- `VOITHOS_SUPERADMIN_PASSWORD`

## Ordem correta de publicacao

1. Criar banco e Redis
2. Publicar `voithos-whatsapp-ng`
3. Publicar `voithos-backend`
4. Publicar `voithos-web`
5. Atualizar `PUBLIC_APP_BASE_URL` e `WEB_CENTRAL_BACKEND_BASE_URL` se a URL final mudar
6. Fazer novo deploy rapido se necessario

## Checklist de primeiro deploy

### Infra

- banco acessivel
- Redis acessivel
- `voithos-whatsapp-ng/health` responde
- `voithos-backend/health` responde
- `voithos-web` abre login

### Integracao

- login funciona
- lista de clinicas funciona
- agenda abre
- pacientes abrem
- prontuario abre
- campanhas abrem
- relacionamento abre
- planos abrem

### WhatsApp NG

- conectar uma clinica piloto
- enviar confirmacao de consulta
- responder `1`
- validar reflexo na agenda

### Planos

- disparar automacao em dry-run
- validar historico
- confirmar pagamento de parcela

## Checkpoint antes de liberar para clinicas reais

- pelo menos 1 clinica piloto ativa
- backup do banco habilitado
- logins funcionando no web
- confirmacao de consulta funcionando
- campanhas funcionando
- planos com historico de notificacao funcionando
- storage de documentos revisado

## Melhorias logo depois do primeiro deploy

1. colocar dominio proprio
2. ativar object storage para documentos
3. criar staging
4. configurar monitoramento e alertas
5. fechar o restante da camada web ainda nao implementada
