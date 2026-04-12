# Render clique a clique

## Caminho recomendado

Para o primeiro deploy barato da Voithos:

- Render para `web`, `backend` e `whatsapp-ng`
- Neon para os 2 bancos Postgres
- Upstash para o Redis

## Antes de abrir a Render

Voce precisa ter:

1. repositorio no GitHub
2. branch `main` atualizada
3. banco `voithos` criado no Neon
4. banco `whatsapp_engine` criado no Neon
5. Redis criado no Upstash
6. os valores preenchidos em:
   - [RENDER-VARIAVEIS-PRONTAS.md](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voithós/RENDER-VARIAVEIS-PRONTAS.md)
   - [RENDER-EXEMPLO-PREENCHIMENTO.md](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voithós/RENDER-EXEMPLO-PREENCHIMENTO.md)

## Parte 1. Conectar GitHub

1. entrar na Render
2. clicar em `New`
3. clicar em `Blueprint`
4. conectar sua conta GitHub
5. autorizar o repositorio `voithos-platform`
6. selecionar o repositorio

## Parte 2. Importar o blueprint

1. confirmar `Branch = main`
2. confirmar `Blueprint Path = render.yaml`
3. avancar

## Parte 3. O que a Render deve criar

Com o blueprint economico, a Render deve criar:

- `voithos-backend`
- `voithos-whatsapp-ng`

Ela nao deve mais criar:

- Postgres na propria Render
- Key Value na propria Render

## Parte 4. O que voce deve preencher

### Backend

- `DATABASE_URL`
- `BACKEND_INTERNAL_API_TOKEN`
- `VOITHOS_SUPERADMIN_EMAIL`
- `VOITHOS_SUPERADMIN_PASSWORD`
- `VOITHOS_SUPERADMIN_CLINIC_EMAIL`
- `VOITHOS_SUPERADMIN_CLINIC_NAME`

### WhatsApp NG

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `REDIS_URL`
- `INTERNAL_API_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`
- `ADMIN_PANEL_TOKEN`
- `ADMIN_PANEL_READONLY_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX`

Observacao:

- o servico `voithos-whatsapp-ng` precisa instalar `devDependencies` no build porque compila TypeScript no deploy
- no blueprint atual isso ja esta embutido; nao troque o `buildCommand` por `npm ci` puro ou remova `--no-audit --no-fund`

### Web

- o frontend web deve ser criado como `Static Site` manual
- `WEB_CENTRAL_BACKEND_BASE_URL=https://voithos-backend.onrender.com`
- no backend, configurar `PUBLIC_APP_BASE_URL=https://voithos-platform-web2.onrender.com`
- no backend, configurar `PUBLIC_APP_ALLOWED_ORIGINS=https://voithos-platform-web2.onrender.com`

## Parte 5. Regras criticas

1. `WHATSAPP_NG_SERVICE_TOKEN` no backend
   e preenchido automaticamente pelo blueprint a partir de:
2. `SERVICE_INTERNAL_API_TOKEN` no NG

3. `CENTRAL_BACKEND_SERVICE_TOKEN` no NG
   e preenchido automaticamente pelo blueprint a partir de:
4. `BACKEND_INTERNAL_API_TOKEN` no backend

5. `DATABASE_URL` do backend
   deve apontar para o banco `voithos`

6. `DATABASE_URL` do NG
   deve apontar para o banco `whatsapp_engine` usando a URL pooled do Neon

7. `DIRECT_DATABASE_URL` do NG
   deve apontar para o mesmo banco `whatsapp_engine` usando a URL direta do Neon sem pooler
   e deve incluir `connect_timeout=15`

8. `REDIS_URL`
   deve vir do Upstash

9. as migrations do NG
   devem rodar fora do `preDeploy` da Render

## Parte 6. Criar os servicos

1. clicar em `Apply`
2. aguardar a Render criar `voithos-whatsapp-ng` e `voithos-backend`
3. abrir primeiro `voithos-whatsapp-ng`
4. esperar o health ficar verde
5. abrir `voithos-backend`
6. esperar o health ficar verde
7. criar o frontend web manual como `Static Site`
8. abrir a URL publica do frontend web

## Parte 7. Teste minimo logo apos deploy

1. abrir login do web
2. entrar com usuario valido
3. abrir `Agenda`
4. abrir `Pacientes`
5. abrir `Prontuario`
6. abrir `Campanhas`
7. abrir `Relacionamento`
8. abrir `Planos`

## Parte 8. Teste minimo do NG

1. abrir `Minha clínica`
2. conectar o WhatsApp via QR
3. enviar uma confirmacao de consulta
4. responder `1`
5. confirmar reflexo na agenda

## Parte 9. Se algo subir com erro

### Se o web abrir mas nao logar

Revisar:

- `WEB_CENTRAL_BACKEND_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- `PUBLIC_APP_ALLOWED_ORIGINS`
- CORS do backend

### Se o backend subir mas o NG falhar

Revisar:

- `DATABASE_URL` do NG
- `REDIS_URL`
- `AUTH_ENCRYPTION_KEY_HEX`

### Se o backend nao falar com o NG

Revisar:

- `WHATSAPP_NG_BASE_URL`
- `WHATSAPP_NG_SERVICE_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`

## Parte 10. Depois da primeira subida

1. colocar dominio proprio
2. revisar logs dos tres servicos
3. criar uma clinica piloto
4. validar agenda, campanhas, planos e relacionamento
5. so depois liberar para as primeiras clinicas reais
