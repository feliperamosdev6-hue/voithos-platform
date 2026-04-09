# Relatorio de Prontidao SaaS da Voithos

## Estado atual

A Voithos ja opera com base central-first e isolamento por `clinicId` nos fluxos criticos endurecidos:

- identidade e usuarios
- pacientes
- agenda
- prontuario
- financeiro do paciente
- gestao financeira
- WhatsApp NG

Tambem ja existem guardrails operacionais locais:

- `doctor:platform:local`
- `bootstrap:platform:local`
- `smoke:platform:local`
- `gate:platform:local`

## O que ja esta forte

### Multi-clinica

- validacao de dentista e usuario por clinica
- reidratacao do prontuario protegida por `clinicId`
- sincronismo clinico-financeiro endurecido por `procedureId`
- limpeza de residuos legados e preservacao da clinica canonica no PostgreSQL

### Fluxos clinicos

- agenda e prontuario com separacao correta entre:
  - status do evento
  - presenca clinica
- consultas refletindo procedimento, dentista, data e horario
- exclusoes mantendo consistencia entre prontuario e financeiro

### Fluxos financeiros

- gestao usando fonte dominante central
- status financeiros separados de status clinicos
- filtros por dentista responsavel scoped por clinica

### Operacao do WhatsApp NG

- RBAC no painel admin
- overview operacional por clinica e instancia
- circuit breaker e limites por clinica
- retencao automatica segura
- readiness/onboarding/offboarding controlados
- monitor sintetico e sinais de saude do central

## O que ainda e risco de escala

### Risco alto

- ausencia de CI/CD com gate automatico fora da maquina local
- falta de validacao automatizada de backup/restore por ambiente
- falta de teste de carga real com muitas clinicas e muitas instancias NG simultaneas

### Risco medio

- alertas externos ainda dependem de configuracao de webhook
- gate e smoke ainda sao orientados a operacao local
- nao ha trilha consolidada de capacity planning por crescimento de tenants

### Risco baixo

- refinamentos de UX no desktop e no NG
- mais indicadores executivos por modulo
- melhorias de naming/documentacao operacional

## Prioridade recomendada

### 1. Plataforma e confiabilidade

- CI de gate da plataforma
- smoke automatizado por ambiente
- backup/restore drill
- teste de carga do NG e do backend central

### 2. Operacao SaaS

- onboarding de clinica com checklist obrigatorio
- offboarding com trilha e bloqueios
- observabilidade externa e alertas para incidentes criticos

### 3. Produto e suporte

- consolidacao dos relatórios de gestao
- refinamento de operacao do dentista em agenda/prontuario
- dashboards mais executivos por clinica

## Comandos operacionais

- `cmd /c npm run readiness:platform:local`
- `cmd /c npm run doctor:platform:local`
- `cmd /c npm run bootstrap:platform:local -- --clinicId=<clinicId>`
- `cmd /c npm run gate:platform:local -- --clinicId=<clinicId>`

## Classificacao atual

Leitura objetiva como engenheiro senior:

- a Voithos ja tem base coerente para operar como produto SaaS multi-clinica
- o nucleo transacional esta mais maduro do que antes
- o proximo salto de maturidade nao e mais “corrigir tela”, e sim:
  - confiabilidade de ambiente
  - automacao de release
  - carga
  - governanca operacional

Em resumo:

- produto: em transicao forte para SaaS vendavel
- operacao: bem mais madura
- escala: precisa agora de CI, carga e observabilidade externa para suportar milhares de clinicas com seguranca
