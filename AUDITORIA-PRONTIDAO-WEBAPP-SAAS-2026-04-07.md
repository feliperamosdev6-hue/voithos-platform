# Auditoria de Prontidao Webapp SaaS - 2026-04-07

## Resumo executivo

Leitura sênior e objetiva:

- a Voithos já tem um núcleo SaaS multi-clínica maduro no backend central
- a operação desktop + backend central + WhatsApp NG já está próxima de um piloto pago controlado
- a Voithos ainda não está pronta para lançamento amplo como webapp SaaS vendável

O principal motivo não é domínio de negócio.

O principal motivo é superfície de produto e operação:

- a camada web ainda está incompleta
- a esteira de release ainda é majoritariamente local
- ainda faltam CI/CD, deploy padronizado, testes automatizados e prova operacional de produção

Classificação final desta rodada:

- núcleo central-first multi-clínica: `FORTE`
- produto desktop centralizado: `PRONTO PARA PILOTO PAGO CONTROLADO`
- webapp SaaS: `NAO PRONTO`
- lançamento para milhares de clínicas: `NAO PRONTO`

## O que já está maduro

### Arquitetura central-first

O schema central já suporta a espinha dorsal SaaS:

- `Clinic`
- `User`
- `Session`
- `Patient`
- `Appointment`
- `OutboundMessage`
- `InboundMessage`
- `NotificationEvent`
- `Campaign`
- `CampaignAudienceSnapshot`
- `CampaignBatch`
- `CampaignDispatch`
- `PlanMessageEvent`
- `FinancialAccount`
- `FinancialInstallment`
- `FinancialTransaction`
- `PatientPlan`
- `PatientClinicalRecord`
- `PatientDocumentMetadata`
- `LaboratoryOrder`

Evidência:

- `prisma/schema.prisma`

### Multi-clínica

O endurecimento por `clinicId` já está consistente nos domínios centrais:

- identidade
- pacientes
- agenda
- prontuário
- financeiro
- planos
- campanhas
- relacionamento
- laboratório
- mensageria

Na prática, a base já foi provada com duas clínicas canônicas:

- `clinica dente de carneiro`
- `clinica macacos me mordam`

### Mensageria central

O trilho central de mensageria já existe e foi reaproveitado corretamente:

- campanhas centralizadas ponta a ponta
- mensageria canônica de planos
- central de relacionamento agregada por clínica
- WhatsApp NG estabilizado como transporte operacional

Evidência:

- `ENTREGA-CAMPANHAS-CENTRALIZADAS-2026-04-05.md`
- `ENTREGA-MENSAGERIA-PLANOS-2026-04-05.md`
- `backend/src/services/relationshipService.js`
- `backend/src/services/planMessageService.js`

### Operação local e E2E

Já existe uma base operacional melhor do que a maioria dos projetos nessa fase:

- `doctor:platform:local`
- `bootstrap:platform:local`
- `smoke:platform:local`
- `smoke:plans:automation`
- `smoke:relationship:central`
- `gate:platform:local`
- `e2e:pilot`

Evidência:

- `package.json`
- `CHECKLIST-E2E-VOITHOS.md`

## O que impede chamar de webapp SaaS vendável hoje

### 1. Camada web ainda incompleta

Este é o bloqueio mais importante.

O arquivo `shared/adapters/web-adapter.js` ainda contém `115` pontos de `notImplemented(` espalhados em módulos críticos:

- auth administrativo
- usuários
- serviços
- documentos
- financeiro
- laboratório
- planos
- campanhas
- clínica
- WhatsApp
- agenda
- aniversários
- relacionamento
- notificações
- procedimentos
- modelos de documentos

Leitura sênior:

- o backend central já está ficando pronto para SaaS
- a superfície web ainda não está pronta para consumir esse backend como produto

Conclusão:

- a Voithos está muito mais perto de um SaaS no domínio do que no delivery web final

Evidência:

- `shared/adapters/web-adapter.js`

### 2. Esteira de qualidade ainda insuficiente para lançamento amplo

Hoje existe smoke e E2E piloto, o que é bom.

Mas ainda faltam pilares de release:

- script `test` do `package.json` ainda é placeholder
- não há framework automatizado consolidado de testes de interface no repositório
- não há diretório `.github/workflows`
- não há pipeline de CI/CD versionada no repositório

Conclusão:

- a qualidade já tem boa cobertura manual e operacional
- ainda não tem esteira automática suficiente para milhares de clínicas

Evidência:

- `package.json`
- ausência de `.github/workflows`

