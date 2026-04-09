# Variaveis prontas para Render

Com o blueprint atual em [render.yaml](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voithós/render.yaml), a Render cria automaticamente:

- `voithos-postgres`
- `voithos-whatsapp-ng-postgres`
- `voithos-redis`
- `voithos-backend`
- `voithos-whatsapp-ng`
- `voithos-web`

Entao voce **nao precisa preencher manualmente**:

- `DATABASE_URL` do backend
- `DATABASE_URL` do NG
- `REDIS_URL` do NG
- `WEB_CENTRAL_BACKEND_BASE_URL`
- `WHATSAPP_NG_BASE_URL`
- `CENTRAL_BACKEND_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- `APPOINTMENT_ACTION_BASE_URL`

## Campos manuais que restam

### voithos-backend

Preencha:

```env
WHATSAPP_NG_SERVICE_TOKEN=COLE_O_MESMO_VALOR_DE_SERVICE_INTERNAL_API_TOKEN_DO_NG
BACKEND_INTERNAL_API_TOKEN=COLE_UM_TOKEN_LONGO_AQUI
VOITHOS_SUPERADMIN_EMAIL=superadmin@voithos.local
VOITHOS_SUPERADMIN_PASSWORD=COLE_UMA_SENHA_FORTE_AQUI
VOITHOS_SUPERADMIN_CLINIC_EMAIL=platform@voithos.local
VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform
```

### voithos-whatsapp-ng

Preencha:

```env
INTERNAL_API_TOKEN=COLE_UM_TOKEN_INTERNO_DO_NG
SERVICE_INTERNAL_API_TOKEN=COLE_UM_TOKEN_DE_SERVICO_DO_NG
ADMIN_PANEL_TOKEN=COLE_UM_TOKEN_ADMIN_DO_NG
ADMIN_PANEL_READONLY_TOKEN=COLE_UM_TOKEN_READONLY_DO_NG
AUTH_ENCRYPTION_KEY_HEX=COLE_UMA_CHAVE_HEX_64_AQUI
```

### voithos-web

Nenhum campo manual obrigatorio no blueprint atual.

## Regras que precisam bater

- `voithos-backend -> WHATSAPP_NG_SERVICE_TOKEN`
  deve ser igual a:
- `voithos-whatsapp-ng -> SERVICE_INTERNAL_API_TOKEN`

## Regras que nao precisam ser iguais

- `BACKEND_INTERNAL_API_TOKEN`
- `INTERNAL_API_TOKEN` do NG

## AUTH_ENCRYPTION_KEY_HEX

Tem que ser:

- hexadecimal
- com 64 caracteres

Exemplo de formato valido:

```text
0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

## O que o blueprint passa a fazer automaticamente

- cria o Postgres da Voithos
- cria o Postgres do WhatsApp NG
- cria o Redis do NG
- conecta backend ao NG
- conecta NG ao backend
- conecta o web ao backend

## Observacao importante

No backend central, o deploy usa:

```text
npx prisma db push --accept-data-loss
```

Isso foi adotado porque a Voithos central ainda nao tem uma esteira completa de migrations versionadas como o NG. Para o primeiro deploy piloto, isso destrava a subida. Depois do piloto, o proximo endurecimento correto e formalizar as migrations do backend central.
