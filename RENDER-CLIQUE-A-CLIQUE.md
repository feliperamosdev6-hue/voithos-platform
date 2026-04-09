# Render clique a clique

## Caminho recomendado

Como a Voithos ja tem [render.yaml](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/render.yaml), o melhor caminho e subir usando `Blueprint`.

Isso reduz erro manual e faz a Render criar:

- `voithos-backend`
- `voithos-whatsapp-ng`
- `voithos-web`

## Antes de abrir a Render

Voce precisa ter:

1. repositório no GitHub
2. branch principal atualizada
3. os valores preenchidos em:
   - [RENDER-VARIAVEIS-PRONTAS.md](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/RENDER-VARIAVEIS-PRONTAS.md)
   - [RENDER-EXEMPLO-PREENCHIMENTO.md](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/RENDER-EXEMPLO-PREENCHIMENTO.md)

## Parte 1. Conectar GitHub

1. Entrar na Render
2. clicar em `New`
3. clicar em `Blueprint`
4. conectar sua conta GitHub
5. autorizar acesso ao repositório da Voithos
6. selecionar o repositório

## Parte 2. Importar o blueprint

1. na tela de Blueprint, confirmar que a Render detectou o arquivo `render.yaml`
2. revisar os servicos que ela vai criar:
   - `voithos-backend`
   - `voithos-whatsapp-ng`
   - `voithos-web`
3. continuar

## Parte 3. Preencher os segredos

Na primeira criacao, a Render vai pedir os campos com `sync: false`.

Preencha:

### Backend

- `DATABASE_URL`
- `WHATSAPP_NG_BASE_URL`
- `WHATSAPP_NG_SERVICE_TOKEN`
- `BACKEND_INTERNAL_API_TOKEN`
- `PUBLIC_APP_BASE_URL`
- `APPOINTMENT_ACTION_BASE_URL`
- `VOITHOS_SUPERADMIN_EMAIL`
- `VOITHOS_SUPERADMIN_PASSWORD`
- `VOITHOS_SUPERADMIN_CLINIC_EMAIL`
- `VOITHOS_SUPERADMIN_CLINIC_NAME`

### NG

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `INTERNAL_API_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`
- `CENTRAL_BACKEND_BASE_URL`
- `ADMIN_PANEL_TOKEN`
- `ADMIN_PANEL_READONLY_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX`

### Web

- `WEB_CENTRAL_BACKEND_BASE_URL`

## Parte 4. Ordem de conferencia antes de confirmar

Confira estas amarracoes:

1. `WEB_CENTRAL_BACKEND_BASE_URL` = URL do backend
2. `PUBLIC_APP_BASE_URL` = URL do web
3. `APPOINTMENT_ACTION_BASE_URL` = URL do backend
4. `WHATSAPP_NG_BASE_URL` = URL do NG
5. `CENTRAL_BACKEND_BASE_URL` = URL do backend
6. `WHATSAPP_NG_SERVICE_TOKEN` = mesmo valor de `SERVICE_INTERNAL_API_TOKEN`
7. `DATABASE_URL` do backend != `DATABASE_URL` do NG

## Parte 5. Criar os servicos

1. clicar em `Apply`
2. aguardar a Render criar os tres servicos
3. abrir primeiro `voithos-whatsapp-ng`
4. esperar o health ficar verde
5. abrir `voithos-backend`
6. esperar o health ficar verde
7. abrir `voithos-web`
8. abrir a URL publica

## Parte 6. Teste minimo logo apos deploy

1. abrir login do web
2. entrar com usuario valido
3. abrir `Agenda`
4. abrir `Pacientes`
5. abrir `Prontuario`
6. abrir `Campanhas`
7. abrir `Relacionamento`
8. abrir `Planos`

## Parte 7. Teste minimo do NG

1. abrir `Minha clínica`
2. conectar o WhatsApp via QR
3. enviar uma confirmacao de consulta
4. responder `1`
5. confirmar reflexo na agenda

## Parte 8. Se algo subir com erro

### Se o web abrir mas nao logar

Revisar:

- `WEB_CENTRAL_BACKEND_BASE_URL`
- `PUBLIC_APP_BASE_URL`
- CORS do backend

### Se o backend subir mas o NG falhar

Revisar:

- `DATABASE_URL` do NG
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `AUTH_ENCRYPTION_KEY_HEX`

### Se o backend nao falar com o NG

Revisar:

- `WHATSAPP_NG_BASE_URL`
- `WHATSAPP_NG_SERVICE_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`

## Parte 9. Depois da primeira subida

1. colocar dominio proprio
2. revisar logs dos tres servicos
3. criar uma clinica piloto
4. validar agenda, campanhas, planos e relacionamento
5. so depois liberar para as primeiras clinicas reais
