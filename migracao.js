(function () {
  'use strict';

  const STAGES = [
    { id: 'patients', fileId: 'patients-file' },
    { id: 'agenda', fileId: 'agenda-file' },
    { id: 'clinical', fileId: 'clinical-file' },
    { id: 'cashflow', fileId: 'cashflow-file' },
    { id: 'procedures', fileId: 'procedures-file' },
  ];

  const VALID_SOURCES = new Set(['capim', 'clinicorp', 'odontolis', 'dentaloffice', 'outro']);

  const PATIENT_ALIASES = {
    capim: { name: ['nome', 'nomepaciente', 'paciente', 'fullname'], document: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj', 'rg'], birthDate: ['nascimento', 'datanascimento', 'birthdate', 'data_nascimento'], phone: ['telefone', 'celular', 'phone', 'fone', 'contato', 'whatsapp'], email: ['email', 'e-mail', 'mail'], address: ['endereco', 'endereço', 'logradouro'] },
    clinicorp: { name: ['nome', 'paciente', 'nomecompleto', 'fullname'], document: ['cpf', 'cpfcnpj', 'documento', 'documentoidentificacao', 'rg'], birthDate: ['nascimento', 'datanascimento', 'data_nascimento', 'birthdate'], phone: ['telefone', 'celular', 'fone', 'contato', 'whatsapp'], email: ['email', 'e-mail', 'mail'], address: ['endereco', 'endereço', 'logradouro'] },
    odontolis: { name: ['nome', 'paciente', 'nomepaciente', 'nomedopaciente'], document: ['cpf', 'documento', 'numero_documento', 'rg'], birthDate: ['nascimento', 'datanascimento', 'data_nasc'], phone: ['telefone', 'celular', 'fone'], email: ['email', 'e-mail'], address: ['endereco', 'endereço'] },
    dentaloffice: { name: ['nome', 'patient', 'fullname', 'nomepaciente'], document: ['cpf', 'document', 'id_document', 'rg'], birthDate: ['birthdate', 'nascimento', 'dob'], phone: ['phone', 'telefone', 'mobile', 'celular'], email: ['email', 'e-mail'], address: ['address', 'endereco', 'endereço'] },
    outro: { name: ['nome', 'paciente', 'name', 'fullname'], document: ['cpf', 'documento', 'document', 'id', 'rg'], birthDate: ['nascimento', 'birthdate', 'data_nascimento', 'dob'], phone: ['telefone', 'phone', 'celular', 'contato'], email: ['email', 'mail'], address: ['endereco', 'endereço', 'address'] },
  };

  const APPOINTMENT_ALIASES = {
    capim: { patientName: ['paciente', 'nomepaciente', 'nome', 'patientname', 'fullname'], patientDocument: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj'], professionalName: ['profissional', 'dentista', 'profissionalnome', 'doctor', 'doctorname'], startDateTime: ['datahora', 'inicio', 'inicioagendamento', 'data_agenda', 'datetime', 'start', 'scheduledat'], endDateTime: ['horafim', 'fim', 'termino', 'end', 'endtime'], type: ['tipo', 'categoria', 'atendimento'], notes: ['observacoes', 'observação', 'observacao', 'obs', 'notes'] },
    clinicorp: { patientName: ['paciente', 'nome', 'nomecompleto', 'fullname'], patientDocument: ['cpf', 'documento', 'cpfcnpj', 'rg'], professionalName: ['profissional', 'responsavel', 'dentista'], startDateTime: ['datahora', 'agendamento', 'data_agenda', 'inicio'], endDateTime: ['horafim', 'fim', 'termino'], type: ['tipo', 'categoria'], notes: ['observacoes', 'obs', 'notes'] },
    odontolis: { patientName: ['paciente', 'nome', 'nomepaciente'], patientDocument: ['cpf', 'documento', 'rg'], professionalName: ['profissional', 'dentista'], startDateTime: ['datahora', 'agendamento', 'inicio'], endDateTime: ['horafim', 'fim'], type: ['tipo', 'categoria'], notes: ['observacoes', 'obs'] },
    dentaloffice: { patientName: ['patient', 'paciente', 'name', 'fullname'], patientDocument: ['cpf', 'document', 'id_document'], professionalName: ['professional', 'dentist', 'doctor'], startDateTime: ['start', 'startdatetime', 'datahora', 'scheduledat'], endDateTime: ['end', 'enddatetime', 'horafim'], type: ['type', 'tipo'], notes: ['notes', 'observations', 'observacoes'] },
    outro: { patientName: ['paciente', 'nome', 'name', 'fullname'], patientDocument: ['cpf', 'documento', 'document', 'id', 'rg'], professionalName: ['profissional', 'dentista', 'doctor'], startDateTime: ['datahora', 'inicio', 'start', 'scheduledat'], endDateTime: ['horafim', 'end', 'termino'], type: ['tipo', 'type'], notes: ['observacoes', 'notes', 'obs'] },
  };

  const CLINICAL_ALIASES = {
    capim: { patientName: ['paciente', 'nomepaciente', 'nome', 'patientname', 'fullname'], patientDocument: ['cpf', 'documento', 'documentopaciente', 'cnpjcpf', 'cpfcnpj', 'rg'], procedureName: ['procedimento', 'nomeprocedimento', 'procedure', 'service', 'servico', 'tipo'], procedureCode: ['codigo', 'code', 'código'], status: ['status', 'situacao', 'estado'], dentistName: ['dentista', 'profissional', 'dentistanome'], tooth: ['dente', 'tooth'], faces: ['faces', 'face'], observations: ['observacoes', 'observação', 'observacao', 'obs'], performedAt: ['datarealizacao', 'realizadoem', 'data', 'date', 'performedat'], registeredAt: ['datacadastro', 'createdat', 'registradoem', 'registro', 'registeredat'], amount: ['valor', 'price', 'preco', 'cobrado', 'amount'] },
    clinicorp: { patientName: ['paciente', 'nome', 'nomecompleto'], patientDocument: ['cpf', 'documento', 'cpfcnpj', 'rg'], procedureName: ['procedimento', 'nome', 'servico', 'service'], procedureCode: ['codigo', 'code'], status: ['status', 'situacao'], dentistName: ['dentista', 'profissional'], tooth: ['dente', 'tooth'], faces: ['faces'], observations: ['observacoes', 'obs'], performedAt: ['datarealizacao', 'data', 'performedat'], registeredAt: ['datacadastro', 'registeredat'], amount: ['valor', 'price', 'preco'] },
    odontolis: { patientName: ['paciente', 'nome', 'nomepaciente'], patientDocument: ['cpf', 'documento', 'rg'], procedureName: ['procedimento', 'nomeprocedimento', 'procedure'], procedureCode: ['codigo', 'code'], status: ['status', 'situacao'], dentistName: ['dentista', 'profissional'], tooth: ['dente', 'tooth'], faces: ['faces'], observations: ['observacoes', 'obs'], performedAt: ['data', 'realizadoem', 'performedat'], registeredAt: ['registradoem', 'registeredat'], amount: ['valor', 'amount'] },
    dentaloffice: { patientName: ['patient', 'paciente', 'name', 'fullname'], patientDocument: ['cpf', 'document', 'id_document'], procedureName: ['procedure', 'service', 'procedimento'], procedureCode: ['code', 'codigo'], status: ['status'], dentistName: ['dentist', 'doctor', 'professional'], tooth: ['tooth', 'dente'], faces: ['faces'], observations: ['notes', 'observations', 'obs'], performedAt: ['performedat', 'date', 'data'], registeredAt: ['registeredat', 'createdat'], amount: ['amount', 'price', 'valor'] },
    outro: { patientName: ['paciente', 'nome', 'name', 'fullname'], patientDocument: ['cpf', 'documento', 'document', 'id', 'rg'], procedureName: ['procedimento', 'procedure', 'service', 'nome'], procedureCode: ['codigo', 'code'], status: ['status', 'situacao', 'estado'], dentistName: ['dentista', 'profissional', 'doctor'], tooth: ['dente', 'tooth'], faces: ['faces', 'face'], observations: ['observacoes', 'notes', 'obs'], performedAt: ['datarealizacao', 'date', 'performedat'], registeredAt: ['registradoem', 'registeredat', 'createdat'], amount: ['valor', 'amount', 'price'] },
  };

  const state = { source: 'capim', stageFiles: {}, stageRows: {}, stageSummaries: {}, completedStages: {} };
  const elements = { cards: new Map(), inputs: new Map(), actions: new Map(), statuses: new Map(), previews: new Map(), indicators: new Map() };
  let scopeKey = 'default';

  const getAuthClinicId = async () => {
    const authApi = window.appApi?.auth || window.auth || {};
    if (authApi.currentUser) {
      try {
        const user = await authApi.currentUser();
        const clinicId = String(user?.clinicId || '').trim();
        if (clinicId) return clinicId;
      } catch (error) {
        void error;
      }
    }
    const bodyClinicId = document.body && document.body.dataset ? document.body.dataset.clinicId : '';
    if (bodyClinicId) return String(bodyClinicId);
    const fallback = window.currentClinicId || window.selectedClinicId || window.activeClinicId;
    if (fallback) return String(fallback);
    try {
      const stored = localStorage.getItem('voithos:clinic:id');
      if (stored) return stored;
    } catch (error) {
      void error;
    }
    return 'default';
  };

  const getStorageKey = () => `voithos:migration:${scopeKey}`;
  const getPatientsBase = () => '/clinics/me/data-import/patients';
  const getAgendaBase = () => '/clinics/me/data-import/agenda';
  const getClinicalBase = () => '/clinics/me/data-import/clinical';
  const getCashflowBase = () => '/clinics/me/data-import/cashflow';
  const getProceduresBase = () => '/clinics/me/data-import/procedures';
  const BINARY_IMPORT_EXTENSIONS = new Set(['xlsx', 'xls', 'zip', 'rar']);

  async function postJson(url, payload) {
    const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (error) { body = null; }
    if (!response.ok) throw new Error((body && body.error && body.error.message) || (body && body.message) || `Falha na requisição (${response.status}).`);
    return body;
  }
  async function postMultipart(url, file, extra = {}) {
    const formData = new FormData();
    formData.append('file', file, file.name);
    Object.entries(extra || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      formData.append(key, String(value));
    });
    const response = await fetch(url, { method: 'POST', credentials: 'include', body: formData });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (error) { body = null; }
    if (!response.ok) throw new Error((body && body.error && body.error.message) || (body && body.message) || `Falha na requisição (${response.status}).`);
    return body;
  }

  function normalizeKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function getFileExtension(file) { const parts = String(file?.name || '').split('.'); return String(parts.length > 1 ? parts.pop() : '').toLowerCase(); }
  function getStageBase(stageId) {
    if (stageId === 'patients') return getPatientsBase();
    if (stageId === 'agenda') return getAgendaBase();
    if (stageId === 'clinical') return getClinicalBase();
    if (stageId === 'cashflow') return getCashflowBase();
    if (stageId === 'procedures') return getProceduresBase();
    return '';
  }
  function getStageRequestKey(stageId) {
    if (stageId === 'patients') return 'patients';
    if (stageId === 'agenda') return 'appointments';
    if (stageId === 'clinical') return 'clinicalRecords';
    if (stageId === 'cashflow') return 'cashflow';
    if (stageId === 'procedures') return 'procedures';
    return 'rows';
  }
  function isBinaryImportFile(file) { return BINARY_IMPORT_EXTENSIONS.has(getFileExtension(file)); }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
      reader.readAsDataURL(file);
    });
  }
  function detectSeparator(text) { const line = text.split(/\r?\n/, 1)[0] || ''; let best = ','; let bestCount = -1; [',', ';', '\t', '|'].forEach((sep) => { const c = line.split(sep).length - 1; if (c > bestCount) { best = sep; bestCount = c; } }); return best; }
  function splitCsvLine(line, sep) { const out = []; let cur = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const ch = line[i]; const next = line[i + 1]; if (ch === '"' && quoted && next === '"') { cur += '"'; i += 1; continue; } if (ch === '"') { quoted = !quoted; continue; } if (ch === sep && !quoted) { out.push(cur.trim()); cur = ''; continue; } cur += ch; } out.push(cur.trim()); return out; }
  function parseDelimitedText(text) { const clean = String(text || '').replace(/^\uFEFF/, '').trim(); if (!clean) return { rows: [], headers: [] }; const sep = detectSeparator(clean); const lines = clean.split(/\r?\n/).filter(Boolean); const headers = splitCsvLine(lines.shift() || '', sep).map((v) => v.trim()); const rows = lines.map((line) => { const cells = splitCsvLine(line, sep); const record = {}; headers.forEach((header, idx) => { record[header || `col_${idx}`] = cells[idx] || ''; }); return record; }); return { rows, headers }; }
  function parseJsonContent(raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return { rows: parsed, headers: parsed[0] ? Object.keys(parsed[0]) : [] }; if (parsed && typeof parsed === 'object') { const source = parsed.rows || parsed.items || parsed.patients || parsed.records || parsed.data || []; if (Array.isArray(source)) return { rows: source, headers: source[0] ? Object.keys(source[0]) : [] }; return { rows: [parsed], headers: Object.keys(parsed) }; } return { rows: [], headers: [] }; }
  function firstNonEmptyValue(record, aliases) { const set = new Set((Array.isArray(aliases) ? aliases : []).map(normalizeKey)); for (const [key, value] of Object.entries(record || {})) { if (!set.has(normalizeKey(key))) continue; const normalized = String(value || '').trim(); if (normalized) return normalized; } return ''; }
  function normalizePatientDate(value) { const raw = String(value || '').trim(); if (!raw) return null; const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) { const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))); return Number.isNaN(d.getTime()) ? null : d; } const dmy = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/); if (dmy) { const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))); return Number.isNaN(d.getTime()) ? null : d; } const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d; }
  function normalizeAppointmentDate(value) { const raw = String(value || '').trim(); if (!raw) return null; const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/); if (iso) { const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0), Number(iso[6] || 0))); return Number.isNaN(d.getTime()) ? null : d; } const dmy = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/); if (dmy) { const d = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] || 0), Number(dmy[5] || 0), Number(dmy[6] || 0))); return Number.isNaN(d.getTime()) ? null : d; } const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d; }
  function normalizeFaces(value) { if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean); const raw = String(value || '').trim(); return raw ? raw.split(/[,;|]/).map((item) => item.trim()).filter(Boolean) : []; }

  function getPatientAliases() { return PATIENT_ALIASES[state.source] || PATIENT_ALIASES.outro; }
  function getAppointmentAliases() { return APPOINTMENT_ALIASES[state.source] || APPOINTMENT_ALIASES.outro; }
  function getClinicalAliases() { return CLINICAL_ALIASES[state.source] || CLINICAL_ALIASES.outro; }

  function normalizePatientRow(row = {}) { const a = getPatientAliases(); return { nome: firstNonEmptyValue(row, a.name), cpf: String(firstNonEmptyValue(row, a.document)).replace(/\D/g, ''), rg: firstNonEmptyValue(row, ['rg']), dataNascimento: normalizePatientDate(firstNonEmptyValue(row, a.birthDate)), telefone: firstNonEmptyValue(row, a.phone), email: String(firstNonEmptyValue(row, a.email)).trim().toLowerCase(), endereco: firstNonEmptyValue(row, a.address) }; }
  function normalizeAppointmentRow(row = {}) { const a = getAppointmentAliases(); return { patientName: firstNonEmptyValue(row, a.patientName), patientDocument: String(firstNonEmptyValue(row, a.patientDocument)).replace(/\D/g, ''), professionalName: firstNonEmptyValue(row, a.professionalName), startDateTime: normalizeAppointmentDate(firstNonEmptyValue(row, a.startDateTime)), endDateTime: normalizeAppointmentDate(firstNonEmptyValue(row, a.endDateTime)), type: firstNonEmptyValue(row, a.type), notes: firstNonEmptyValue(row, a.notes) }; }
  function normalizeClinicalRow(row = {}) { const a = getClinicalAliases(); const amountRaw = String(firstNonEmptyValue(row, a.amount) || '').replace(',', '.'); const amount = Number(amountRaw); return { patientName: firstNonEmptyValue(row, a.patientName), patientDocument: String(firstNonEmptyValue(row, a.patientDocument)).replace(/\D/g, ''), procedureName: firstNonEmptyValue(row, a.procedureName), procedureCode: firstNonEmptyValue(row, a.procedureCode), status: String(firstNonEmptyValue(row, a.status) || 'a-realizar').trim(), dentistName: firstNonEmptyValue(row, a.dentistName), tooth: firstNonEmptyValue(row, a.tooth), faces: normalizeFaces(firstNonEmptyValue(row, a.faces)), observations: firstNonEmptyValue(row, a.observations), performedAt: normalizeAppointmentDate(firstNonEmptyValue(row, a.performedAt)), registeredAt: normalizeAppointmentDate(firstNonEmptyValue(row, a.registeredAt)), amount: Number.isFinite(amount) ? amount : 0 }; }

  function summarizeRows(rows, headers) { return { count: Array.isArray(rows) ? rows.length : 0, headers: Array.isArray(headers) ? headers.filter(Boolean) : [], headerPreview: Array.isArray(headers) ? headers.filter(Boolean).slice(0, 6) : [] }; }
  function buildPreviewText(file, summary, mode) { const parts = [`Arquivo: ${file.name}`, `Tipo: ${getFileExtension(file).toUpperCase() || 'DESCONHECIDO'}`]; if (mode === 'supported') { parts.push(`Linhas detectadas: ${summary.count}`); if (summary.headerPreview.length) parts.push(`Colunas: ${summary.headerPreview.join(', ')}`); } else { parts.push('Formato recebido para a etapa.'); parts.push('Parser dedicado será encaixado sem alterar o fluxo da clínica.'); } return parts.join(' '); }
  function buildPatientPreview(rows) { const normalized = rows.map(normalizePatientRow).filter((row) => row.nome || row.cpf || row.email); const validRows = normalized.filter((row) => row.nome && (row.cpf || row.email)); const missingRequired = []; normalized.forEach((row) => { if (!row.nome) missingRequired.push('nome'); if (!row.cpf && !row.email) missingRequired.push('documento/email'); }); return { normalizedRows: normalized.length, validRows: validRows.length, missingRequired: Array.from(new Set(missingRequired)) }; }
  function buildAppointmentPreview(rows, patients) { const normalized = rows.map(normalizeAppointmentRow).filter((row) => row.patientName || row.patientDocument || row.startDateTime); const byCpf = new Map(); const byName = new Map(); patients.forEach((patient) => { const cpf = String(patient.cpf || '').replace(/\D/g, ''); const name = normalizeKey(patient.nome); if (cpf) byCpf.set(cpf, patient); if (name) byName.set(name, patient); }); let matchedRows = 0; let missingPatients = 0; let invalidDates = 0; normalized.forEach((row) => { const patient = (row.patientDocument && byCpf.get(row.patientDocument)) || (row.patientName && byName.get(normalizeKey(row.patientName))); if (patient) matchedRows += 1; else missingPatients += 1; if (!row.startDateTime) invalidDates += 1; }); return { normalizedRows: normalized.length, matchedRows, missingPatients, invalidDates }; }
  function buildClinicalPreview(rows, patients) { const normalized = rows.map(normalizeClinicalRow).filter((row) => row.patientName || row.patientDocument || row.procedureName); const byCpf = new Map(); const byName = new Map(); patients.forEach((patient) => { const cpf = String(patient.cpf || '').replace(/\D/g, ''); const name = normalizeKey(patient.nome); if (cpf) byCpf.set(cpf, patient); if (name) byName.set(name, patient); }); let matchedRows = 0; let missingPatients = 0; let missingProcedure = 0; normalized.forEach((row) => { const patient = (row.patientDocument && byCpf.get(row.patientDocument)) || (row.patientName && byName.get(normalizeKey(row.patientName))); if (patient) matchedRows += 1; else missingPatients += 1; if (!row.procedureName && !row.procedureCode) missingProcedure += 1; }); return { normalizedRows: normalized.length, matchedRows, missingPatients, missingProcedure }; }
  function buildCashflowPreview(rows) {
    const normalized = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
    let revenueRows = 0;
    let expenseRows = 0;
    let invalidRows = 0;
    normalized.forEach((row) => {
      const kind = String(row.tipo || row.type || row.natureza || row.movimento || '').trim().toLowerCase();
      const amountRaw = String(row.valor || row.amount || row.total || row.price || '').replace(',', '.').trim();
      const amount = Number(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) {
        invalidRows += 1;
        return;
      }
      if (['despesa', 'expense', 'saida', 'saída', 'debit'].includes(kind)) expenseRows += 1;
      else revenueRows += 1;
    });
    return { normalizedRows: normalized.length, revenueRows, expenseRows, invalidRows };
  }
  function buildProceduresPreview(rows) {
    const normalized = Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
    const seen = new Set();
    let validRows = 0;
    let duplicatesInFile = 0;
    let missingName = 0;
    let missingCode = 0;
    let missingPrice = 0;
    normalized.forEach((row) => {
      const name = String(row.nome || row.name || row.procedimento || row.procedure || row.service || row.descricao || row.tipo || '').trim();
      const code = String(row.codigo || row.code || row.id || row.servicoid || '').trim();
      const priceRaw = String(row.preco || row.valor || row.price || row.amount || row.custo || '').replace(',', '.').trim();
      const key = normalizeKey(code || name);
      if (!name) missingName += 1;
      if (!code) missingCode += 1;
      if (!Number.isFinite(Number(priceRaw)) || Number(priceRaw) < 0) missingPrice += 1;
      if (!name || !key) return;
      if (seen.has(key)) {
        duplicatesInFile += 1;
        return;
      }
      seen.add(key);
      validRows += 1;
    });
    return { normalizedRows: normalized.length, validRows, duplicatesInFile, missingName, missingCode, missingPrice };
  }

  function loadState() { try { const raw = localStorage.getItem(getStorageKey()); if (!raw) return; const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') { if (typeof parsed.source === 'string' && VALID_SOURCES.has(parsed.source)) state.source = parsed.source; state.stageSummaries = parsed.stageSummaries && typeof parsed.stageSummaries === 'object' ? parsed.stageSummaries : {}; state.completedStages = parsed.completedStages && typeof parsed.completedStages === 'object' ? parsed.completedStages : {}; } } catch (error) { void error; } }
  function persistState() { try { localStorage.setItem(getStorageKey(), JSON.stringify({ source: state.source, stageSummaries: state.stageSummaries, completedStages: state.completedStages })); } catch (error) { void error; } }
  function setStageStatus(stageId, text, muted) { const status = elements.statuses.get(stageId); if (!status) return; status.textContent = text; status.classList.toggle('is-muted', Boolean(muted)); }
  function renderSummary(stageId) { const preview = elements.previews.get(stageId); if (!preview) return; const summary = state.stageSummaries[stageId]; if (!summary) { preview.textContent = ''; return; } const statusLabel = summary.mode === 'error' ? 'Arquivo inválido' : state.completedStages[stageId] ? (summary.mode === 'supported' ? 'Concluída' : 'Recebida') : (summary.mode === 'supported' ? 'Pronta para validar' : 'Recebida, aguardando parser'); preview.textContent = `Origem: ${state.source}. ${statusLabel}. ${summary.text}`; }
  function setStageEnabled(stageId, enabled) { const card = elements.cards.get(stageId); const input = elements.inputs.get(stageId); const action = elements.actions.get(stageId); const dropzone = card ? card.querySelector('[data-stage-dropzone]') : null; if (card) { card.classList.toggle('is-disabled', !enabled); card.classList.toggle('is-active', enabled); } if (input) input.disabled = !enabled; if (action) action.disabled = !enabled && stageId !== 'patients'; if (dropzone) dropzone.classList.toggle('is-disabled', !enabled); }
  function updateProgress() { STAGES.forEach((stage, index) => { const indicator = elements.indicators.get(stage.id); if (!indicator) return; const completed = Boolean(state.completedStages[stage.id]); const unlocked = index === 0 || Boolean(state.completedStages[STAGES[index - 1].id]); indicator.classList.toggle('is-active', completed || unlocked); }); }
  function unlockStages() { STAGES.forEach((stage, index) => { const enabled = index === 0 || Boolean(state.completedStages[STAGES[index - 1].id]); const summary = state.stageSummaries[stage.id]; setStageEnabled(stage.id, enabled); if (summary && summary.mode === 'error') setStageStatus(stage.id, 'Arquivo inválido', true); else if (enabled && !state.completedStages[stage.id]) setStageStatus(stage.id, state.stageFiles[stage.id] ? 'Pronta para validar' : 'Aguardando envio', false); else if (state.completedStages[stage.id]) setStageStatus(stage.id, summary && summary.mode === 'supported' ? 'Concluída' : 'Recebida', false); else setStageStatus(stage.id, 'Bloqueada', true); renderSummary(stage.id); }); updateProgress(); }

  async function parseStageFile(file) {
    const extension = getFileExtension(file);
    const text = await file.text();
    if (extension === 'json') { const json = parseJsonContent(text); const summary = summarizeRows(json.rows, json.headers); if (!summary.count && !summary.headers.length) throw new Error('JSON vazio ou sem estrutura reconhecível.'); return { mode: 'supported', rows: json.rows, summary }; }
    if (extension === 'csv') { const csv = parseDelimitedText(text); const summary = summarizeRows(csv.rows, csv.headers); if (!summary.count && !summary.headers.length) throw new Error('CSV vazio ou sem colunas detectáveis.'); return { mode: 'supported', rows: csv.rows, summary }; }
    if (['xlsx', 'xls', 'zip', 'rar'].includes(extension)) return { mode: 'queued', rows: [], summary: { count: 0, headers: [], headerPreview: [] } };
    throw new Error('Formato não suportado.');
  }

  async function handlePatientsFile(stageId, rows, file) {
    const response = await postMultipart(getPatientsBase() + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const preview = buildPatientPreview(rows);
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = 'patients';
    summary.backend = { importedCount: Number(data.validRows || 0), duplicateRows: Number(data.duplicateRows || 0) };
    summary.normalizedCount = preview.normalizedRows;
    summary.missingRequired = preview.missingRequired;
    summary.text = `${buildPreviewText(file, summary.summary || summary, 'supported')} Importáveis: ${summary.backend.importedCount}. Duplicados: ${summary.backend.duplicateRows}.`;
    state.stageSummaries[stageId] = summary;
  }

  async function handleAgendaFile(stageId, rows, file) {
    const response = await postMultipart(getAgendaBase() + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const preview = buildAppointmentPreview(rows, state.stageRows.patients || []);
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = 'agenda';
    summary.backend = { matchedRows: Number(data.matchedRows || 0), missingPatients: Number(data.missingPatients || 0), invalidDates: Number(data.invalidDates || 0) };
    summary.text = `${buildPreviewText(file, summary.summary || summary, 'supported')} Vinculados: ${summary.backend.matchedRows}. Sem paciente: ${summary.backend.missingPatients}. Datas inválidas: ${summary.backend.invalidDates}.`;
    summary.localPreview = preview;
    state.stageSummaries[stageId] = summary;
  }

  async function handleClinicalFile(stageId, rows, file) {
    const response = await postMultipart(getClinicalBase() + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const preview = buildClinicalPreview(rows, state.stageRows.patients || []);
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = 'clinical';
    summary.backend = { matchedRows: Number(data.matchedRows || 0), missingPatients: Number(data.missingPatients || 0), withoutProcedure: Number(data.withoutProcedure || 0) };
    summary.text = `${buildPreviewText(file, summary.summary || summary, 'supported')} Vinculados: ${summary.backend.matchedRows}. Sem paciente: ${summary.backend.missingPatients}. Sem procedimento: ${summary.backend.withoutProcedure}.`;
    summary.localPreview = preview;
    state.stageSummaries[stageId] = summary;
  }

  async function handleBinaryStageFile(stageId, file) {
    const base = getStageBase(stageId);
    if (!base) return;
    const response = await postMultipart(base + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = stageId;
    summary.mode = 'supported';
    summary.summary = {
      count: Number(data.totalRows || data.normalizedRows || 0),
      headerPreview: Array.isArray(data.headers) ? data.headers.slice(0, 6) : [],
    };
    summary.backend = data;
    summary.text = `${buildPreviewText(file, {
      count: Number(data.totalRows || data.normalizedRows || 0),
      headerPreview: Array.isArray(data.headers) ? data.headers.slice(0, 6) : [],
    }, 'supported')} Importação binária recebida. Itens válidos: ${Number(data.normalizedRows || data.totalRows || 0)}.`;
    summary.localPreview = {
      binary: true,
      fileType: getFileExtension(file),
      totalRows: Number(data.totalRows || 0),
      normalizedRows: Number(data.normalizedRows || 0),
    };
    state.stageSummaries[stageId] = summary;
  }

  async function handleCashflowFile(stageId, rows, file) {
    const response = await postMultipart(getCashflowBase() + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const preview = buildCashflowPreview(rows);
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = 'cashflow';
    summary.backend = {
      totalRows: Number(data.totalRows || preview.normalizedRows || 0),
      normalizedRows: Number(data.normalizedRows || preview.normalizedRows || 0),
      revenueRows: Number(data.revenueRows || preview.revenueRows || 0),
      expenseRows: Number(data.expenseRows || preview.expenseRows || 0),
      invalidRows: Number(data.invalidRows || preview.invalidRows || 0),
    };
    summary.text = `${buildPreviewText(file, summary.summary || summary, 'supported')} Lançamentos: ${summary.backend.normalizedRows}. Receitas: ${summary.backend.revenueRows}. Despesas: ${summary.backend.expenseRows}. Inválidos: ${summary.backend.invalidRows}.`;
    summary.localPreview = preview;
    state.stageSummaries[stageId] = summary;
  }

  async function handleProceduresFile(stageId, rows, file) {
    const response = await postMultipart(getProceduresBase() + '/preview', file, { source: state.source });
    const data = response && response.data ? response.data : {};
    const preview = buildProceduresPreview(rows);
    const summary = state.stageSummaries[stageId] || {};
    summary.kind = 'procedures';
    summary.backend = {
      totalRows: Number(data.totalRows || preview.normalizedRows || 0),
      normalizedRows: Number(data.normalizedRows || preview.normalizedRows || 0),
      currentItems: Number(data.currentItems || 0),
      newItems: Number(data.newItems || 0),
      updatedItems: Number(data.updatedItems || 0),
      duplicatesInFile: Number(data.duplicatesInFile || preview.duplicatesInFile || 0),
      invalidRows: Number(data.invalidRows || 0),
    };
    summary.text = `${buildPreviewText(file, summary.summary || summary, 'supported')} Itens atuais: ${summary.backend.currentItems}. Novos: ${summary.backend.newItems}. Atualizados: ${summary.backend.updatedItems}. Duplicados: ${summary.backend.duplicatesInFile}.`;
    summary.localPreview = preview;
    state.stageSummaries[stageId] = summary;
  }

  async function handleStageFile(stageId) {
    const input = elements.inputs.get(stageId);
    if (!input || !input.files || !input.files[0]) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    const file = input.files[0];
    state.stageFiles[stageId] = file;
    state.completedStages[stageId] = false;
    try {
      const parsed = await parseStageFile(file);
      state.stageRows[stageId] = parsed.rows || [];
      state.stageSummaries[stageId] = { mode: parsed.mode, summary: parsed.summary, text: buildPreviewText(file, parsed.summary, parsed.mode), rows: parsed.rows || [] };
      if (parsed.mode === 'queued' && isBinaryImportFile(file)) await handleBinaryStageFile(stageId, file);
      else if (stageId === 'patients') await handlePatientsFile(stageId, parsed.rows || [], file);
      else if (stageId === 'agenda') await handleAgendaFile(stageId, parsed.rows || [], file);
      else if (stageId === 'clinical') await handleClinicalFile(stageId, parsed.rows || [], file);
      else if (stageId === 'cashflow') await handleCashflowFile(stageId, parsed.rows || [], file);
      else if (stageId === 'procedures') await handleProceduresFile(stageId, parsed.rows || [], file);
      renderSummary(stageId);
      setStageStatus(stageId, (parsed.mode === 'supported' || isBinaryImportFile(file)) ? 'Pronta para validar' : 'Recebida, aguardando parser', false);
    } catch (error) {
      state.stageSummaries[stageId] = { mode: 'error', summary: { count: 0, headers: [], headerPreview: [] }, text: error && error.message ? error.message : 'Falha ao validar arquivo.' };
      state.stageRows[stageId] = [];
      renderSummary(stageId);
      setStageStatus(stageId, 'Arquivo inválido', true);
    }
    unlockStages();
    persistState();
  }

  async function completePatientsStage(stageId) {
    const rows = state.stageRows[stageId] || [];
    const file = state.stageFiles[stageId];
    if (!file) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    try {
      const response = await postMultipart(getPatientsBase() + '/apply', file, { source: state.source });
      const data = response && response.data ? response.data : {};
      const summary = state.stageSummaries[stageId] || {};
      summary.backend = { importedCount: Number(data.imported || 0), duplicateRows: Number(data.skipped || 0) };
      summary.text = `${summary.text} Importados: ${summary.backend.importedCount}. Ignorados: ${summary.backend.duplicateRows}.`;
      state.stageSummaries[stageId] = summary;
      state.completedStages[stageId] = true;
      setStageStatus(stageId, 'Concluída', false);
      renderSummary(stageId);
      persistState();
      unlockStages();
    } catch (error) { setStageStatus(stageId, error && error.message ? error.message : 'Falha ao importar pacientes.', true); }
  }

  async function completeAgendaStage(stageId) {
    const rows = state.stageRows[stageId] || [];
    const file = state.stageFiles[stageId];
    if (!file) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    try {
      const response = await postMultipart(getAgendaBase() + '/apply', file, { source: state.source });
      const data = response && response.data ? response.data : {};
      const summary = state.stageSummaries[stageId] || {};
      summary.backend = { imported: Number(data.imported || 0), skipped: Number(data.skipped || 0) };
      summary.text = `${summary.text} Importados: ${summary.backend.imported}. Ignorados: ${summary.backend.skipped}.`;
      state.stageSummaries[stageId] = summary;
      state.completedStages[stageId] = true;
      setStageStatus(stageId, 'Concluída', false);
      renderSummary(stageId);
      persistState();
      unlockStages();
    } catch (error) { setStageStatus(stageId, error && error.message ? error.message : 'Falha ao importar agenda.', true); }
  }

  async function completeClinicalStage(stageId) {
    const rows = state.stageRows[stageId] || [];
    const file = state.stageFiles[stageId];
    if (!file) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    try {
      const response = await postMultipart(getClinicalBase() + '/apply', file, { source: state.source });
      const data = response && response.data ? response.data : {};
      const summary = state.stageSummaries[stageId] || {};
      summary.backend = { imported: Number(data.imported || 0), skipped: Number(data.skipped || 0) };
      summary.text = `${summary.text} Importados: ${summary.backend.imported}. Ignorados: ${summary.backend.skipped}.`;
      state.stageSummaries[stageId] = summary;
      state.completedStages[stageId] = true;
      setStageStatus(stageId, 'Concluída', false);
      renderSummary(stageId);
      persistState();
      unlockStages();
    } catch (error) { setStageStatus(stageId, error && error.message ? error.message : 'Falha ao importar fichas clinicas.', true); }
  }

  async function completeCashflowStage(stageId) {
    const rows = state.stageRows[stageId] || [];
    const file = state.stageFiles[stageId];
    if (!file) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    try {
      const response = await postMultipart(getCashflowBase() + '/apply', file, { source: state.source });
      const data = response && response.data ? response.data : {};
      const summary = state.stageSummaries[stageId] || {};
      summary.backend = {
        imported: Number(data.imported || 0),
        skipped: Number(data.skipped || 0),
        totalRows: Number(data.totalRows || rows.length || 0),
      };
      summary.text = `${summary.text} Importados: ${summary.backend.imported}. Ignorados: ${summary.backend.skipped}.`;
      state.stageSummaries[stageId] = summary;
      state.completedStages[stageId] = true;
      setStageStatus(stageId, 'Concluída', false);
      renderSummary(stageId);
      persistState();
      unlockStages();
    } catch (error) { setStageStatus(stageId, error && error.message ? error.message : 'Falha ao importar fluxo de caixa.', true); }
  }

  async function completeProceduresStage(stageId) {
    const rows = state.stageRows[stageId] || [];
    const file = state.stageFiles[stageId];
    if (!file) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    try {
      const response = await postMultipart(getProceduresBase() + '/apply', file, { source: state.source });
      const data = response && response.data ? response.data : {};
      const summary = state.stageSummaries[stageId] || {};
      summary.backend = {
        imported: Number(data.imported || 0),
        skipped: Number(data.skipped || 0),
        catalogSize: Number(data.catalogSize || 0),
      };
      summary.text = `${summary.text} Importados: ${summary.backend.imported}. Ignorados: ${summary.backend.skipped}. Catálogo total: ${summary.backend.catalogSize}.`;
      state.stageSummaries[stageId] = summary;
      state.completedStages[stageId] = true;
      setStageStatus(stageId, 'Concluída', false);
      renderSummary(stageId);
      persistState();
      unlockStages();
    } catch (error) { setStageStatus(stageId, error && error.message ? error.message : 'Falha ao importar procedimentos.', true); }
  }

  function completeGenericStage(stageId) {
    const hasFile = Boolean(state.stageFiles[stageId]);
    const summary = state.stageSummaries[stageId];
    if (!hasFile || !summary) { setStageStatus(stageId, 'Selecione um arquivo', false); return; }
    if (summary.mode === 'error') { setStageStatus(stageId, 'Arquivo inválido', true); return; }
    state.completedStages[stageId] = true;
    setStageStatus(stageId, summary.mode === 'supported' ? 'Concluída' : 'Recebida', false);
    persistState();
    unlockStages();
  }

  function bindStage(stage) {
    const card = document.querySelector(`[data-stage-card="${stage.id}"]`);
    const input = document.getElementById(stage.fileId);
    const action = document.querySelector(`[data-stage-action="${stage.id}"]`);
    const status = document.querySelector(`[data-stage-status="${stage.id}"]`);
    const preview = document.querySelector(`[data-stage-preview="${stage.id}"]`);
    const indicator = document.querySelector(`[data-step-indicator="${stage.id}"]`);
    if (!card || !input || !action || !status || !preview || !indicator) return;
    elements.cards.set(stage.id, card); elements.inputs.set(stage.id, input); elements.actions.set(stage.id, action); elements.statuses.set(stage.id, status); elements.previews.set(stage.id, preview); elements.indicators.set(stage.id, indicator);
    input.addEventListener('change', () => handleStageFile(stage.id));
    action.addEventListener('click', () => { if (stage.id === 'patients') return completePatientsStage(stage.id); if (stage.id === 'agenda') return completeAgendaStage(stage.id); if (stage.id === 'clinical') return completeClinicalStage(stage.id); if (stage.id === 'cashflow') return completeCashflowStage(stage.id); if (stage.id === 'procedures') return completeProceduresStage(stage.id); completeGenericStage(stage.id); });
  }

  function hydrateUI() {
    const sourceSelect = document.getElementById('migration-source');
    if (sourceSelect) {
      sourceSelect.value = state.source;
      sourceSelect.addEventListener('change', () => {
        state.source = VALID_SOURCES.has(sourceSelect.value) ? sourceSelect.value : 'capim';
        state.stageFiles = {};
        state.stageRows = {};
        state.stageSummaries = {};
        state.completedStages = {};
        STAGES.forEach((stage) => { const input = elements.inputs.get(stage.id); if (input) input.value = ''; });
        persistState();
        unlockStages();
      });
    }
    STAGES.forEach(bindStage);
    unlockStages();
  }

  async function boot() {
    scopeKey = await getAuthClinicId();
    loadState();
    hydrateUI();
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => console.warn('[MIGRACAO] Falha ao inicializar migração:', error?.message || error));
  });
})();
