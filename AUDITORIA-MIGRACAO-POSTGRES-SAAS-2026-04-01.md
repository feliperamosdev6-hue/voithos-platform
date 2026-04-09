# Auditoria de Migracao PostgreSQL e Prontidao SaaS

Data: 2026-04-01

Escopo desta auditoria:
- determinar o que ja esta central-first/PostgreSQL
- determinar o que ainda depende de JSON/local no desktop
- definir a ordem correta dos proximos passos para a Voithos virar produto vendavel multi-clinica
- preparar a base para E2E e, depois, webapp SaaS

## Resumo Executivo

A Voithos saiu da fase de correcoes isoladas e entrou numa fase de consolidacao de plataforma.

O nucleo critico do produto ja esta significativamente melhor:
- identidade e sessoes centrais
- clinicas e usuarios centrais
- pacientes centrais
- agenda/appointments centrais
- WhatsApp NG ligado ao backend central
- financeiro principal central
- laboratorio principal central
- prontuario/consultas usando agenda central-first
- notificacoes de evento clinico no backend central

O que ainda impede chamar o sistema de SaaS totalmente limpo nao e mais o nucleo clinico-financeiro.
O que falta agora e migrar o entorno operacional e o legado do desktop:
- configuracoes locais
- documentos e indices locais
- campanhas e logs locais
- logs/filas auxiliares locais
- partes do prontuario e servicos que ainda escrevem shadow local

Conclusao objetiva:
- a Voithos ja tem base para operar como produto multi-clinica real
- ainda nao esta 100% centralizada
- a proxima fase deve ser migracao controlada dos modulos auxiliares e eliminacao do local como fonte de verdade

## O que ja esta em PostgreSQL / backend central

Com evidencia em [prisma/schema.prisma](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/prisma/schema.prisma) e [backend/src/server.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/backend/src/server.js):

- `Clinic`
- `User`
- `Session`
- `Patient`
- `Appointment`
- `OutboundMessage`
- `InboundMessage`
- `NotificationEvent`
- `AppointmentActionToken`
- `PatientClinicalRecord`
- `Anamnesis`
- `ClinicalNote`
- `PatientProcedure`
- `PatientDocumentMetadata`
- `FinancialAccount`
- `FinancialInstallment`
- `FinancialTransaction`
- `PatientPlan`
- `FinancialSnapshot`
- `LaboratoryOrder`
- `LaboratoryOrderItem`
- `LaboratoryOrderEvent`

Tambem ja existe malha de rotas centrais para:
- `/auth`
- `/clinics`
- `/users`
- `/patients`
- `/appointments`
- `/notifications`
- `/outbound-messages`
- `/inbound-messages`
- `/internal/appointments`
- `/internal/patients`
- `/internal/financial`
- `/internal/laboratory`
- `/internal/whatsapp`

## O que ja esta central-first no desktop

Com evidencia principal em [shared/adapters/central-backend-adapter.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/shared/adapters/central-backend-adapter.js) e handlers `ipc/*`:

- login e sessao central
- usuarios por clinica
- pacientes
- agenda e consultas
- confirmacao/remarcacao de consulta por WhatsApp
- procedimentos clinicos principais
- financeiro principal
- laboratorio principal
- planos do paciente
- eventos centrais de notificacao

## O que ainda depende de local/JSON no desktop

Achados objetivos pelo mapa de `readJsonFile/writeJsonFile`:

### Alta prioridade

- [services/patientsService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/patientsService.js)
  - ainda existe shadow local forte de paciente
- [services/agendaService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/agendaService.js)
  - ainda mantem agenda local como camada de contingencia/sombra
- [services/servicesService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/servicesService.js)
  - ainda escreve em JSON de paciente
- [ipc/documentsHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/documentsHandlers.js)
  - documentos ainda tem acoplamento forte com arquivos locais
- [services/documentsService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/documentsService.js)
  - indice e armazenamento local

### Media prioridade

- [services/campanhasService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/campanhasService.js)
  - campanhas, batches e logs ainda locais
- [services/plansService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/plansService.js)
  - ainda acessa JSON local em apoio
- [services/financeService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/financeService.js)
  - ainda existe camada local de compatibilidade
- [services/laboratorioService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/laboratorioService.js)
  - ainda mantem arquivo local

### Baixa/operacional

