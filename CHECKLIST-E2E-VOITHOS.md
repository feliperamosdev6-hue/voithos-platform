# Checklist E2E Voithos

Checklist de ponta a ponta para a clinica piloto e para a futura suite automatizada.

## 1. Preparacao do ambiente

- `cmd /c npm run doctor:platform:local`
- `cmd /c npm run bootstrap:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95`
- `cmd /c npm run smoke:platform:local -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95`
- `cmd /c npm run e2e:pilot -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95`

## 2. Autenticacao e contexto

- login com usuario da clinica
- validar `clinicId` ativo
- validar que nao ha troca de contexto entre clinicas

## 3. Usuarios e dentistas

- criar usuario administrativo
- criar dentista
- editar usuario
- validar que o usuario nasce na clinica correta

## 4. Paciente

- cadastrar paciente
- abrir prontuario
- dar reload no prontuario
- validar persistencia do mesmo paciente

## 5. Servicos

- adicionar procedimento sem dentista
- adicionar procedimento com dentista da clinica
- tentar dentista de outra clinica e validar bloqueio
- validar observacoes do procedimento em detalhes

## 6. Financeiro do paciente

- procedimento cria lancamento financeiro
- `Pago / A realizar` aparece pago
- `Pago / Realizado` aparece pago
- exclusao pela ficha clinica apaga o financeiro
- exclusao pelo financeiro apaga o procedimento

## 7. Gestao e index

- index reflete agenda do dia
- index reflete controle financeiro por `Hoje`, `Semana`, `Mes`
- gestao financeira mostra:
  - faturamento
  - despesas
  - saldo
  - a receber
- gestao receitas e despesas respondem aos filtros

## 8. Agenda e consultas

- criar agendamento
- confirmar manualmente na agenda
- confirmar via WhatsApp NG
- abrir prontuario > consultas
- marcar `Compareceu`
- marcar `Nao compareceu`
- validar que a presenca clinica nao muda o status principal da agenda

## 9. WhatsApp NG

- conectar instancia por QR
- enviar mensagem teste
- receber resposta do paciente `1` confirmar e `2` reagendar
- validar dashboard operacional
- validar configuracoes operacionais

## 10. Multi-clinica

- trocar de clinica
- validar ausencia de paciente, agenda e financeiro da clinica anterior
- validar isolamento dos dentistas e usuarios

## 11. Planos e mensageria recorrente

- criar plano com entrada + parcelas
- validar entrada e parcelas refletindo no financeiro do mes atual
- confirmar pagamento de parcela sem erro de UX
- validar historico de mensagens por parcela
- validar reenvio manual auditado
- rodar:
  - `cmd /c npm run smoke:plans:automation -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95`
- repetir em segunda clinica canonica e validar isolamento por `clinicId`

## 12. Relacionamento e mensageria central

- abrir `Relacionamento`
- validar:
  - aniversarios do dia
  - campanhas com KPI e logs
  - cobranca recorrente de planos
  - retomada da agenda
- enviar mensagem de aniversario pela central
- disparar lembrete de plano pela central
- rodar:
  - `cmd /c npm run smoke:relationship:central -- --clinicId=6666fe38-8a65-48a4-b171-dd0203be8b95`
- repetir em segunda clinica canonica e validar isolamento por `clinicId`

## 13. Go / No-Go para automacao E2E

Automatizar quando:

- os fluxos acima passarem manualmente na clinica piloto
- backend central e NG estiverem bootando de forma repetivel
- smoke local estiver estavel
- automacao central de planos responder com dry-run por clinica
- central de relacionamento responder via overview agregado por clinica
- nao houver placeholder critico no fluxo alvo
