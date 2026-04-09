# Exemplo de preenchimento na Render

Com o blueprint atual, a tela da Render deve pedir basicamente so os segredos.

## voithos-backend

Preencha assim:

```env
WHATSAPP_NG_SERVICE_TOKEN=SEU_TOKEN_DE_SERVICO_DO_NG
BACKEND_INTERNAL_API_TOKEN=SEU_TOKEN_INTERNO_DO_BACKEND
VOITHOS_SUPERADMIN_EMAIL=superadmin@voithos.local
VOITHOS_SUPERADMIN_PASSWORD=SUA_SENHA_FORTE
VOITHOS_SUPERADMIN_CLINIC_EMAIL=platform@voithos.local
VOITHOS_SUPERADMIN_CLINIC_NAME=Voithos Platform
```

## voithos-whatsapp-ng

Preencha assim:

```env
INTERNAL_API_TOKEN=SEU_TOKEN_INTERNO_DO_NG
SERVICE_INTERNAL_API_TOKEN=SEU_TOKEN_DE_SERVICO_DO_NG
ADMIN_PANEL_TOKEN=SEU_TOKEN_ADMIN_DO_NG
ADMIN_PANEL_READONLY_TOKEN=SEU_TOKEN_READONLY_DO_NG
AUTH_ENCRYPTION_KEY_HEX=SUA_CHAVE_HEX_64
```

## voithos-web

Nenhum segredo manual obrigatorio.

## A unica amarracao obrigatoria

Este valor:

```env
voithos-backend -> WHATSAPP_NG_SERVICE_TOKEN
```

precisa ser exatamente o mesmo deste:

```env
voithos-whatsapp-ng -> SERVICE_INTERNAL_API_TOKEN
```

## O que ja nao precisa mais preencher

- `DATABASE_URL`
- `REDIS_URL`
- `WHATSAPP_NG_BASE_URL`
- `CENTRAL_BACKEND_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- `APPOINTMENT_ACTION_BASE_URL`
- `WEB_CENTRAL_BACKEND_BASE_URL`