- [services/clinicProfileService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/clinicProfileService.js)
- [services/clinicSettingsService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/clinicSettingsService.js)
- [ipc/agendaSettingsHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/agendaSettingsHandlers.js)
- [ipc/agendaAvailabilityHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/agendaAvailabilityHandlers.js)
- [ipc/notificationsHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/notificationsHandlers.js)
- [ipc/proceduresHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/proceduresHandlers.js)
- [ipc/anamneseModelsHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/anamneseModelsHandlers.js)
- [ipc/documentModelsHandlers.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/ipc/documentModelsHandlers.js)
- [services/birthdaysService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/birthdaysService.js)
- [services/whatsappLogsService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/whatsappLogsService.js)
- [services/whatsappPendingQueueService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/whatsappPendingQueueService.js)
- [services/appointmentMessagingService.js](/c:/Users/niste/OneDrive/Desktop/Sistema%20Voith%C3%B3s/services/appointmentMessagingService.js)

## Classificacao do estado atual

### Ja maduros para SaaS piloto

- autenticacao por clinica
- isolamento por `clinicId`
- agenda
- consultas
- prontuario basico
- servicos principais
- financeiro principal
- laboratorio principal
- WhatsApp NG
- painel operacional do NG

### Parcialmente maduros

- gestao/index
- documentos
- campanhas
- configuracoes da clinica
- modelos/documentos auxiliares

### Ainda presos ao legado desktop

- logs auxiliares locais
- filas de contingencia locais
- parte dos documentos/arquivos clinicos
- operacao offline baseada em JSON

## Riscos reais antes de comercializar em escala

1. Fonte dupla de verdade
- ainda existe core central e shadow local em paralelo
- isso aumenta risco de divergencia em ambiente com milhares de clinicas

2. Documentos e arquivos
- metadados ja comecaram a entrar no central, mas o arquivo fisico ainda e local
- para webapp SaaS isso precisa migrar para storage real

3. Campanhas e automacao comercial
- ainda dependem de armazenamento local do desktop
- isso nao escala como plataforma multi-tenant de verdade

4. Configuracoes operacionais por clinica
- varias ainda vivem em JSON local
- isso funciona no desktop, mas nao fecha arquitetura webapp SaaS

5. Suite automatizada
- existe smoke, gate, doctor e readiness
- ainda falta uma suite E2E real e repetivel por fluxo de produto

## Ordem correta dos proximos passos

### Fase 1 - Fechamento central-first do nucleo desktop

Objetivo:
- parar de criar nova dependencia local nos fluxos criticos

Acoes:
- congelar criacao de novos modulos em JSON
- mapear todos os writes locais em pacientes, agenda, servicos e documentos
- transformar shadow local em cache/read-through, nunca em source of truth

### Fase 2 - Migracao dos modulos auxiliares

Objetivo:
- tirar o entorno do legado local

Prioridade:
1. configuracoes da clinica e preferencias operacionais
2. modelos clinicos/documentais
3. campanhas e batches
4. birthdays/relacionamento
5. logs auxiliares que ainda sao locais

### Fase 3 - Documentos e storage

Objetivo:
- preparar webapp SaaS real

Acoes:
- manter metadados no PostgreSQL
- mover arquivo fisico para objeto/storage
- assinar acesso por clinica
- padronizar dossie/anamnese/evolucao/receitas/atestados

### Fase 4 - E2E e qualidade de release

Objetivo:
- garantir repetibilidade para milhares de clinicas

Acoes:
- criar suite E2E por fluxo:
  - login/contexto
  - paciente/prontuario
  - servicos/financeiro
  - agenda/consultas
  - gestao/index
  - WhatsApp confirmação/remarcação
- plugar E2E ao gate local e depois ao CI

### Fase 5 - Webapp SaaS

Objetivo:
- reduzir dependência do Electron e preparar operacao em escala

Acoes:
- definir backend central como unica camada de negocio
- reaproveitar adapters/contratos atuais como API publica interna
- migrar renderer page a page para webapp
- manter NG como servico isolado

## O que eu recomendo fazer agora

Se a meta e comercializar logo sem abrir frentes demais, a ordem correta e:

1. finalizar E2E da clinica piloto
2. migrar configuracoes/modelos auxiliares para o central
3. migrar campanhas para o central
4. fechar documentos com storage real
5. so depois abrir a fase de webapp

## Definicao de pronto para comercializar com seguranca

A Voithos pode ser considerada pronta para comercializacao piloto quando:
- uma clinica opera o fluxo completo sem depender de limpeza manual
- o gate local passa
- o smoke da plataforma passa
- o NG permanece estavel
- agenda, prontuario, servicos e financeiro estao 100% clinic-scoped
- configuracoes mais sensiveis nao dependem de JSON local como fonte principal

## Preparacao para E2E

O proximo passo tecnico certo e:
- executar a suite E2E da clinica piloto
- registrar falhas restantes
- usar a auditoria acima para abrir a migracao do entorno local em paralelo

Resumo final:
- o nucleo ja esta forte
- o gargalo agora e legado local auxiliar
- o caminho mais inteligente nao e refatorar tudo
- e migrar por fronteira de dominio, mantendo o que ja esta estavel no central
