# WhatsApp Engine (Voithos)

Servico isolado dentro do mesmo repositorio para gerenciamento de sessoes WhatsApp por clinica, com envio transacional, fila, retry e logs.

## Objetivo do MVP

- 1 instancia/sessao por clinica
- conexao por QR (e suporte inicial a pairing code)
- persistencia de sessao por clinica (auth blob criptografado no banco + arquivos locais do Baileys)
- status de instancia
- envio de mensagem transacional pela instancia correta
- fila com retry (BullMQ + Redis)
- logs de job e eventos de entrega
- bloqueio de envio quando instancia nao estiver conectada

## Estrutura

```txt
whatsapp-engine/
  src/
    config/
    controllers/
    routes/
    services/
      instance/
      messaging/
      auth/
    workers/
    queues/
    repositories/
    lib/baileys/
    types/
    utils/
    app.ts
    server.ts
  prisma/
  package.json
  tsconfig.json
  .env.example
  docker-compose.yml
  Dockerfile
```

## Requisitos

- Node 20+
- PostgreSQL
- Redis

## Variaveis de ambiente

Copie `.env.example` para `.env` e ajuste:

- `DATABASE_URL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `INTERNAL_API_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX` ou `AUTH_ENCRYPTION_KEY_BASE64` (obrigatorio para auth_blob_encrypted)
- `SESSIONS_DIR`

## Como subir localmente

### Opcao A: Docker Compose

```bash
cd whatsapp-engine
cp .env.example .env
docker compose up --build
```

### Opcao B: Local (sem docker)

```bash
cd whatsapp-engine
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run whatsapp-ng
```

O comando acima compila e sobe API + worker + interface Electron no modo estavel.

### Scripts de inicializacao

- `npm run dev`: sobe apenas a API em modo watch
- `npm run dev:worker`: sobe apenas o worker em modo watch
- `npm run dev:ui`: abre a interface Electron do WhatsApp NG
- `npm run dev:all`: sobe API + worker + interface Electron em um unico comando
- `npm run whatsapp-ng`: caminho recomendado no Windows; compila e sobe o stack completo em modo estavel
- `npm run whatsapp-ng:dev`: alias para `npm run dev:all`
- `npm run start`: sobe apenas a API compilada
- `npm run start:worker`: sobe apenas o worker compilado
- `npm run start:ui`: abre a interface Electron apontando para a API local
- `npm run start:all`: sobe API + worker compilados + interface Electron em um unico comando

### Interface Electron

O `whatsapp-engine` agora possui uma casca Electron leve que reaproveita o painel admin web ja existente. A janela desktop:

- inicia com uma tela de espera local
- aguarda a API responder em `http://127.0.0.1:8099`
- carrega automaticamente `http://127.0.0.1:8099/admin/login`
- continua consumindo a mesma API e o mesmo fluxo de autenticacao do painel web

O runner unificado inclui a UI automaticamente porque os scripts `dev:ui` e `start:ui` agora existem. Se precisar trocar o script da UI no futuro, voce ainda pode usar `WHATSAPP_ENGINE_UI_SCRIPT`.

Exemplo de override:

```bash
set WHATSAPP_ENGINE_UI_SCRIPT=dev:electron
npm run dev:all
```

### Como parar tudo

- no terminal que executou `npm run dev:all` ou `npm run start:all`, pressione `Ctrl + C`
- o runner encerra os processos filhos juntos para evitar deixar API ou worker soltos

## Endpoints MVP

Todos os endpoints aceitam `x-internal-token` quando `INTERNAL_API_TOKEN` estiver configurado.

### 1) POST /instances
Cria (ou reutiliza) instancia da clinica e inicia conexao.

Request:

```json
{
  "clinicId": "clinic-123",
  "displayName": "Clinica Sorriso",
  "pairingPhone": "11999999999"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "clinicId": "clinic-123",
    "status": "CONNECTING",
    "createdAt": "2026-03-09T00:00:00.000Z",
    "updatedAt": "2026-03-09T00:00:00.000Z"
  }
}
```

### 2) GET /instances/:id/status
Consulta status da instancia.

Response:

```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "clinicId": "clinic-123",
    "status": "CONNECTED",
    "phoneNumber": "5511999999999",
    "displayName": "Clinica Sorriso",
    "lastSeenAt": "2026-03-09T00:00:00.000Z",
    "connectedInRuntime": true
  }
}
```

### 3) GET /instances/:id/qr
Retorna QR atual (quando disponivel) em texto e data URL.

Response:

```json
{
  "success": true,
  "data": {
    "instanceId": "clx...",
    "status": "CONNECTING",
    "qr": "2@....",
    "qrDataUrl": "data:image/png;base64,...",
    "pairingCode": null,
    "qrUpdatedAt": "2026-03-09T00:00:00.000Z"
  }
}
```

### 4) POST /messages/send
Cria job e envia pela instancia da clinica correta (ou agenda para envio futuro).

