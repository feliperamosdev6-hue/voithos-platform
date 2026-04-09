# Variaveis prontas para Render

Use este arquivo como folha de preenchimento antes de criar os servicos.

## URLs finais

Preencha primeiro estas tres URLs:

- `WEB_URL=https://app.voithos.com.br`
- `API_URL=https://api.voithos.com.br`
- `NG_URL=https://ng.voithos.com.br`

Se no inicio voce ainda for usar subdominios da propria Render, troque temporariamente pelos dominios `.onrender.com`.

## Bancos

A Voithos deve usar **duas** `DATABASE_URL` diferentes:

- `BACKEND_DATABASE_URL`
  exemplo: `postgresql://USER:PASSWORD@HOST/voithos?sslmode=require`
- `WHATSAPP_ENGINE_DATABASE_URL`
  exemplo: `postgresql://USER:PASSWORD@HOST/whatsapp_engine?sslmode=require`

Pode ser o mesmo cluster Postgres, desde que sejam bancos separados.

## Redis do WhatsApp NG

Se usar Upstash ou outro Redis gerenciado, extraia:

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

## Segredos compartilhados

Esses valores devem ser gerados por voce e guardados:

- `BACKEND_INTERNAL_API_TOKEN=COLE_UM_TOKEN_LONGO_AQUI`
- `NG_SERVICE_INTERNAL_API_TOKEN=COLE_UM_TOKEN_LONGO_AQUI`
- `NG_ADMIN_PANEL_TOKEN=COLE_UM_TOKEN_LONGO_AQUI`
- `NG_ADMIN_PANEL_READONLY_TOKEN=COLE_UM_TOKEN_LONGO_AQUI`
- `NG_AUTH_ENCRYPTION_KEY_HEX=COLE_64_CARACTERES_HEX_AQUI`
- `VOITHOS_SUPERADMIN_EMAIL=superadmin@seudominio.com`
- `VOITHOS_SUPERADMIN_PASSWORD=COLE_UMA_SENHA_FORTE_AQUI`
- `VOITHOS_SUPERADMIN_CLINIC_EMAIL=platform@seudominio.com`
- `VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform`

## Regra de amarracao entre servicos

Esses campos precisam bater:

- `voithos-backend -> WHATSAPP_NG_SERVICE_TOKEN`
  valor: o mesmo de `NG_SERVICE_INTERNAL_API_TOKEN`
- `voithos-whatsapp-ng -> SERVICE_INTERNAL_API_TOKEN`
  valor: o mesmo de `NG_SERVICE_INTERNAL_API_TOKEN`
- `voithos-whatsapp-ng -> CENTRAL_BACKEND_BASE_URL`
  valor: `API_URL`
- `voithos-web -> WEB_CENTRAL_BACKEND_BASE_URL`
  valor: `API_URL`
- `voithos-backend -> PUBLIC_APP_BASE_URL`
  valor: `WEB_URL`
- `voithos-backend -> APPOINTMENT_ACTION_BASE_URL`
  valor: `API_URL`
- `voithos-backend -> WHATSAPP_NG_BASE_URL`
  valor: `NG_URL`

## 1. voithos-web

Cole estas variaveis no servico estatico:

```env
WEB_CENTRAL_BACKEND_BASE_URL=API_URL
```

Substituicao pratica:

```env
WEB_CENTRAL_BACKEND_BASE_URL=https://api.voithos.com.br
```

## 2. voithos-backend

