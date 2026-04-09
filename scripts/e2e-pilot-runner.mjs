#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CLINIC_ID = '6666fe38-8a65-48a4-b171-dd0203be8b95';

function stripWrappingQuotes(value) {
  const text = String(value || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1));
    if (key) parsed[key] = value;
  }
  return parsed;
}

function loadLocalConfig(rootDir) {
  return {
    ...loadEnvFile(path.join(rootDir, '.env')),
    ...loadEnvFile(path.join(rootDir, 'whatsapp-engine', '.env')),
  };
}

function normalizeBaseUrl(value, fallback) {
  const candidate = String(value || fallback || '').trim();
  return candidate.endsWith('/') ? candidate : `${candidate}/`;
}

function buildUrl(baseUrl, route, params) {
  const url = new URL(route.replace(/^\//, ''), normalizeBaseUrl(baseUrl));
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchJson(url, { headers = {}, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(url, {
  method = 'GET',
  headers = {},
  timeoutMs = 10000,
  body,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const args = {
    clinicId: DEFAULT_CLINIC_ID,
    flow: '',
    strict: false,
    secondClinicId: '',
    dueSoonDays: 3,
  };

  for (const raw of argv) {
    if (raw.startsWith('--clinicId=')) {
      const clinicId = raw.slice('--clinicId='.length).trim();
      if (clinicId) args.clinicId = clinicId;
      continue;
    }
    if (raw.startsWith('--flow=')) {
      const flow = raw.slice('--flow='.length).trim();
      if (flow) args.flow = flow;
      continue;
    }
    if (raw.startsWith('--secondClinicId=')) {
      const secondClinicId = raw.slice('--secondClinicId='.length).trim();
      if (secondClinicId) args.secondClinicId = secondClinicId;
      continue;
    }
    if (raw === '--strict') {
      args.strict = true;
    }
    if (raw.startsWith('--dueSoonDays=')) {
      const value = Number(raw.slice('--dueSoonDays='.length).trim());
      if (Number.isFinite(value) && value >= 1) args.dueSoonDays = Math.max(1, Math.round(value));
    }
  }

  return args;
}

function getTimestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function resolveClinicInCatalog(catalog = [], reference = '') {
  const normalizedReference = normalizeSearchText(reference);
  if (!normalizedReference) return null;
  const list = Array.isArray(catalog) ? catalog : [];
  return list.find((clinic) => {
    const candidates = [
      clinic?.clinicId,
      clinic?.id,
      clinic?.clinicName,
      clinic?.clinicLegalName,
      clinic?.clinicDocument,
      clinic?.documentNumber,
    ];
    return candidates.some((candidate) => normalizeSearchText(candidate) === normalizedReference);
  }) || null;
}

function buildFlowMatrix({
  smokePassed = false,
  coreReady = false,
  ngReady = false,
  hasSecondClinic = false,
  planMessagingReady = false,
  relationshipReady = false,
} = {}) {
  const platformStatus = coreReady ? 'ready' : 'blocked_preflight';
  const whatsappStatus = (coreReady && ngReady)
    ? (smokePassed ? 'ready_live' : 'live_dependency')
    : 'blocked_preflight';
  const planMessagingStatus = coreReady
    ? ((ngReady && planMessagingReady) ? 'ready_live' : 'live_dependency')
    : 'blocked_preflight';
  const relationshipStatus = (coreReady && relationshipReady) ? 'ready' : 'blocked_preflight';
  const multiClinicaStatus = hasSecondClinic
    ? (coreReady ? 'ready' : 'blocked_preflight')
    : 'pending_second_tenant';

  return [
    {
      id: 'login_contexto',
      title: 'Login e contexto',
      mode: 'manual',
      status: platformStatus,
      steps: [
        'Login com usuario da clinica piloto.',
        'Validar clinicId ativo na sessao.',
        'Validar que usuario e dentistas pertencem a clinica.',
      ],
    },
    {
      id: 'paciente_prontuario',
      title: 'Paciente e prontuario',
      mode: 'manual',
      status: platformStatus,
      steps: [
        'Cadastrar paciente.',
        'Abrir prontuario.',
        'Recarregar a tela.',
        'Confirmar persistencia do mesmo paciente.',
      ],
    },
    {
      id: 'servicos_financeiro',
      title: 'Servicos e financeiro',
      mode: 'manual',
      status: platformStatus,
      steps: [
        'Criar procedimento sem dentista.',
        'Criar procedimento com dentista da clinica.',
        'Validar ficha clinica.',
        'Validar financeiro do paciente.',
        'Validar reflexo na gestao.',
      ],
    },
    {
      id: 'agenda_consultas',
      title: 'Agenda e consultas',
      mode: 'manual',
      status: platformStatus,
      steps: [
        'Criar consulta na agenda.',
        'Abrir Prontuario > Consultas.',
        'Marcar Compareceu.',
        'Marcar Nao compareceu.',
        'Validar que a presenca clinica nao muda o status principal da agenda.',
      ],
    },
    {
      id: 'gestao_index',
      title: 'Gestao e index',
      mode: 'manual',
      status: platformStatus,
      steps: [
        'Validar Seu dia hoje no index.',
        'Validar Controle financeiro em Hoje, Semana e Mes.',
        'Validar faturamento, despesas, saldo e a receber na gestao.',
      ],
    },
    {
      id: 'whatsapp_live',
      title: 'WhatsApp live',
      mode: 'live',
      status: whatsappStatus,
      steps: [
        'Criar agendamento.',
        'Disparar confirmacao por WhatsApp.',
        'Paciente responder 1.',
        'Paciente responder 2.',
        'Validar reflexo na agenda.',
      ],
    },
    {
      id: 'planos_mensageria',
      title: 'Planos e mensageria recorrente',
      mode: 'live',
      status: planMessagingStatus,
      steps: [
        'Criar plano com entrada e parcelas.',
        'Validar entrada e parcelas no financeiro do mes atual.',
        'Executar dry-run central da automacao de planos.',
        'Disparar lembrete de parcela a vencer ou vencida.',
        'Confirmar pagamento de parcela e validar plan_payment_confirmed.',
        'Reenviar manualmente com auditoria e validar historico.',
      ],
    },
    {
      id: 'relacionamento_mensageria',
      title: 'Relacionamento e mensageria central',
      mode: 'manual',
      status: relationshipStatus,
      steps: [
        'Abrir Central de relacionamento.',
        'Validar aniversarios do dia com envio rapido.',
        'Validar dashboard e logs de campanhas do dia.',
        'Validar cobranca recorrente de planos com historico.',
        'Validar retomada da agenda sem sair do modulo.',
      ],
    },
    {
      id: 'multi_clinica',
      title: 'Multi-clinica',
      mode: 'manual',
      status: multiClinicaStatus,
      steps: [
        'Provisionar segunda clinica canonica no ambiente de teste.',
        'Reexecutar fluxo de isolamento entre clinicas.',
      ],
    },
  ];
}

function statusLabel(status) {
  switch (status) {
    case 'ready':
      return 'PRONTO';
    case 'ready_live':
      return 'PRONTO_COM_RUNTIME';
    case 'live_dependency':
      return 'DEPENDENTE_DE_RUNTIME';
    case 'blocked_preflight':
      return 'BLOQUEADO_PREFLIGHT';
    case 'pending_second_tenant':
      return 'PENDENTE_SEGUNDA_CLINICA';
    default:
      return String(status || 'DESCONHECIDO').toUpperCase();
  }
}

function renderJsonBlock(label, payload) {
  return [
    `### ${label}`,
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n');
}

function buildFlowChecklist(flow) {
  const lines = [
    `# Fluxo E2E - ${flow.title}`,
    '',
    `- id: ${flow.id}`,
    `- status: ${statusLabel(flow.status)}`,
    `- mode: ${flow.mode || 'manual'}`,
    '',
    '## Checklist',
    '',
  ];
  for (const step of flow.steps) {
    lines.push(`- [ ] ${step}`);
  }
  lines.push('');
  lines.push('## Evidencias');
  lines.push('');
  lines.push('- screenshot-01.png');
  lines.push('- screenshot-02.png');
  lines.push('- notes.md');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const localConfig = loadLocalConfig(rootDir);
  const timestampSlug = getTimestampSlug();
  const outputDir = path.join(rootDir, 'backups', 'e2e-runs', `pilot-${timestampSlug}`);
  await fsp.mkdir(outputDir, { recursive: true });

  const backendBaseUrl =
    process.env.BACKEND_BASE_URL ||
    process.env.CENTRAL_BACKEND_BASE_URL ||
    localConfig.BACKEND_BASE_URL ||
    localConfig.CENTRAL_BACKEND_BASE_URL ||
    'http://127.0.0.1:4000';
  const ngBaseUrl =
    process.env.NG_BASE_URL ||
    localConfig.NG_BASE_URL ||
    (localConfig.PORT ? `http://127.0.0.1:${localConfig.PORT}` : '') ||
    'http://127.0.0.1:8099';
  const serviceToken =
    process.env.SERVICE_INTERNAL_API_TOKEN ||
    process.env.INTERNAL_API_TOKEN ||
    process.env.NG_INTERNAL_API_TOKEN ||
    localConfig.SERVICE_INTERNAL_API_TOKEN ||
    localConfig.INTERNAL_API_TOKEN ||
    '';
  const backendInternalToken =
    process.env.BACKEND_INTERNAL_API_TOKEN ||
    localConfig.BACKEND_INTERNAL_API_TOKEN ||
    '';

  const backendHealth = await fetchJson(buildUrl(backendBaseUrl, '/health'));
  const backendApiHealth = backendHealth.ok ? null : await fetchJson(buildUrl(backendBaseUrl, '/api/health'));
  const backendClinics = (backendHealth.ok || backendApiHealth?.ok)
    ? await fetchJson(buildUrl(backendBaseUrl, '/clinics'))
    : { ok: false, status: 0, error: 'backend unavailable', data: null };
  const ngHealth = await fetchJson(buildUrl(ngBaseUrl, '/health'));
  const overview = serviceToken
    ? await fetchJson(buildUrl(ngBaseUrl, '/operations/overview', { hours: 24, limit: 5 }), {
        headers: { 'x-service-token': serviceToken },
      })
    : { ok: false, status: 0, error: 'missing service token', data: null };
  const readiness = serviceToken
    ? await fetchJson(buildUrl(ngBaseUrl, '/operations/clinic-readiness', { clinicId: args.clinicId }), {
        headers: { 'x-service-token': serviceToken },
      })
    : { ok: false, status: 0, error: 'missing service token', data: null };
  const planMessagePrimary = backendInternalToken
    ? await requestJson(buildUrl(backendBaseUrl, '/internal/financial/plan-messages/run'), {
        method: 'POST',
        headers: { 'x-service-token': backendInternalToken },
        body: {
          clinicId: args.clinicId,
          dryRun: true,
          dueSoonDays: args.dueSoonDays,
          actorName: 'e2e_pilot_runner',
        },
        timeoutMs: 20000,
      })
    : { ok: false, status: 0, error: 'missing backend internal token', data: null };
  const relationshipPrimary = backendInternalToken
    ? await fetchJson(buildUrl(backendBaseUrl, '/internal/relationships/overview', {
        clinicId: args.clinicId,
        date: new Date().toISOString().slice(0, 10),
        dueSoonDays: args.dueSoonDays,
      }), {
        headers: { 'x-service-token': backendInternalToken },
        timeoutMs: 20000,
      })
    : { ok: false, status: 0, error: 'missing backend internal token', data: null };

  const clinicCatalog = Array.isArray(backendClinics?.data?.data)
    ? backendClinics.data.data
    : (Array.isArray(backendClinics?.data) ? backendClinics.data : []);
  const primaryClinic = resolveClinicInCatalog(clinicCatalog, args.clinicId);
  const secondClinic = args.secondClinicId
    ? resolveClinicInCatalog(clinicCatalog, args.secondClinicId)
    : null;
  const readinessData = readiness?.data?.data || {};
  const primaryPlanAutomationData = planMessagePrimary?.data?.data || {};
  const backendReady = (backendHealth.ok || backendApiHealth?.ok);
  const ngReady = ngHealth.ok && overview.ok;
  const primaryClinicResolved = Boolean(primaryClinic);
  const coreReady = backendReady && primaryClinicResolved;
  const smokePassed = Boolean(readinessData.smokePassed);
  const hasSecondClinic = Boolean(args.secondClinicId && args.secondClinicId !== args.clinicId && secondClinic);
  const planMessagingReady = Boolean(
    planMessagePrimary.ok
    && !primaryPlanAutomationData?.failed
  );
  const relationshipReady = Boolean(relationshipPrimary.ok && relationshipPrimary?.data?.data?.source === 'central');
  const planMessageSecondary = (backendInternalToken && secondClinic)
    ? await requestJson(buildUrl(backendBaseUrl, '/internal/financial/plan-messages/run'), {
        method: 'POST',
        headers: { 'x-service-token': backendInternalToken },
        body: {
          clinicId: secondClinic.id || secondClinic.clinicId,
          dryRun: true,
          dueSoonDays: args.dueSoonDays,
          actorName: 'e2e_pilot_runner',
        },
        timeoutMs: 20000,
      })
    : null;

  const flowMatrix = buildFlowMatrix({
    smokePassed,
    coreReady,
    ngReady,
    hasSecondClinic,
    planMessagingReady,
    relationshipReady,
  });
  const selectedFlows = args.flow
    ? flowMatrix.filter((flow) => flow.id === args.flow)
    : flowMatrix;
  if (args.flow && selectedFlows.length === 0) {
    throw new Error(`flow desconhecido: ${args.flow}`);
  }
  const selectedReady = selectedFlows.every((flow) => ['ready', 'ready_live'].includes(flow.status));
  const overallStatus = selectedReady ? 'READY_FOR_EXECUTION' : 'PRECHECK_FAILED';

  const reportLines = [
    '# Rodada E2E - Clinica Piloto',
    '',
    `- generatedAt: ${new Date().toISOString()}`,
    `- clinicId: ${args.clinicId}`,
    `- overallStatus: ${overallStatus}`,
    `- strict: ${args.strict ? 'true' : 'false'}`,
    `- selectedFlow: ${args.flow || 'all'}`,
    `- dueSoonDays: ${args.dueSoonDays}`,
    '',
    '## Preflight vivo da plataforma',
    '',
    `- backend.health: ${(backendHealth.ok || backendApiHealth?.ok) ? 'OK' : 'FAIL'}`,
    `- backend.clinic.primary: ${primaryClinicResolved ? 'OK' : 'FAIL'}`,
    `- ng.health: ${ngHealth.ok ? 'OK' : 'FAIL'}`,
    `- ng.operations.overview: ${overview.ok ? 'OK' : 'FAIL'}`,
    `- ng.clinic.readiness: ${smokePassed ? 'OK' : 'FAIL'}`,
    `- plan_messages.primary.dry_run: ${planMessagePrimary.ok ? 'OK' : 'FAIL'}`,
    `- relationship.primary.overview: ${relationshipPrimary.ok ? 'OK' : 'FAIL'}`,
    `- plan_messages.second.dry_run: ${args.secondClinicId ? (planMessageSecondary?.ok ? 'OK' : 'FAIL') : 'NAO_CONFIGURADA'}`,
    `- secondClinic.ready: ${args.secondClinicId ? (secondClinic ? 'CONFIGURADA' : 'NAO_ENCONTRADA') : 'NAO_CONFIGURADA'}`,
    '',
    '## Matriz de fluxos',
    '',
  ];

  for (const flow of selectedFlows) {
    reportLines.push(`### ${flow.title}`);
    reportLines.push('');
    reportLines.push(`- status: ${statusLabel(flow.status)}`);
    reportLines.push(`- mode: ${flow.mode || 'manual'}`);
    for (const step of flow.steps) {
      reportLines.push(`- ${step}`);
    }
    reportLines.push('');
  }

  reportLines.push('## Snapshots de validacao');
  reportLines.push('');
  reportLines.push(renderJsonBlock('backend.health', backendHealth.ok ? backendHealth : (backendApiHealth || backendHealth)));
  reportLines.push('');
  reportLines.push(renderJsonBlock('backend.clinics.catalog', {
    ok: backendClinics.ok,
    status: backendClinics.status,
    total: clinicCatalog.length,
    primaryClinic,
    secondClinicLookup: args.secondClinicId || null,
    secondClinic,
  }));
  reportLines.push('');
  reportLines.push(renderJsonBlock('ng.health', ngHealth));
  reportLines.push('');
  reportLines.push(renderJsonBlock('ng.operations.overview', overview));
  reportLines.push('');
  reportLines.push(renderJsonBlock(`ng.clinic.${args.clinicId}`, readiness));
  reportLines.push('');
  reportLines.push(renderJsonBlock(`plan_messages.primary.${args.clinicId}`, planMessagePrimary));
  reportLines.push('');
  reportLines.push(renderJsonBlock(`relationship.primary.${args.clinicId}`, relationshipPrimary));
  reportLines.push('');
  if (args.secondClinicId) {
    reportLines.push(renderJsonBlock(`plan_messages.second.${args.secondClinicId}`, planMessageSecondary || {
      ok: false,
      status: 0,
      error: 'second clinic not configured',
      data: null,
    }));
    reportLines.push('');
  }
  reportLines.push('## Gaps atuais');
  reportLines.push('');
  reportLines.push('- Nao existe framework de UI E2E instalado no projeto neste momento.');
  reportLines.push(args.secondClinicId
    ? (
      secondClinic
        ? '- A segunda clinica de teste foi validada no catalogo central para a rodada multi-clinica.'
        : '- A segunda clinica informada ainda nao foi localizada no catalogo central.'
    )
    : '- O fluxo multi-clinica E2E completo depende de uma segunda clinica canonica provisionada para teste.');
  reportLines.push(smokePassed
    ? '- O runtime live do WhatsApp esta apto para a rodada desta clinica.'
    : '- O fluxo live do WhatsApp continua dependendo de sessao ativa e resposta real do provedor em cada execucao.');
  reportLines.push(planMessagingReady
    ? '- A automacao central de planos respondeu em dry-run para a clinica primaria.'
    : '- A mensageria recorrente de planos ainda nao respondeu em dry-run para a clinica primaria nesta execucao.');
  reportLines.push(relationshipReady
    ? '- O overview central de relacionamento respondeu com aniversarios, campanhas, planos e agenda da clinica primaria.'
    : '- A central de relacionamento ainda nao respondeu via overview agregado nesta execucao.');
  reportLines.push('');
  reportLines.push('## Proximo passo');
  reportLines.push('');
  reportLines.push('- Executar manualmente os fluxos marcados como PRONTO.');
  reportLines.push('- Registrar evidencia por tela e por clinicId.');
  reportLines.push('- Validar o fluxo Planos e mensageria recorrente com duas clinicas e historico por parcela.');
  reportLines.push('- Depois decidir entre Playwright/Electron automation ou Cypress web-first, sem abrir dependencia nova no escuro.');
  reportLines.push('');

  const manifest = {
    generatedAt: new Date().toISOString(),
    clinicId: args.clinicId,
    selectedFlow: args.flow || 'all',
    overallStatus,
    strict: Boolean(args.strict),
    backendReady,
    primaryClinicResolved,
    ngReady,
    coreReady,
    smokePassed,
    planMessagingReady,
    relationshipReady,
    hasSecondClinic,
    primaryClinic,
    secondClinicLookup: args.secondClinicId || '',
    secondClinic,
    dueSoonDays: args.dueSoonDays,
    backendInternalTokenConfigured: Boolean(backendInternalToken),
    planMessagePrimary,
    relationshipPrimary,
    planMessageSecondary,
    flows: selectedFlows.map((flow) => ({
      id: flow.id,
      title: flow.title,
      status: flow.status,
      mode: flow.mode || 'manual',
      steps: flow.steps,
    })),
  };

  const flowsDir = path.join(outputDir, 'flows');
  await fsp.mkdir(flowsDir, { recursive: true });
  for (const flow of selectedFlows) {
    const flowDir = path.join(flowsDir, flow.id);
    const evidenceDir = path.join(flowDir, 'evidencias');
    await fsp.mkdir(evidenceDir, { recursive: true });
    await fsp.writeFile(path.join(flowDir, 'checklist.md'), buildFlowChecklist(flow), 'utf8');
    await fsp.writeFile(path.join(evidenceDir, '.gitkeep'), '', 'utf8');
  }

  const reportPath = path.join(outputDir, 'resultado-e2e-clinica-piloto.md');
  const manifestPath = path.join(outputDir, 'manifest.json');
  await fsp.writeFile(reportPath, reportLines.join('\n'), 'utf8');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  process.stdout.write(`[e2e-pilot] artifact=${reportPath}\n`);
  process.stdout.write(`[e2e-pilot] manifest=${manifestPath}\n`);
  process.stdout.write(`[e2e-pilot] overallStatus=${overallStatus}\n`);

  const selectedBlocked = selectedFlows.some((flow) => !['ready', 'ready_live'].includes(flow.status));
  if (args.strict ? (selectedBlocked || overallStatus !== 'READY_FOR_EXECUTION') : (overallStatus !== 'READY_FOR_EXECUTION')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`[e2e-pilot] fatal=${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
