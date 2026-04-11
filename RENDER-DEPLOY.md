# Render deployment da Voithos

## Arquitetura recomendada

Para a fase inicial de lancamento da Voithos na Render, o desenho mais seguro e simples e:

- `voithos-web`: Static Site
- `voithos-backend`: Web Service Node
- `voithos-whatsapp-ng`: Web Service Node com `API + worker` no mesmo servico
- PostgreSQL externo ou gerenciado
- Redis externo ou gerenciado
- object storage para anexos e documentos

Esse corte evita abrir um segundo servico so para o worker do NG enquanto a operacao ainda esta enxuta. O motor NG ja roda hoje em modo combinado via `start:all:headless`, que e o melhor encaixe para Render neste momento.

## Por que o NG sobe como um servico unico

O engine do WhatsApp usa:

- API HTTP
- worker BullMQ
- sessao em `SESSIONS_DIR`
- serializacao de auth em `authBlobEncrypted`

Mesmo com a persistencia do auth blob, separar API e worker em servicos diferentes na primeira subida aumenta risco operacional sem ganho real para o seu estagio atual. Na Render, o caminho prudente agora e subir o NG combinado.

## Variaveis do backend

Minimo obrigatorio em `voithos-backend`:

- `DATABASE_URL`
- `JWT_SECRET`
- `WHATSAPP_NG_BASE_URL`
- `BACKEND_INTERNAL_API_TOKEN`
- `PUBLIC_APP_BASE_URL`
- `APPOINTMENT_ACTION_BASE_URL`

Recomendadas:

- `CLINICAL_DOCUMENTS_STORAGE_ROOT=/var/data/patient-documents`
- `PLAN_MESSAGE_SCHEDULER_ENABLED=true`
- `APPOINTMENT_REMINDER_SCHEDULER_ENABLED=true`

## Variaveis do WhatsApp NG

Minimo obrigatorio em `voithos-whatsapp-ng`:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD` se houver
- `INTERNAL_API_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`
- `CENTRAL_BACKEND_BASE_URL`
- `ADMIN_PANEL_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX`

Recomendada:

- `SESSIONS_DIR=.sessions`

Observacao operacional:

- o build do `voithos-whatsapp-ng` compila TypeScript e roda Prisma CLI
- por isso, no Render, o install do servico precisa incluir `devDependencies`
- no blueprint atual isso ja fica coberto por `npm ci --include=dev --no-audit --no-fund && npm run build`
- o blueprint tambem sincroniza `WHATSAPP_NG_SERVICE_TOKEN` e `CENTRAL_BACKEND_SERVICE_TOKEN` entre os servicos

## Variavel do frontend web

Em `voithos-web`:

- `WEB_CENTRAL_BACKEND_BASE_URL=https://SEU-BACKEND.onrender.com`

O build gera `render-static/runtime-config.js` e injeta esse arquivo nas paginas HTML para o web adapter saber qual backend central usar.

## Ordem de criacao dos servicos

1. Criar o banco PostgreSQL
2. Criar o Redis
3. Criar `voithos-whatsapp-ng`
4. Criar `voithos-backend`
5. Criar `voithos-web`

## Ordem de configuracao

1. Configurar `DATABASE_URL` do NG
2. Configurar `DATABASE_URL` do backend
3. Configurar `REDIS_*` do NG
4. Configurar tokens internos em backend e NG
5. Publicar NG
6. Publicar backend apontando para o NG
7. Publicar frontend apontando para o backend

## Topologia de dominio recomendada

- `app.voithos...` -> `voithos-web`
- `api.voithos...` -> `voithos-backend`
- `ng.voithos...` -> `voithos-whatsapp-ng`

## Limites atuais antes de escala maior

Esse blueprint deixa a Voithos pronta para:

- pilotos pagos
- primeiras clinicas reais
- crescimento inicial com baixo custo

Antes de escalar de verdade para muitas clinicas simultaneas, o proximo endurecimento correto e:

- mover anexos clinicos para object storage canonico
- adicionar CI/CD
- adicionar staging
- padronizar backup/restore
- revisar o restante da camada web ainda nao implementada