Request:

```json
{
  "clinicId": "clinic-123",
  "toPhone": "11988887777",
  "body": "Lembrete: sua consulta e amanha as 14:00.",
  "appointmentId": "ag-001",
  "scheduledFor": "2026-03-10T12:00:00.000Z"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "jobId": "clx...",
    "status": "SCHEDULED",
    "clinicId": "clinic-123",
    "instanceId": "clx...",
    "scheduledFor": "2026-03-10T12:00:00.000Z",
    "createdAt": "2026-03-09T00:00:00.000Z"
  }
}
```

## Modelo de dados (Prisma)

- `whatsapp_instances`
- `message_jobs`
- `message_logs`

Conforme campos definidos no `prisma/schema.prisma`.

## Como a Voithos principal deve consumir

1. Super Admin cria/consulta instancia por clinica:
   - `POST /instances`
   - `GET /instances/:id/qr`
   - `GET /instances/:id/status`

2. Fluxos de agendamento/aniversario/campanha da Voithos:
   - chamar `POST /messages/send` com `clinicId` correto
   - nunca enviar direto sem `clinicId`

3. Regra de isolamento:
   - a engine sempre resolve instancia por `clinicId`
   - se instancia nao estiver conectada, job fica `BLOCKED`/`FAILED` e nao envia

## Observacoes e limites do MVP

- O endpoint de QR depende de conexao ativa em runtime (processo API da engine).
- Sessao e persistida em disco (`SESSIONS_DIR`) e espelhada no banco em `auth_blob_encrypted`.
- Se a sessao cair, a engine tenta reconectar automaticamente.
- Foco em mensagens transacionais; nao ha recurso de disparo em massa.
## Painel Administrativo Web

O `whatsapp-engine` agora serve um painel administrativo interno, sem alterar a API principal, worker, Redis, Prisma ou persistencia de sessao.

### URL local

- Login: `http://localhost:8099/admin/login`
- Painel: `http://localhost:8099/admin`
- Painel direto: `http://localhost:8099/admin/instances`
- Electron: `npm run dev:ui` ou `npm run dev:all`

### Protecao do painel

- `GET /admin/login` fica publico para renderizar a tela de login.
- `POST /admin/session` valida o `INTERNAL_API_TOKEN` informado no formulario.
- Se o token estiver correto, o backend cria uma sessao simples em cookie para liberar `/admin` e as paginas internas do painel.
- As chamadas AJAX do painel continuam enviando `x-internal-token` para consumir a propria API do engine.
- Se `INTERNAL_API_TOKEN` estiver vazio em ambiente local, a API e o painel nao exigem autenticacao.

### O que o painel faz

- lista instancias existentes
- mostra resumo por status
- cria nova instancia por `clinicId`
- consulta detalhes e logs recentes
- gera e exibe QR code
- consulta status da instancia
- executa teste de conexao sob demanda para a instancia selecionada
- envia mensagem de teste pela instancia da clinica correta

### Endpoints usados pelo painel

- `GET /instances`
- `GET /instances/:id`
- `GET /instances/:id/status`
- `GET /instances/:id/qr`
- `GET /instances/:id/logs`
- `POST /instances`
- `POST /messages/send`
- `GET /health`

### Como usar

1. Suba o banco, Redis, API e worker normalmente.
2. Acesse `http://localhost:8099/admin/login`.
3. Confirme que a tela HTML abre sem enviar token previo.
4. Informe o valor de `INTERNAL_API_TOKEN` e envie o formulario.
5. Verifique o redirecionamento para `/admin`.
6. Crie uma instancia ou selecione uma existente.
7. Clique em `QR` para conectar o numero da clinica.
8. Use `Status`, `Teste de conexao` ou `Atualizar tudo` para acompanhar a sessao.
9. Acompanhe os logs no proprio painel.
10. Use `Teste` para enfileirar uma mensagem transacional de validacao.

### Como usar no Electron

1. Execute `npm run dev:all` para subir API, worker e interface desktop juntos.
2. Aguarde a janela `Voithos WhatsApp NG` sair da tela de inicializacao.
3. Faça login com `INTERNAL_API_TOKEN`.
4. Use a interface desktop com os mesmos fluxos do painel web.

### Fluxo de teste recomendado

1. Criar instancia:
   - preencher `clinicId` e `displayName`
   - clicar em `Criar instancia`
2. Gerar QR:
   - clicar em `QR`
   - escanear com o WhatsApp da clinica
3. Conectar numero:
   - aguardar status migrar para `CONNECTED`
   - confirmar telefone e runtime no painel
4. Consultar status:
   - clicar em `Status` ou `Atualizar tudo`
   - opcionalmente usar `Teste de conexao` no painel lateral de detalhes
5. Enviar mensagem teste:
   - clicar em `Teste`
   - preencher numero de destino e mensagem
   - conferir criacao do job e logs recentes
