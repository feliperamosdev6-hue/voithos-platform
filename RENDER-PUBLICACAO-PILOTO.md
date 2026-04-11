# Publicacao piloto da Voithos na Render

## Caminho recomendado de baixo custo

Para o primeiro piloto pago da Voithos, o melhor corte de custo e:

- `Render` para compute
  - `voithos-web`
  - `voithos-backend`
  - `voithos-whatsapp-ng`
- `Neon` para PostgreSQL
  - banco `voithos`
  - banco `whatsapp_engine`
- `Upstash` para Redis do NG

## Por que esse e o melhor caminho agora

- reduz custo mensal na Render
- evita pagar Postgres e Key Value gerenciados dentro da Render no primeiro momento
- mantem a arquitetura correta para SaaS multi-clinica
- permite expandir depois sem retrabalho estrutural grande

## Custo esperado no inicio

Na Render, com o blueprint economico:

- `voithos-web`: static
- `voithos-backend`: starter
- `voithos-whatsapp-ng`: starter

Ou seja, o custo principal de compute fica perto de:

- backend: `~$7/mes`
- ng: `~$7/mes`
- web: `~$0/mes`

Total aproximado de compute na Render:

- `~$14/mes`

Fontes oficiais:

- [Render pricing](https://render.com/pricing)
- [Neon pricing](https://neon.com/pricing)
- [Upstash pricing](https://upstash.com/pricing)

## O que voce vai preencher manualmente

### voithos-backend

- `DATABASE_URL` do banco `voithos` no Neon
- `BACKEND_INTERNAL_API_TOKEN`
- `VOITHOS_SUPERADMIN_EMAIL`
- `VOITHOS_SUPERADMIN_PASSWORD`
- `VOITHOS_SUPERADMIN_CLINIC_EMAIL`
- `VOITHOS_SUPERADMIN_CLINIC_NAME`

### voithos-whatsapp-ng

- `DATABASE_URL` do banco `whatsapp_engine` no Neon usando a URL pooled
- `DIRECT_DATABASE_URL` do banco `whatsapp_engine` no Neon usando a URL direta sem pooler e `connect_timeout=15`
- `REDIS_URL` do Upstash
- `INTERNAL_API_TOKEN`
- `SERVICE_INTERNAL_API_TOKEN`
- `ADMIN_PANEL_TOKEN`
- `ADMIN_PANEL_READONLY_TOKEN`
- `AUTH_ENCRYPTION_KEY_HEX`

### voithos-web

- nada manual alem do que o blueprint ligar automaticamente ao backend

## Ordem correta de criacao

1. criar os 2 bancos no Neon
2. criar o Redis no Upstash
3. voltar para a Render
4. preencher os segredos
5. publicar `voithos-whatsapp-ng`
6. publicar `voithos-backend`
7. publicar `voithos-web`

## Proxima etapa depois do primeiro deploy

1. validar login e contexto de clinica
2. validar agenda e prontuario
3. conectar uma clinica no NG
4. enviar confirmacao de consulta
5. validar campanhas, relacionamento e planos
