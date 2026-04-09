# Exemplo de preenchimento na Render

Este arquivo usa URLs de exemplo da propria Render para voce subir o primeiro piloto rapido.

## URLs iniciais sugeridas

Use estes nomes de servico:

- `voithos-web`
- `voithos-backend`
- `voithos-whatsapp-ng`

As URLs tipicas ficam assim:

- `WEB_URL=https://voithos-web.onrender.com`
- `API_URL=https://voithos-backend.onrender.com`
- `NG_URL=https://voithos-whatsapp-ng.onrender.com`

Se depois voce colocar dominio proprio, basta trocar essas URLs nas variaveis.

## Segredos que voce precisa gerar

Gere e guarde estes valores:

- `BACKEND_INTERNAL_API_TOKEN`
- `NG_SERVICE_INTERNAL_API_TOKEN`
- `NG_INTERNAL_API_TOKEN`
- `NG_ADMIN_PANEL_TOKEN`
- `NG_ADMIN_PANEL_READONLY_TOKEN`
- `NG_AUTH_ENCRYPTION_KEY_HEX`
- `VOITHOS_SUPERADMIN_PASSWORD`

## Como gerar rapido

### Tokens normais

Pode usar qualquer gerador seguro de string aleatoria longa.

Exemplo de formato:

- 48 a 64 caracteres
- letras maiusculas
- letras minusculas
- numeros

### AUTH_ENCRYPTION_KEY_HEX

Esse precisa ser:

- hexadecimal
- com 64 caracteres

Exemplo de formato valido:

```text
0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

## Exemplo pronto: voithos-web

```env
WEB_CENTRAL_BACKEND_BASE_URL=https://voithos-backend.onrender.com
```

## Exemplo pronto: voithos-backend

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/voithos?sslmode=require
WHATSAPP_NG_BASE_URL=https://voithos-whatsapp-ng.onrender.com
WHATSAPP_NG_SERVICE_TOKEN=COLE_AQUI_O_MESMO_VALOR_DE_NG_SERVICE_INTERNAL_API_TOKEN
BACKEND_INTERNAL_API_TOKEN=COLE_AQUI_SEU_TOKEN_DO_BACKEND
PUBLIC_APP_BASE_URL=https://voithos-web.onrender.com
APPOINTMENT_ACTION_BASE_URL=https://voithos-backend.onrender.com
VOITHOS_SUPERADMIN_EMAIL=superadmin@voithos.local
VOITHOS_SUPERADMIN_PASSWORD=COLE_AQUI_SUA_SENHA_FORTE
VOITHOS_SUPERADMIN_CLINIC_EMAIL=platform@voithos.local
VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform
CLINICAL_DOCUMENTS_STORAGE_ROOT=/var/data/patient-documents
APPOINTMENT_ACTION_TOKEN_TTL_HOURS=36
PLAN_MESSAGE_SCHEDULER_ENABLED=true
PLAN_MESSAGE_SCHEDULER_INTERVAL_MINUTES=60
PLAN_MESSAGE_SCHEDULER_LIMIT_PER_CLINIC=200
PLAN_MESSAGE_DUE_SOON_DAYS=3
```

## Exemplo pronto: voithos-whatsapp-ng

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/whatsapp_engine?sslmode=require
REDIS_HOST=SEU_REDIS_HOST
REDIS_PORT=SEU_REDIS_PORT
REDIS_PASSWORD=SEU_REDIS_PASSWORD
INTERNAL_API_TOKEN=COLE_AQUI_SEU_TOKEN_INTERNO_DO_NG
SERVICE_INTERNAL_API_TOKEN=COLE_AQUI_SEU_TOKEN_DE_SERVICO_DO_NG
CENTRAL_BACKEND_BASE_URL=https://voithos-backend.onrender.com
ADMIN_PANEL_TOKEN=COLE_AQUI_SEU_TOKEN_ADMIN_DO_NG
ADMIN_PANEL_READONLY_TOKEN=COLE_AQUI_SEU_TOKEN_READONLY_DO_NG
AUTH_ENCRYPTION_KEY_HEX=COLE_AQUI_SUA_CHAVE_HEX_64
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

## O que precisa ser igual

### Estes dois precisam ser iguais

- `voithos-backend -> WHATSAPP_NG_SERVICE_TOKEN`
- `voithos-whatsapp-ng -> SERVICE_INTERNAL_API_TOKEN`

### Estes dois nao precisam ser iguais

- `voithos-backend -> BACKEND_INTERNAL_API_TOKEN`
- `voithos-whatsapp-ng -> INTERNAL_API_TOKEN`

## O que revisar depois do primeiro deploy

1. se o login web abrir
2. se o backend responder `/health`
3. se o NG responder `/health`
4. se o web abrir agenda, pacientes e prontuario
5. se a conexao do WhatsApp da clinica piloto subir

## Quando trocar para dominio proprio

Quando voce tiver:

- `app.seudominio.com`
- `api.seudominio.com`
- `ng.seudominio.com`

voce so precisa atualizar:

- `WEB_CENTRAL_BACKEND_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- `APPOINTMENT_ACTION_BASE_URL`
- `WHATSAPP_NG_BASE_URL`
- `CENTRAL_BACKEND_BASE_URL`
