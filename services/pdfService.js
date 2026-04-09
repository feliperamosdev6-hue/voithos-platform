const path = require('path');
const crypto = require('crypto');
const { createPdfRendererService } = require('./pdfRendererService');

const createPdfService = ({
  BrowserWindow,
  fsPromises,
  ensureDir,
  financeReportsPath,
  readJsonFile,
  pathExists,
  clinicFile,
  usersPath,
  readUsers,
  readFinance,
  buildFinanceMonthlyReport,
  getFinancialReport,
  userDataPath,
  getClinicProfile,
  getClinicLogoDataUrl,
  getCurrentUser,
}) => {
  const DEFAULT_CLINIC_ID = 'defaultClinic';
  const getCurrentClinicId = () => String(getCurrentUser?.()?.clinicId || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
  const shouldFallbackToLocal = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    const status = Number(error?.status || 0);
    return code === 'CENTRAL_BACKEND_UNAVAILABLE'
      || code === 'CENTRAL_BACKEND_TIMEOUT'
      || error?.name === 'AbortError'
      || status >= 500;
  };

  const pdfRenderer = createPdfRendererService({
    BrowserWindow,
    fsPromises,
    ensureDir,
    getClinicProfile: getClinicProfile || (async () => ({})),
    getClinicLogoDataUrl: getClinicLogoDataUrl || (async () => ''),
    allowedOutputDirs: [userDataPath, financeReportsPath].filter(Boolean),
  });
  const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatFieldValue = (value) => {
    if (Array.isArray(value)) {
      if (!value.length) return '-';
      return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ') || '-';
    }
    if (value === true || value === 'on') return 'Sim';
    if (value === false) return 'Nao';
    const text = String(value || '').trim();
    return text || '-';
  };

  const getTemplateValue = (value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (item && typeof item === 'object') {
            const nome = String(item.nome || '').trim();
            const posologia = String(item.posologia || '').trim();
            const quantidade = String(item.quantidade || '').trim();
            return [nome, posologia, quantidade].filter(Boolean).join(' | ');
          }
          return String(item || '').trim();
        })
        .filter(Boolean)
        .join('\n');
    }
    if (value === true || value === 'on') return 'Sim';
    if (value === false) return 'Nao';
    return String(value ?? '').trim();
  };

  const deepGet = (obj, keyPath) => {
    const parts = String(keyPath || '').split('.').filter(Boolean);
    let ref = obj;
    for (const part of parts) {
      if (ref && Object.prototype.hasOwnProperty.call(ref, part)) {
        ref = ref[part];
      } else {
        return '';
      }
    }
    return ref;
  };

  const ensureHtmlDocument = (html) => {
    const text = String(html || '').trim();
    if (!text) return '';
    if (/<html[\s>]/i.test(text)) return text;
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <style>body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }</style>
</head>
<body>${text}</body>
</html>`;
  };

  const renderTemplate = (html, context) =>
    String(html || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
      const value = deepGet(context, key);
      return escapeHtml(getTemplateValue(value));
    });

  const readDocumentModels = async (clinicIdArg = getCurrentClinicId()) => {
    if (!clinicFile || !pathExists || !readJsonFile) return [];
    const clinicId = String(clinicIdArg || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
    const clinicRoot = path.dirname(clinicFile);
    const scopedModelsFile = path.join(clinicRoot, 'by-clinic', clinicId, 'document-modelos.json');
    const legacyModelsFile = path.join(clinicRoot, 'document-modelos.json');
    const modelsFile = (await pathExists(scopedModelsFile)) ? scopedModelsFile : legacyModelsFile;
    if (!(await pathExists(modelsFile))) return [];
    try {
      const data = await readJsonFile(modelsFile);
      return Array.isArray(data?.models) ? data.models : [];
    } catch (_) {
      return [];
    }
  };

  const getActiveModelByType = async (type, clinicIdArg = getCurrentClinicId()) => {
    const targetType = String(type || '').trim().toLowerCase();
    if (!targetType) return null;
    const list = await readDocumentModels(clinicIdArg);
    return list.find((m) => String(m?.type || '').toLowerCase() === targetType && m?.active) || null;
  };

  const readClinicContext = async (clinicIdArg = getCurrentClinicId()) => {
    if (!clinicFile || !pathExists || !readJsonFile) return {};
    try {
      const clinicId = String(clinicIdArg || DEFAULT_CLINIC_ID).trim() || DEFAULT_CLINIC_ID;
      const clinicRoot = path.dirname(clinicFile);
      const scopedClinicFile = path.join(clinicRoot, 'by-clinic', clinicId, 'clinica.json');
      const sourceFile = (await pathExists(scopedClinicFile)) ? scopedClinicFile : clinicFile;
      if (!(await pathExists(sourceFile))) return {};
      const clinic = await readJsonFile(sourceFile);
      const safe = clinic && typeof clinic === 'object' ? clinic : {};
      const clinicCro = String(safe?.cro || '').trim();
      const clinicResponsavel = String(safe?.responsavelTecnico || '').trim();
      safe.receituario = (safe.receituario && typeof safe.receituario === 'object') ? { ...safe.receituario } : {};
      if (!String(safe.receituario.assinaturaRegistro || '').trim() && clinicCro) {
        safe.receituario.assinaturaRegistro = clinicCro;
      }
      if (!String(safe.receituario.assinaturaNome || '').trim() && clinicResponsavel) {
        safe.receituario.assinaturaNome = clinicResponsavel;
      }
      const assinaturaFile = safe?.receituario?.assinaturaImagemFile || '';
      if (assinaturaFile) {
        try {
          const scopedDir = path.dirname(sourceFile);
          const filePath = path.isAbsolute(assinaturaFile)
            ? assinaturaFile
            : path.join(scopedDir, assinaturaFile);
          if (await pathExists(filePath)) {
            const buffer = await fsPromises.readFile(filePath);
            const ext = path.extname(assinaturaFile).replace('.', '') || 'png';
            safe.receituario = {
              ...(safe.receituario || {}),
              assinaturaImagemData: `data:image/${ext};base64,${buffer.toString('base64')}`,
            };
          }
        } catch (_) {
          // fallback sem imagem
        }
      }
      return safe;
    } catch (_) {
      return {};
    }
  };

  const readProfessionalReceituario = async (professionalId) => {
    if (!readUsers || !professionalId) return {};
    try {
      const users = await readUsers();
      const prof = (Array.isArray(users) ? users : []).find((u) => (
        String(u?.id || '') === String(professionalId)
        || String(u?.userId || '') === String(professionalId)
      ));
      const receituario = (prof && typeof prof.receituario === 'object') ? { ...prof.receituario } : {};
      const professionalCro = String(prof?.cro || '').trim();
      const professionalName = String(prof?.nome || '').trim();
      if (!String(receituario.assinaturaRegistro || '').trim() && professionalCro) {
        receituario.assinaturaRegistro = professionalCro;
      }
      if (!String(receituario.assinaturaNome || '').trim() && professionalName) {
        receituario.assinaturaNome = professionalName;
      }
      const assinaturaFile = receituario.assinaturaImagemFile || '';
      if (assinaturaFile && usersPath && pathExists) {
        try {
          const filePath = path.join(usersPath, assinaturaFile);
          if (await pathExists(filePath)) {
            const buffer = await fsPromises.readFile(filePath);
            const ext = path.extname(assinaturaFile).replace('.', '') || 'png';
            receituario.assinaturaImagemData = `data:image/${ext};base64,${buffer.toString('base64')}`;
          }
        } catch (_) {
          // ignore
        }
      }
      return receituario;
    } catch (_) {
      return {};
    }
  };

  const renderDocumentModelOrNull = async ({ type, context, clinicId }) => {
    const model = await getActiveModelByType(type, clinicId || getCurrentClinicId());
    const contentHtml = String(model?.contentHtml || '').trim();
    if (!contentHtml) return null;
    const rendered = renderTemplate(contentHtml, context || {});
    const html = ensureHtmlDocument(rendered);
    return html || null;
  };

  const renderAnamneseHtml = ({ patient, data, doc }) => {
    const rows = [
      { label: 'Paciente', value: data.patientName || patient?.fullName || patient?.nome || '-' },
      { label: 'Prontuario', value: data.patientProntuario || patient?.prontuario || '-' },
      { label: 'CPF', value: data.cpf || patient?.cpf || '-' },
      { label: 'Data', value: data.anamneseDate || '-' },
      { label: 'Responsavel', value: data.responsavel || '-' },
      { label: 'Queixa principal', value: data.queixa || '-' },
      { label: 'Historico de saude', value: data.historicoMedico || '-' },
      { label: 'Alergias', value: data.alergias || '-' },
      { label: 'Medicamentos em uso', value: data.medicamentos || '-' },
      { label: 'Condicoes sistemicas', value: data['condicoes[]'] || '-' },
      { label: 'Usa anticoagulantes', value: data.anticoagulantes || '-' },
      { label: 'Usa antidepressivos', value: data.antidepressivos || '-' },
      { label: 'Usa corticoides', value: data.corticoides || '-' },
      { label: 'Usa insulina', value: data.insulina || '-' },
      { label: 'Reacao a anestesia odontologica', value: data.reacaoAnestesia || '-' },
      { label: 'Sangramento excessivo', value: data.sangramentoExcessivo || '-' },
      { label: 'Desmaio em atendimento odontologico', value: data.desmaioOdonto || '-' },
      { label: 'Gestante', value: data.gestante || '-' },
      { label: 'Pressao arterial', value: data.pressao || '-' },
      { label: 'Historico odontologico', value: data.historicoOdonto || '-' },
      { label: 'Frequencia de escovacao', value: data.escovacao || '-' },
      { label: 'Ultima visita ao dentista', value: data.ultimaVisita || '-' },
      { label: 'Motivo da ultima visita', value: data.motivoUltimaVisita || '-' },
      { label: 'Sensibilidade dentaria', value: data.sensibilidade || '-' },
      { label: 'Dor ao mastigar', value: data.dorMastigar || '-' },
      { label: 'Ranger os dentes (bruxismo)', value: data.bruxismo || '-' },
      { label: 'Uso de fio dental', value: data.fioDental || '-' },
      { label: 'Habitos e observacoes', value: data.habitos || '-' },
      { label: 'Declaracao de verdade', value: data.declaracaoVerdade || '-' },
      { label: 'Data e hora do preenchimento', value: data.dataHoraPreenchimento || '-' },
      { label: 'Origem do preenchimento', value: data.origemPreenchimento || '-' },
      { label: 'Plano de tratamento', value: data.planoTratamento || '-' },
      { label: 'Observacoes gerais', value: data.observacoes || '-' },
      { label: 'Dispositivo', value: data.deviceInfo || '-' },
    ];

    const rowsHtml = rows.map((row) => (
      `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(formatFieldValue(row.value))}</td></tr>`
    )).join('');

    const title = doc?.title || 'Anamnese';
    const generatedAt = new Date().toLocaleString('pt-BR');
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
    th { width: 32%; font-weight: 700; background: #f8fafc; }
    td { white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Gerado em: ${escapeHtml(generatedAt)}</div>
  <table>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;
  };

  const renderAtestadoHtml = ({ patient, data, doc, clinic }) => {
    const title = 'Atestado';
    const toDisplayDate = (rawDate) => {
      const safe = String(rawDate || '').trim();
      if (!safe) return new Date();
      if (/^\d{4}-\d{2}-\d{2}$/.test(safe)) return new Date(`${safe}T12:00:00`);
      const parsed = new Date(safe);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };
    const issueDate = toDisplayDate(data.data);
    const issueDateLong = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(issueDate);
    const patientName = data.pacienteNome || patient?.fullName || patient?.nome || '-';
    const patientCpf = patient?.cpf ? ` CPF ${patient.cpf}` : '';
    const localidadeCidade = String(clinic?.cidade || clinic?.endereco?.cidade || '').trim();
    const localidadeUf = String(clinic?.uf || clinic?.endereco?.uf || '').trim();
    const localidade = [localidadeCidade, localidadeUf].filter(Boolean).join(' - ') || 'Cidade';
    const conteudo = data.tipo === 'horas'
      ? `Em decorrencia, devera permanecer afastado(a) de suas atividades no periodo de ${formatFieldValue(data.horaInicio || '--:--')} ate ${formatFieldValue(data.horaFim || '--:--')}, nesta data.`
      : `Em decorrencia, devera permanecer afastado(a) de suas atividades por um periodo de ${formatFieldValue(data.dias || 1)} dia(s), a partir desta data.`;
    const assinatura = (clinic && typeof clinic.receituario === 'object') ? clinic.receituario : {};
    const assinaturaNome = assinatura.assinaturaNome || data.profissionalNome || 'Assinatura do profissional';
    const assinaturaRegistro = assinatura.assinaturaRegistro || '';

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 12px 34px 10px; }
    h1 { font-size: 24px; margin: 0; text-align: center; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .doc-head { margin: 10px 0 46px; }
    .doc-date { margin-top: 0; font-size: 15px; color: #1e293b; }
    .doc-text { margin-top: 36px; font-size: 15px; line-height: 1.75; color: #0f172a; }
    .doc-text p { margin: 0 0 16px; }
    .doc-cid { margin-top: 10px; font-weight: 700; }
    .signature { margin-top: 92px; text-align: center; page-break-inside: avoid; }
    .signature-image { margin: 0 auto 8px; max-height: 76px; max-width: 320px; object-fit: contain; display: block; }
    .signature-line { margin: 0 auto 14px; border-top: 1px solid #334155; width: 300px; max-width: 90%; }
    .signature-name { font-size: 16px; font-weight: 500; color: #0f172a; }
    .signature-reg { margin-top: 4px; font-size: 14px; color: #334155; }
  </style>
</head>
<body>
  <div class="doc-head">
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="doc-date">${escapeHtml(`${localidade}, ${issueDateLong}`)}</div>
  <div class="doc-text">
    <p>Atesto, para os devidos fins, que o(a) Sr.(a) <strong>${escapeHtml(patientName)}</strong>${escapeHtml(patientCpf)}, foi submetido(a) a procedimentos nesta data.</p>
    <p>${escapeHtml(conteudo)}</p>
    ${data.cid ? `<p class="doc-cid">CID: ${escapeHtml(data.cid)}</p>` : ''}
  </div>
  <div class="signature">
    ${assinatura.assinaturaImagemData ? `<img class="signature-image" src="${escapeHtml(assinatura.assinaturaImagemData)}" alt="Assinatura digital">` : ''}
    <div class="signature-line"></div>
    <div class="signature-name">${escapeHtml(assinaturaNome)}</div>
    ${assinaturaRegistro ? `<div class="signature-reg">${escapeHtml(assinaturaRegistro)}</div>` : ''}
  </div>
</body>
</html>`;
  };

  const generateAtestadoPdf = async ({ jsonPath, pdfPath, patient, doc }) => {
    const payload = await readJsonFile(jsonPath);
    const data = payload?.data || {};
    const clinicId = getCurrentClinicId();
    const clinic = await readClinicContext(clinicId);
    const clinicReceita = (clinic && typeof clinic.receituario === 'object') ? clinic.receituario : {};
    const profissionalReceita = await readProfessionalReceituario(data.profissionalId);
    const pick = (preferred, fallback) => {
      const value = String(preferred || '').trim();
      if (value) return value;
      return String(fallback || '').trim();
    };
    const effectiveReceituario = {
      ...clinicReceita,
      ...profissionalReceita,
      assinaturaNome: pick(profissionalReceita.assinaturaNome, clinicReceita.assinaturaNome),
      assinaturaRegistro: pick(profissionalReceita.assinaturaRegistro, clinicReceita.assinaturaRegistro),
      assinaturaImagemData: pick(profissionalReceita.assinaturaImagemData, clinicReceita.assinaturaImagemData),
    };
    const clinicForAtestado = {
      ...(clinic || {}),
      receituario: effectiveReceituario,
    };
    const context = {
      paciente: {
        nome: data.pacienteNome || patient?.fullName || patient?.nome || '',
        prontuario: data.prontuario || patient?.prontuario || '',
        cpf: patient?.cpf || '',
      },
      profissional: {
        nome: data.profissionalNome || '',
        id: data.profissionalId || '',
        receituario: {
          assinaturaNome: effectiveReceituario.assinaturaNome || '',
          assinaturaRegistro: effectiveReceituario.assinaturaRegistro || '',
          assinaturaImagemData: effectiveReceituario.assinaturaImagemData || '',
        },
      },
      clinica: clinicForAtestado,
      documento: {
        tipo: data.tipo || '',
        data: data.data || '',
        dias: data.dias || '',
        horaInicio: data.horaInicio || '',
        horaFim: data.horaFim || '',
        cid: data.cid || '',
        assinatura: data.assinatura ? 'Sim' : 'Nao',
        conteudo: data.tipo === 'dias'
          ? `Afastamento por ${data.dias || 0} dia(s).`
          : `Afastamento de ${data.horaInicio || '--:--'} ate ${data.horaFim || '--:--'}.`,
      },
      metadata: {
        title: doc?.title || 'Atestado',
        generatedAt: new Date().toISOString(),
      },
    };
    const modelHtml = await renderDocumentModelOrNull({ type: 'atestado', context, clinicId });
    const html = modelHtml || renderAtestadoHtml({ patient, data, doc, clinic: clinicForAtestado });
    const atestadoDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.data || '').trim())
      ? new Date(`${String(data.data).trim()}T12:00:00`)
      : new Date();
    const emitidoEm = new Intl.DateTimeFormat('pt-BR').format(atestadoDate);

    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'atestado',
      payload: data,
      outputPath: pdfPath,
      contentHTML: html,
      headerOptions: { emitidoEm },
      footerOptions: { emitidoEm },
    });
  };

  const renderReceitaHtml = ({ patient, data, doc, clinic }) => {
    const title = 'Receita';
    const itens = Array.isArray(data.itens) ? data.itens : [];
    const receituario = (clinic && typeof clinic.receituario === 'object') ? clinic.receituario : {};
    const toDisplayDate = (rawDate) => {
      const safe = String(rawDate || '').trim();
      if (!safe) return new Date();
      if (/^\d{4}-\d{2}-\d{2}$/.test(safe)) return new Date(`${safe}T12:00:00`);
      const parsed = new Date(safe);
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    };
    const issueDate = toDisplayDate(data.data);
    const issueDateLong = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(issueDate);
    const localidadeCidade = String(clinic?.cidade || clinic?.endereco?.cidade || '').trim();
    const localidadeUf = String(clinic?.uf || clinic?.endereco?.uf || '').trim();
    const localidade = [localidadeCidade, localidadeUf].filter(Boolean).join(' - ') || 'Cidade';
    const assinaturaNome = receituario.assinaturaNome || data.profissionalNome || 'Assinatura do profissional';
    const assinaturaRegistro = receituario.assinaturaRegistro || '';
    const itensHtml = itens.length
      ? itens.map((item) => `
        <tr>
          <td>${escapeHtml(formatFieldValue(item?.nome))}</td>
          <td>${escapeHtml(formatFieldValue(item?.posologia))}</td>
          <td>${escapeHtml(formatFieldValue(item?.quantidade))}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="3">Sem itens estruturados.</td></tr>';

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 12px 34px 10px; }
    h1 { font-size: 24px; margin: 0; text-align: center; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .doc-head { margin: 10px 0 46px; }
    .doc-date { margin-top: 0; font-size: 15px; color: #1e293b; }
    .doc-text { margin-top: 20px; font-size: 15px; line-height: 1.7; color: #0f172a; }
    .doc-text p { margin: 0 0 12px; white-space: pre-wrap; }
    .bloco { margin-bottom: 14px; page-break-inside: avoid; }
    .label { font-size: 13px; color: #334155; margin-bottom: 4px; font-weight: 700; }
    .value { white-space: pre-wrap; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { background: #f8fafc; font-weight: 700; }
    .signature { margin-top: 72px; text-align: center; page-break-inside: avoid; }
    .signature-image { margin: 0 auto 8px; max-height: 76px; max-width: 320px; object-fit: contain; display: block; }
    .signature-line { margin: 0 auto 14px; border-top: 1px solid #334155; width: 300px; max-width: 90%; }
    .signature-name { font-size: 16px; font-weight: 500; color: #0f172a; }
    .signature-reg { margin-top: 4px; font-size: 14px; color: #334155; }
  </style>
</head>
<body>
  ${receituario.cabecalho ? `<div class="bloco"><div class="value">${escapeHtml(formatFieldValue(receituario.cabecalho))}</div></div>` : ''}
  <div class="doc-head">
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="doc-date">${escapeHtml(`${localidade}, ${issueDateLong}`)}</div>

  <div class="doc-text">
    <p>Paciente: <strong>${escapeHtml(formatFieldValue(data.pacienteNome || patient?.fullName || patient?.nome || '-'))}</strong></p>
    <p>Prontuario: ${escapeHtml(formatFieldValue(data.prontuario || patient?.prontuario || '-'))}</p>
    <p>Profissional: ${escapeHtml(formatFieldValue(data.profissionalNome || '-'))}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Medicamento</th>
        <th>Posologia</th>
        <th>Quantidade</th>
      </tr>
    </thead>
    <tbody>
      ${itensHtml}
    </tbody>
  </table>

  <div class="bloco">
    <div class="label">Texto livre</div>
    <div class="value">${escapeHtml(formatFieldValue(data.texto || '-'))}</div>
  </div>
  <div class="bloco">
    <div class="label">Observacoes</div>
    <div class="value">${escapeHtml(formatFieldValue(data.observacoes || '-'))}</div>
  </div>

  <div class="signature">
    ${receituario.assinaturaImagemData ? `<img class="signature-image" src="${escapeHtml(receituario.assinaturaImagemData)}" alt="Assinatura digital">` : ''}
    <div class="signature-line"></div>
    <div class="signature-name">${escapeHtml(assinaturaNome)}</div>
    ${assinaturaRegistro ? `<div class="signature-reg">${escapeHtml(assinaturaRegistro)}</div>` : ''}
  </div>
  ${receituario.rodape ? `<div class="bloco"><div class="value">${escapeHtml(formatFieldValue(receituario.rodape))}</div></div>` : ''}
</body>
</html>`;
  };

  const generateAnamnesePdf = async ({ jsonPath, pdfPath, patient, doc }) => {
    const payload = await readJsonFile(jsonPath);
    const data = payload?.data || {};
    const clinicId = getCurrentClinicId();
    const clinic = await readClinicContext(clinicId);
    const context = {
      paciente: {
        nome: data.patientName || patient?.fullName || patient?.nome || '',
        prontuario: data.patientProntuario || patient?.prontuario || '',
        cpf: data.cpf || patient?.cpf || '',
      },
      clinica: clinic,
      documento: data,
      metadata: {
        title: doc?.title || 'Anamnese',
        generatedAt: new Date().toISOString(),
      },
    };
    const modelHtml = await renderDocumentModelOrNull({ type: 'anamnese', context, clinicId });
    const html = modelHtml || renderAnamneseHtml({ patient, data, doc });

    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'anamnese',
      payload: data,
      outputPath: pdfPath,
      contentHTML: html,
    });
  };

  const generateReceitaPdf = async ({ jsonPath, pdfPath, patient, doc }) => {
    const payload = await readJsonFile(jsonPath);
    const data = payload?.data || {};
    const itens = Array.isArray(data.itens) ? data.itens : [];
    const itensTexto = itens.length
      ? itens
        .map((item, index) => {
          const nome = String(item?.nome || '').trim();
          const posologia = String(item?.posologia || '').trim();
          const quantidade = String(item?.quantidade || '').trim();
          const parts = [nome, posologia, quantidade].filter(Boolean);
          return parts.length ? `${index + 1}. ${parts.join(' | ')}` : '';
        })
        .filter(Boolean)
        .join('\n')
      : '';
    const clinicId = getCurrentClinicId();
    const clinic = await readClinicContext(clinicId);
    const clinicReceita = (clinic && typeof clinic.receituario === 'object') ? clinic.receituario : {};
    const profissionalReceita = await readProfessionalReceituario(data.profissionalId);
    const pick = (preferred, fallback) => {
      const value = String(preferred || '').trim();
      if (value) return value;
      return String(fallback || '').trim();
    };
    const effectiveReceituario = {
      ...clinicReceita,
      ...profissionalReceita,
      assinaturaNome: pick(profissionalReceita.assinaturaNome, clinicReceita.assinaturaNome),
      assinaturaRegistro: pick(profissionalReceita.assinaturaRegistro, clinicReceita.assinaturaRegistro),
      assinaturaImagemData: pick(profissionalReceita.assinaturaImagemData, clinicReceita.assinaturaImagemData),
    };
    const clinicForReceita = {
      ...(clinic || {}),
      receituario: effectiveReceituario,
    };
    const context = {
      paciente: {
        nome: data.pacienteNome || patient?.fullName || patient?.nome || '',
        prontuario: data.prontuario || patient?.prontuario || '',
        cpf: patient?.cpf || '',
      },
      profissional: {
        nome: data.profissionalNome || '',
        id: data.profissionalId || '',
        receituario: {
          assinaturaNome: effectiveReceituario.assinaturaNome || '',
          assinaturaRegistro: effectiveReceituario.assinaturaRegistro || '',
          assinaturaImagemData: effectiveReceituario.assinaturaImagemData || '',
        },
      },
      clinica: clinicForReceita,
      documento: {
        data: data.data || '',
        itens,
        itensTexto,
        texto: data.texto || '',
        observacoes: data.observacoes || '',
        cabecalho: effectiveReceituario.cabecalho || '',
        rodape: effectiveReceituario.rodape || '',
        assinaturaNome: effectiveReceituario.assinaturaNome || '',
        assinaturaRegistro: effectiveReceituario.assinaturaRegistro || '',
        assinaturaImagemData: effectiveReceituario.assinaturaImagemData || '',
      },
      metadata: {
        title: doc?.title || 'Receita',
        generatedAt: new Date().toISOString(),
      },
    };
    const modelHtml = await renderDocumentModelOrNull({ type: 'receita', context, clinicId });
    const html = modelHtml || renderReceitaHtml({ patient, data, doc, clinic: clinicForReceita });
    const receitaDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.data || '').trim())
      ? new Date(`${String(data.data).trim()}T12:00:00`)
      : new Date();
    const emitidoEm = new Intl.DateTimeFormat('pt-BR').format(receitaDate);

    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'receita',
      payload: data,
      outputPath: pdfPath,
      contentHTML: html,
      headerOptions: { emitidoEm },
      footerOptions: { emitidoEm },
    });
  };

  const renderContratoHtml = ({ patient, data, doc }) => {
    const title = doc?.title || 'Contrato';
    const generatedAt = new Date().toLocaleString('pt-BR');
    const pacienteNome = data.pacienteNome || patient?.fullName || patient?.nome || '-';
    const conteudo = String(data.conteudoContrato || data.conteudo || '').trim();

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
    .bloco { margin-bottom: 12px; }
    .label { font-size: 12px; color: #475569; margin-bottom: 4px; }
    .value { white-space: pre-wrap; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Gerado em: ${escapeHtml(generatedAt)}</div>
  <div class="bloco">
    <div class="label">Paciente</div>
    <div class="value">${escapeHtml(formatFieldValue(pacienteNome))}</div>
  </div>
  <div class="bloco">
    <div class="label">Data</div>
    <div class="value">${escapeHtml(formatFieldValue(data.data || '-'))}</div>
  </div>
  <div class="bloco">
    <div class="label">Conteudo</div>
    <div class="value">${escapeHtml(formatFieldValue(conteudo || '-'))}</div>
  </div>
</body>
</html>`;
  };

  const renderOrcamentoHtml = ({ patient, data, doc }) => {
    const title = doc?.title || 'Orcamento';
    const generatedAt = new Date().toLocaleString('pt-BR');
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
    .bloco { margin-bottom: 12px; }
    .label { font-size: 12px; color: #475569; margin-bottom: 4px; }
    .value { white-space: pre-wrap; line-height: 1.45; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Gerado em: ${escapeHtml(generatedAt)}</div>
  <div class="bloco">
    <div class="label">Paciente</div>
    <div class="value">${escapeHtml(formatFieldValue(data.pacienteNome || patient?.fullName || patient?.nome || '-'))}</div>
  </div>
  <div class="bloco">
    <div class="label">Data</div>
    <div class="value">${escapeHtml(formatFieldValue(data.data || '-'))}</div>
  </div>
  <div class="bloco">
    <div class="label">Conteudo</div>
    <div class="value">${escapeHtml(formatFieldValue(data.conteudo || data.conteudoContrato || '-'))}</div>
  </div>
</body>
</html>`;
  };

  const generateContratoPdf = async ({ jsonPath, pdfPath, patient, doc }) => {
    const payload = await readJsonFile(jsonPath);
    const data = payload?.data || {};
    const clinicId = getCurrentClinicId();
    const clinic = await readClinicContext(clinicId);
    const context = {
      paciente: {
        nome: data.pacienteNome || patient?.fullName || patient?.nome || '',
        prontuario: data.prontuario || patient?.prontuario || '',
      },
      clinica: clinic,
      documento: data,
      metadata: {
        title: doc?.title || 'Contrato',
        generatedAt: new Date().toISOString(),
      },
    };
    const modelHtml = await renderDocumentModelOrNull({ type: 'contrato', context, clinicId });
    const html = modelHtml || renderContratoHtml({ patient, data, doc });
    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'contrato',
      payload: data,
      outputPath: pdfPath,
      contentHTML: html,
    });
  };

  const generateOrcamentoPdf = async ({ jsonPath, pdfPath, patient, doc }) => {
    const payload = await readJsonFile(jsonPath);
    const data = payload?.data || {};
    const clinicId = getCurrentClinicId();
    const clinic = await readClinicContext(clinicId);
    const context = {
      paciente: {
        nome: data.pacienteNome || patient?.fullName || patient?.nome || '',
        prontuario: data.prontuario || patient?.prontuario || '',
      },
      clinica: clinic,
      documento: data,
      metadata: {
        title: doc?.title || 'Orcamento',
        generatedAt: new Date().toISOString(),
      },
    };
    const modelHtml = await renderDocumentModelOrNull({ type: 'orcamento', context, clinicId });
    const html = modelHtml || renderOrcamentoHtml({ patient, data, doc });
    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'orcamento',
      payload: data,
      outputPath: pdfPath,
      contentHTML: html,
    });
  };

  const renderFinanceReportHtml = (report) => {
    const title = `Relatorio Financeiro - ${String(report.mes).padStart(2, '0')}/${report.ano}`;
    const now = new Date().toLocaleString('pt-BR');

    const renderRows = (list) => list.map((l) => `
      <tr>
        <td>${escapeHtml(l.data || '')}</td>
        <td>${escapeHtml(l.descricao || '')}</td>
        <td>${escapeHtml(l.categoria || '')}</td>
        <td>${escapeHtml(String(l.valor ?? 0))}</td>
        <td>${escapeHtml(l.status || '')}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
    .resumo { display: flex; gap: 16px; margin-bottom: 16px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; min-width: 160px; }
    .card span { display: block; font-size: 12px; color: #64748b; }
    .card strong { font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    th { background: #f1f5f9; }
    h2 { font-size: 15px; margin: 16px 0 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Gerado em: ${escapeHtml(now)}</div>
  <div class="resumo">
    <div class="card"><span>Entradas</span><strong>R$ ${report.totalEntradas.toFixed(2)}</strong></div>
    <div class="card"><span>Saidas</span><strong>R$ ${report.totalSaidas.toFixed(2)}</strong></div>
    <div class="card"><span>Saldo</span><strong>R$ ${report.saldo.toFixed(2)}</strong></div>
  </div>

  <h2>Entradas</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Descricao</th>
        <th>Categoria</th>
        <th>Valor</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${renderRows(report.entradas)}
    </tbody>
  </table>

  <h2>Saidas</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Descricao</th>
        <th>Categoria</th>
        <th>Valor</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${renderRows(report.saidas)}
    </tbody>
  </table>
</body>
</html>`;
  };

  const buildDossieHash = (consolidated) =>
    crypto.createHash('sha256').update(JSON.stringify(consolidated || {})).digest('hex');

  const renderDossieHtml = (consolidated) => {
    const identificacao = consolidated?.identificacao || {};
    const resumo = consolidated?.resumo || {};
    const timeline = Array.isArray(consolidated?.timeline) ? consolidated.timeline : [];
    const arquivos = Array.isArray(consolidated?.arquivos) ? consolidated.arquivos : [];
    const assinatura = consolidated?.assinatura || {};
    const hash = buildDossieHash(consolidated);

    const timelineRows = timeline.length
      ? timeline.map((item) => `
        <tr>
          <td>${escapeHtml(formatFieldValue(item.tipo))}</td>
          <td>${escapeHtml(formatFieldValue(item.titulo))}</td>
          <td>${escapeHtml(formatFieldValue(item.dataHora))}</td>
          <td>${escapeHtml(formatFieldValue(item.profissional))}</td>
          <td>${escapeHtml(formatFieldValue(item.resumo))}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">Nenhum evento clinico encontrado.</td></tr>';

    const arquivosRows = arquivos.length
      ? arquivos.map((item) => `
        <tr>
          <td>${escapeHtml(formatFieldValue(item.nome))}</td>
          <td>${escapeHtml(formatFieldValue(item.tipo))}</td>
          <td>${escapeHtml(formatFieldValue(item.dataUpload))}</td>
        </tr>`).join('')
      : '<tr><td colspan="3">Nenhum arquivo anexado.</td></tr>';

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Dossie Completo do Paciente</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; }
    .header {
      background: linear-gradient(120deg, #0f766e 0%, #1fa87a 100%);
      color: #fff;
      padding: 20px 26px;
    }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 6px 0 0; font-size: 12px; opacity: 0.95; }
    .container { padding: 18px 24px 26px; }
    .section { margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .section-title {
      margin: 0;
      padding: 10px 12px;
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
    }
    .section-body { padding: 12px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 14px;
      font-size: 12px;
    }
    .item strong { color: #334155; display: block; margin-bottom: 2px; }
    .item span { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 8px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; color: #334155; font-weight: 700; }
    .hash-box {
      padding: 8px 10px;
      background: #f8fafc;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      font-family: Consolas, 'Courier New', monospace;
      word-break: break-all;
      font-size: 11px;
      color: #1e293b;
    }
    .footer {
      margin-top: 16px;
      text-align: center;
      color: #64748b;
      font-size: 11px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Dossie Completo do Paciente</h1>
    <p>Documento consolidado clinico e documental</p>
  </div>
  <div class="container">
    <section class="section">
      <h2 class="section-title">Secao 1 - Identificacao do paciente</h2>
      <div class="section-body grid">
        <div class="item"><strong>Nome completo</strong><span>${escapeHtml(formatFieldValue(identificacao.nomeCompleto))}</span></div>
        <div class="item"><strong>CPF</strong><span>${escapeHtml(formatFieldValue(identificacao.cpf))}</span></div>
        <div class="item"><strong>Telefone</strong><span>${escapeHtml(formatFieldValue(identificacao.telefone))}</span></div>
        <div class="item"><strong>Numero do prontuario</strong><span>${escapeHtml(formatFieldValue(identificacao.prontuario))}</span></div>
        <div class="item"><strong>Data de geracao</strong><span>${escapeHtml(formatFieldValue(identificacao.dataGeracao))}</span></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Secao 2 - Resumo clinico</h2>
      <div class="section-body grid">
        <div class="item"><strong>Status de anamnese</strong><span>${escapeHtml(formatFieldValue(resumo.statusAnamnese))}</span></div>
        <div class="item"><strong>Ultimo atendimento</strong><span>${escapeHtml(formatFieldValue(resumo.ultimoAtendimento))}</span></div>
        <div class="item"><strong>Total de documentos</strong><span>${escapeHtml(formatFieldValue(resumo.totalDocumentos))}</span></div>
        <div class="item"><strong>Total de receitas</strong><span>${escapeHtml(formatFieldValue(resumo.totalReceitas))}</span></div>
        <div class="item"><strong>Total de atestados</strong><span>${escapeHtml(formatFieldValue(resumo.totalAtestados))}</span></div>
        <div class="item"><strong>Total de arquivos anexados</strong><span>${escapeHtml(formatFieldValue(resumo.totalArquivosAnexados))}</span></div>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Secao 3 - Linha do tempo clinica</h2>
      <div class="section-body">
        <table>
          <thead>
            <tr><th>Tipo</th><th>Titulo</th><th>Data e hora</th><th>Profissional</th><th>Resumo</th></tr>
          </thead>
          <tbody>${timelineRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Secao 4 - Lista de arquivos anexados</h2>
      <div class="section-body">
        <table>
          <thead>
            <tr><th>Nome do arquivo</th><th>Tipo</th><th>Data de upload</th></tr>
          </thead>
          <tbody>${arquivosRows}</tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Secao 5 - Assinatura tecnica</h2>
      <div class="section-body grid">
        <div class="item"><strong>Profissional logado</strong><span>${escapeHtml(formatFieldValue(assinatura.profissionalNome))}</span></div>
        <div class="item"><strong>Data/hora de emissao</strong><span>${escapeHtml(formatFieldValue(assinatura.dataHoraEmissao))}</span></div>
        <div class="item"><strong>Versao do sistema</strong><span>${escapeHtml(formatFieldValue(assinatura.versaoSistema))}</span></div>
      </div>
      <div class="section-body">
        <strong>Hash SHA256 do JSON consolidado</strong>
        <div class="hash-box">${escapeHtml(hash)}</div>
      </div>
    </section>

    <div class="footer">Voithos - Sistema Odontologico Inteligente</div>
  </div>
</body>
</html>`;
  };

  const generateDossiePdf = async ({ pdfPath, consolidated }) => {
    const html = renderDossieHtml(consolidated || {});
    const hash = buildDossieHash(consolidated || {});
    const clinicId = getCurrentClinicId();
    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'dossie',
      payload: consolidated || {},
      outputPath: pdfPath,
      contentHTML: html,
    });

    return { pdfPath, hash };
  };

  const generateFinanceReportPdf = async (month, year) => {
    await ensureDir(financeReportsPath);
    let report = null;
    try {
      if (typeof getFinancialReport === 'function') {
        report = await getFinancialReport(month, year);
        if (report) {
          console.info('[FINANCEIRO]', JSON.stringify({
            action: 'financial_report_generated',
            clinicId: getCurrentClinicId(),
            period: `${year}-${String(month).padStart(2, '0')}`,
            report_source: 'central',
            financial_source: 'central',
          }));
        }
      }
    } catch (error) {
      if (!shouldFallbackToLocal(error)) throw error;
      console.warn('[FINANCEIRO]', JSON.stringify({
        action: 'financial-report-pdf',
        module: 'pdf',
        operation: 'financial-report-pdf',
        clinicId: getCurrentClinicId(),
        period: `${year}-${String(month).padStart(2, '0')}`,
        report_fallback_to_local: true,
        fallback_triggered: true,
        fallback_reason: error?.message || String(error || ''),
        reason: error?.message || String(error || ''),
      }));
    }

    if (!report) {
      const list = await readFinance();
      report = buildFinanceMonthlyReport(list, month, year);
    }
    const html = renderFinanceReportHtml(report);
    const filename = `relatorio-${year}-${String(month).padStart(2, '0')}.pdf`;
    const pdfPath = path.join(financeReportsPath, filename);

    const clinicId = getCurrentClinicId();
    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'financeiro',
      payload: report,
      outputPath: pdfPath,
      contentHTML: html,
    });

    return { pdfPath, report };
  };

  const generateTestPdf = async ({ outputPath, payload = {}, clinicId = 'default' } = {}) => {
    const contentHTML = `
      <section style="padding: 8px 0;">
        <h1 style="font-size: 20px; margin: 0 0 8px;">PDF de teste</h1>
        <p style="margin: 0 0 10px; color: #475569;">Pipeline unico do Voithos.</p>
        <pre style="white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">${escapeHtml(JSON.stringify(payload || {}, null, 2))}</pre>
      </section>
    `;
    await pdfRenderer.renderPdf({
      clinicId,
      docType: 'teste',
      payload,
      outputPath,
      contentHTML,
    });
    return { pdfPath: outputPath };
  };

  return {
    generateAnamnesePdf,
    generateAtestadoPdf,
    generateReceitaPdf,
    generateContratoPdf,
    generateOrcamentoPdf,
    generateFinanceReportPdf,
    generateDossiePdf,
    generateTestPdf,
    buildHeaderHTML: pdfRenderer.buildHeaderHTML,
    buildFooterHTML: pdfRenderer.buildFooterHTML,
    wrapHTML: pdfRenderer.wrapHTML,
    renderPdf: pdfRenderer.renderPdf,
  };
};

module.exports = { createPdfService };
