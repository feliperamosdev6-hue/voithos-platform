README - Extensoes Futuras (Voithos)
=================================

Contexto atual
- Desktop/Electron com renderer HTML/JS e backend main.js (IPC) + preload.js para exposicao.
- Dados locais em userData (pacientes, servicos, agenda, financeiro).
- Controle de acesso baseado em tipo (admin/recepcionista/dentista), com regras recentes para campanhas e atribuicao paciente-dentista.

Diretrizes gerais
- Manter single-source-of-truth para dominio (campanhas, pacientes, agenda) em camada de servicos no backend (main.js) e expor via IPC em preload.
- Evitar acoplamento direto do renderer ao storage local; usar handlers dedicados por dominio.
- Preparar nomes/estruturas sem implementar logica para facilitar expansao a cloud/mobile/IA.

Pastas sugeridas (no userData / projeto)
- dominio/campanhas/global/ : armazenamento de campanhas globais (cache) separadas das locais.
- dominio/assistente/ : prompt templates, contexto, logs de sugestoes.
- dominio/mobile-sync/ : fila e estado de sincronizacao para app mobile (dentista/paciente).
- services/ (backend) : dividir funcoes de main.js em modulos (campanhasService.js, pacientesService.js, agendaService.js, arquivosService.js, assistenteService.js [futuro]).
- api/ (renderer) : camadas de chamada IPC por dominio (api/campanhas.js, api/assistente.js, api/mobile-sync.js) para facilitar reutilizacao web/mobile.

Handlers futuros (IPC/backend)
- campanhas-load-global
- campanhas-sync-global (atualizar cache global a partir de fonte externa)
- campanhas-merge-exibir (combinar globais + locais respeitando permissao)
- assistente-sugerir-proximo-passo (recebe contexto paciente/agenda)
- assistente-gerar-texto (ex.: mensagem para paciente)
- mobile-sync-enqueue (fila de eventos/alteracoes para apps)
- mobile-sync-pull (dentista/paciente buscam delta)
- mobile-sync-ack (confirma processamento)

Estruturas de dados esperadas
- CampanhaGlobal: { id, titulo, descricao, periodo, cor, origem: 'voithos', publico: 'pacientes_clinica', status: 'ativa', canal?: ['email','sms','push'], dataCriacao, dataAtualizacao }
- CampanhaLocal (atual): { id, nome, descricao, periodo, cor, publico: 'pacientes_clinica', status }
- AssistenteContexto: { tipo: 'agenda'|'paciente'|'financeiro', usuario: { id, tipo }, paciente?: { prontuario, dentistaId }, agenda?: { data, procedimentos }, entradaUsuario: string }
- AssistenteResposta: { id, texto, acoesSugeridas?: [{ tipo: 'mensagem'|'agendamento'|'servico', payload }], origem: 'ia' }
- MobileSyncEvento: { id, tipo: 'paciente'|'agenda'|'campanha'|'arquivo', acao: 'create'|'update'|'delete', payload, timestamp, actorId, versao }
- MobileSyncPullResponse: { cursor, eventos: MobileSyncEvento[] }

Pontos de extensao (sugestoes)
- Incluir camada services/ para isolar regras de negocio; main.js apenas registra IPC -> service.*; preload expõe apenas surface controlada.
- Segregar campanhas globais em dominio/campanhas/global e handlers dedicados para evitar mistura com campanhas locais (UI combina). Nenhum filtro por dentista.
- Assistente: criar handler de sugerir com feature-flag e dependencia injetada (ex.: provider IA) para nao quebrar offline; logs em dominio/assistente/.
- Mobile: fila de eventos em dominio/mobile-sync/ com handlers de enqueue/pull/ack; preferir ids monotonicos e controles de versao para conflito.
- Em renderer, criar api/* modulares e componentes isolados (p. ex. CampanhasProvider) para que mobile/web compartilhem logica.

Seguranca/permissoes
- Campanhas globais: leitura liberada; criacao/edicao local continua admin/recepcionista; dentista apenas leitura.
- Assistente: nunca executar acoes automaticamente; apenas sugerir payloads revisados por usuario; registrar actorId.
- Mobile sync: aplicar requireRole nos handlers; eventos respeitam dentistaId do paciente; nao expor dados de outros dentistas em pull.

Passos futuros
- Extrair funcoes de campanhas/pacientes/agenda de main.js para services/* mantendo assinaturas atuais.
- Adicionar preload api/campanhas.js e api/mobile-sync.js (placeholders) chamando novos handlers.
- Ajustar renderer para consumir api/* em vez de chamar window.api direto, permitindo swap para mobile bridge.