Cole estas variaveis no backend:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=BACKEND_DATABASE_URL
WHATSAPP_NG_BASE_URL=NG_URL
WHATSAPP_NG_SERVICE_TOKEN=NG_SERVICE_INTERNAL_API_TOKEN
BACKEND_INTERNAL_API_TOKEN=BACKEND_INTERNAL_API_TOKEN
PUBLIC_APP_BASE_URL=WEB_URL
APPOINTMENT_ACTION_BASE_URL=API_URL
VOITHOS_SUPERADMIN_EMAIL=superadmin@seudominio.com
VOITHOS_SUPERADMIN_PASSWORD=COLE_UMA_SENHA_FORTE_AQUI
VOITHOS_SUPERADMIN_CLINIC_EMAIL=platform@seudominio.com
VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform
CLINICAL_DOCUMENTS_STORAGE_ROOT=/var/data/patient-documents
APPOINTMENT_ACTION_TOKEN_TTL_HOURS=36
PLAN_MESSAGE_SCHEDULER_ENABLED=true
PLAN_MESSAGE_SCHEDULER_INTERVAL_MINUTES=60
PLAN_MESSAGE_SCHEDULER_LIMIT_PER_CLINIC=200
PLAN_MESSAGE_DUE_SOON_DAYS=3
```

Exemplo com URL real:

```env
WHATSAPP_NG_BASE_URL=https://ng.voithos.com.br
PUBLIC_APP_BASE_URL=https://app.voithos.com.br
APPOINTMENT_ACTION_BASE_URL=https://api.voithos.com.br
```

## 3. voithos-whatsapp-ng

Cole estas variaveis no NG:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=WHATSAPP_ENGINE_DATABASE_URL
REDIS_HOST=SEU_REDIS_HOST
REDIS_PORT=SEU_REDIS_PORT
REDIS_PASSWORD=SEU_REDIS_PASSWORD
INTERNAL_API_TOKEN=COLE_UM_TOKEN_LONGO_AQUI
SERVICE_INTERNAL_API_TOKEN=NG_SERVICE_INTERNAL_API_TOKEN
CENTRAL_BACKEND_BASE_URL=API_URL
ADMIN_PANEL_TOKEN=NG_ADMIN_PANEL_TOKEN
ADMIN_PANEL_READONLY_TOKEN=NG_ADMIN_PANEL_READONLY_TOKEN
AUTH_ENCRYPTION_KEY_HEX=NG_AUTH_ENCRYPTION_KEY_HEX
SESSIONS_DIR=.sessions
WORKER_CONCURRENCY=4
WORKER_LOCK_DURATION_MS=120000
WORKER_STALLED_INTERVAL_MS=60000
MESSAGE_MAX_ATTEMPTS=3
MESSAGE_BACKOFF_MS=4000
SERVER_MAX_ACTIVE_JOBS_GLOBAL=5000
SERVER_MAX_ACTIVE_JOBS_PER_CLINIC=250
MAINTENANCE_CLEANUP_INTERVAL_MS=3600000
RETENTION_MESSAGE_JOBS_DAYS=14
RETENTION_MESSAGE_LOGS_DAYS=14
RETENTION_OPERATIONAL_EVENTS_DAYS=14
CLINIC_SLA_WARNING_RATE_PCT=98
CLINIC_SLA_CRITICAL_RATE_PCT=90
SYNTHETIC_MONITOR_INTERVAL_MS=120000
SYNTHETIC_ALERT_COOLDOWN_MS=900000
INSTANCE_SEND_COOLDOWN_BASE_MS=10000
INSTANCE_SEND_COOLDOWN_MAX_MS=90000
INSTANCE_CIRCUIT_BREAKER_THRESHOLD=4
INSTANCE_CIRCUIT_BREAKER_WINDOW_MS=180000
INSTANCE_CIRCUIT_BREAKER_OPEN_MS=300000
RUNTIME_RECOVERY_CONCURRENCY=4
RUNTIME_RECOVERY_DELAY_MS=250
RECONNECT_BASE_DELAY_MS=3000
RECONNECT_MAX_DELAY_MS=45000
WHATSAPP_APPOINTMENT_QUICK_REPLIES_ENABLED=false
```

## Valores opcionais para depois

Nao precisa travar o primeiro deploy por causa deles:

- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_WEBHOOK_TOKEN`
- `SYNTHETIC_MONITOR_CLINIC_IDS`

## Checklist rapido antes de clicar em Deploy

- `DATABASE_URL` do backend aponta para o banco `voithos`
- `DATABASE_URL` do NG aponta para o banco `whatsapp_engine`
- `WHATSAPP_NG_SERVICE_TOKEN` no backend e `SERVICE_INTERNAL_API_TOKEN` no NG sao iguais
- `WEB_CENTRAL_BACKEND_BASE_URL` aponta para o backend
- `PUBLIC_APP_BASE_URL` aponta para o frontend
- `CENTRAL_BACKEND_BASE_URL` no NG aponta para o backend
- `AUTH_ENCRYPTION_KEY_HEX` tem 64 caracteres hexadecimais

## Ordem de subida

1. `voithos-whatsapp-ng`
2. `voithos-backend`
3. `voithos-web`

## Testes logo apos deploy

- abrir `WEB_URL`
- fazer login
- abrir `Agenda`
- abrir `Pacientes`
- abrir `Prontuario`
- abrir `Campanhas`
- abrir `Relacionamento`
- abrir `Planos`
- conectar 1 clinica no NG
- enviar 1 confirmacao de consulta