### 3. Deploy e operação de produção ainda não estão codificados

Não encontrei nesta rodada:

- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.yaml`
- `Procfile`

Isso não impede o produto de existir.

Mas impede chamar de lançamento SaaS pronto com operação repetível, porque ainda falta padronizar:

- backend central
- WhatsApp NG
- scheduler de lembretes
- webapp
- storage documental
- PostgreSQL
- Redis
- observabilidade

### 4. Observabilidade e confiabilidade de produção ainda precisam sair do modo local

O projeto já tem boa observabilidade funcional interna.

Mas ainda faltam sinais de produção:

- alertas externos padronizados
- health/readiness por ambiente real
- runbook de incidente
- backup/restore drill comprovado por ambiente
- teste de carga formal do backend central
- teste de carga formal do WhatsApp NG com múltiplas clínicas

## O que já está pronto para vender de forma controlada

A Voithos já está próxima de ser vendida como:

- piloto pago assistido
- operação com poucas clínicas iniciais
- rollout controlado com onboarding acompanhado

Isso vale se o canal inicial for:

- desktop centralizado + backend central + WhatsApp NG

Não vale ainda, com a mesma segurança, para:

- webapp aberto para escala
- auto-onboarding
- rollout amplo e autônomo

## O que precisa existir para lançamento webapp

### Bloco 1. Fechar a camada web

Próxima prioridade real do produto:

- implementar o `web-adapter`
- expor as rotas públicas/web necessárias no backend central
- fechar autenticação web com contexto de clínica e sessão
- substituir as lacunas atuais de `notImplemented` nos módulos críticos

Sequência sugerida:

1. auth/contexto/clínica
2. agenda
3. pacientes/prontuário
4. financeiro/planos
5. campanhas/relacionamento
6. documentos/anexos
7. configurações/observabilidade

### Bloco 2. Padronizar produção

Antes de vender como SaaS web:

- definir topologia de deploy
- padronizar variáveis de ambiente
- definir storage binário real
- definir managed Postgres / Redis
- definir estratégia de sessões e secrets
- definir init order entre backend, NG e schedulers

### Bloco 3. Fechar a confiabilidade

Necessário antes de escala:

- CI com gate obrigatório
- E2E automatizado dos fluxos críticos
- smoke por ambiente
- backup/restore validado
- carga do backend central
- carga do NG por clínicas simultâneas

### Bloco 4. Fechar o go-to-market técnico

Antes do lançamento pago amplo:

- onboarding padronizado por clínica
- provisionamento de tenant
- checklist de readiness por tenant
- trilha de auditoria operacional
- suporte de incidentes e rollback

## Sinais concretos observados nesta rodada

### Positivos

- `smoke:plans:automation` já encontrou contas elegíveis reais em duas clínicas
- `smoke:relationship:central` já respondeu com overview agregado real
- `e2e:pilot --flow=relacionamento_mensageria --strict` ficou `READY_FOR_EXECUTION`
- a recente correção de `planMessageService` passou a tratar indisponibilidade transitória do NG como bloqueio retryável, e não falha terminal

### Negativos

- a camada web continua majoritariamente stubada
- a esteira de release ainda depende demais da máquina local
- a prontidão para produção em escala ainda não está codificada como infraestrutura

## Classificação final

### Núcleo SaaS central

`PRONTO PARA EVOLUIR`

### Produto desktop centralizado

`PRONTO PARA PILOTO PAGO CONTROLADO`

### Webapp SaaS

`AINDA NAO PRONTO`

### Lançamento para milhares de clínicas

`AINDA NAO PRONTO`

## Próximo passo correto

O próximo passo de engenharia não é abrir novo módulo.

O próximo passo correto para lançamento é:

### Fechar a camada web de ponta a ponta

Começando por:

1. autenticação e contexto de clínica no web
2. agenda
3. pacientes/prontuário
4. financeiro/planos
5. campanhas/relacionamento

Depois disso:

1. CI/CD
2. deploy padronizado
3. E2E automatizado
4. carga e operação de produção

## Veredito

A Voithos não precisa mais provar que consegue ser multi-clínica.

Ela já provou isso no núcleo.

O que falta agora para virar um SaaS vendável de verdade é:

- transformar o núcleo central já maduro em superfície web pronta
- industrializar a operação de produção
- automatizar a validação de release

Em outras palavras:

- SaaS core: `sim`
- webapp vendável: `ainda nao`
- piloto pago controlado: `sim`
- lançamento amplo: `ainda nao`
