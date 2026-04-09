# Checklist de Release do WhatsApp NG

## Antes do Build
- Validar `.env` do ambiente:
  - `DATABASE_URL`
  - `SERVICE_INTERNAL_API_TOKEN`
  - `ADMIN_PANEL_TOKEN`
  - `CENTRAL_BACKEND_BASE_URL`
  - `CENTRAL_BACKEND_SERVICE_TOKEN`
- Confirmar retenção e limites:
  - `SERVER_MAX_ACTIVE_JOBS_GLOBAL`
  - `SERVER_MAX_ACTIVE_JOBS_PER_CLINIC`
  - `RETENTION_MESSAGE_JOBS_DAYS`
  - `RETENTION_MESSAGE_LOGS_DAYS`
  - `RETENTION_OPERATIONAL_EVENTS_DAYS`

## Build
- `cmd /c npx tsc -p whatsapp-engine\tsconfig.json --noEmit`
- `cmd /c npm run build`

## Smoke Global
- Validar `/health`
- Validar `/operations/overview`
- Validar `/security/overview`

## Smoke por Clínica
Executar para pelo menos uma clínica real:

```bash
npm run smoke:ng -- --clinicId=<clinicId> --strict
```

## Painel Admin
- Dashboard abre sem erro
- `Pressão por clínica` renderiza
- `Segurança > Auditoria` pagina corretamente
- `Exportar incidente` gera JSON
- `Validar clínica` funciona no onboarding

## Encerramento
Liberar release só quando:
- build passou
- smoke global passou
- smoke estrito por clínica passou
- nenhuma clínica crítica aparece fora do esperado no dashboard
