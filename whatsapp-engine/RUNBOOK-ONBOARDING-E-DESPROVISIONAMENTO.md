# Runbook de Onboarding e Desprovisionamento do WhatsApp NG

## Objetivo
Padronizar como uma clínica entra e sai do WhatsApp NG sem quebrar isolamento multi-clínica nem deixar fila pendente para trás.

## Princípios
- Toda ação é validada por `clinicId`.
- A clínica precisa existir no catálogo central antes de provisionar instância.
- Instância com jobs ativos não pode ser removida.
- Toda triagem começa pelo readiness da clínica.

## Onboarding de Clínica
1. Confirmar `clinicId` canônico no central.
2. No painel admin do NG, preencher `Clinic ID`.
3. Clicar em `Validar clínica`.
4. Confirmar:
   - clínica resolvida no central
   - `canProvision=true`
   - sem instância pré-existente
5. Criar a instância.
6. Ler QR / concluir pareamento.
7. Validar readiness novamente até `smokePassed=true`.

## Desprovisionamento de Clínica
1. Confirmar a clínica correta pelo `clinicId`.
2. Validar readiness antes da exclusão.
3. Confirmar:
   - instância existente
   - `canDeprovision=true`
   - `activeJobs=0`
4. Exportar incidente/histórico da clínica, se necessário.
5. Executar exclusão da instância no painel.

## Bloqueios Esperados
- `Clinic not found in central catalog.`:
  a clínica ainda não foi provisionada corretamente no central.
- `Instance has active message jobs and cannot be deleted yet.`:
  a fila ainda não foi drenada; não forçar exclusão.

## Smoke Test
Executar:

```bash
npm run smoke:ng -- --clinicId=<clinicId> --strict
```

Resultado esperado:
- `health_ready=true`
- `smokePassed=true`
- `activeJobs=0`
- `recentFailures=0`

## Encerramento
Uma clínica só é considerada pronta quando:
- instância criada
- runtime conectado
- QR/pareamento concluído
- smoke test em modo estrito passou
