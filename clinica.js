document.addEventListener('DOMContentLoaded', () => {
  const appApi = window.appApi || {};
  const clinicApi = appApi.clinic || {};
  const subscriptionApi = appApi.subscription || {};
  const form = document.getElementById('clinic-form');
  const pageTitle = document.getElementById('clinic-page-title');
  const pageSubtitle = document.getElementById('clinic-page-subtitle');
  const statusEl = document.getElementById('clinic-status');
  const logoInput = document.getElementById('clinic-logo');
  const logoPreview = document.getElementById('logo-preview');
  const logoImage = document.getElementById('logo-image');
  const logoRemove = document.getElementById('logo-remove');
  const exportDataButton = document.getElementById('clinic-export-data');
  const importFileInput = document.getElementById('clinic-import-file');
  const importPreview = document.getElementById('clinic-import-preview');
  const importApplyButton = document.getElementById('clinic-import-apply');
  const importClearButton = document.getElementById('clinic-import-clear');
  const tabTriggers = Array.from(document.querySelectorAll('[data-clinic-tab-trigger]'));
  const tabPanels = Array.from(document.querySelectorAll('[data-clinic-tab-panel]'));
  const subscriptionPanel = document.getElementById('clinic-subscription-panel');
  const subscriptionHeadline = document.getElementById('subscription-headline');
  const subscriptionSummary = document.getElementById('subscription-summary');
  const subscriptionStatusPill = document.getElementById('subscription-status-pill');
  const subscriptionTrialHighlight = document.getElementById('subscription-trial-highlight');
  const subscriptionTrialDays = document.getElementById('subscription-trial-days');
  const subscriptionTrialCopy = document.getElementById('subscription-trial-copy');
  const subscriptionPlan = document.getElementById('subscription-plan');
  const subscriptionMonthlyAmount = document.getElementById('subscription-monthly-amount');
  const subscriptionTrialEnds = document.getElementById('subscription-trial-ends');
  const subscriptionNextDue = document.getElementById('subscription-next-due');
  const subscriptionLastPayment = document.getElementById('subscription-last-payment');
  const subscriptionPaymentHistory = document.getElementById('subscription-payment-history');
  const subscriptionActivateButton = document.getElementById('subscription-activate-button');
  const subscriptionRefreshButton = document.getElementById('subscription-refresh-button');
  const subscriptionFeedback = document.getElementById('subscription-feedback');

  const fields = {
    cnpjCpf: document.getElementById('clinic-cnpj'),
    razaoSocial: document.getElementById('clinic-razao'),
    nomeClinica: document.getElementById('clinic-nome'),
    telefone: document.getElementById('clinic-telefone'),
    email: document.getElementById('clinic-email'),
    cro: document.getElementById('clinic-cro'),
    responsavelTecnico: document.getElementById('clinic-responsavel'),
    cep: document.getElementById('clinic-cep'),
    rua: document.getElementById('clinic-rua'),
    numero: document.getElementById('clinic-numero'),
    complemento: document.getElementById('clinic-complemento'),
    bairro: document.getElementById('clinic-bairro'),
    cidade: document.getElementById('clinic-cidade'),
    estado: document.getElementById('clinic-estado'),
  };

  const birthdayFields = {
    enabled: document.getElementById('birthday-enabled'),
    draftMode: document.getElementById('birthday-draft-mode'),
    sendTime: document.getElementById('birthday-send-time'),
    dailyLimit: document.getElementById('birthday-daily-limit'),
    throttleMs: document.getElementById('birthday-throttle-ms'),
    template: document.getElementById('birthday-template'),
  };

  const whatsAppFields = {
    countryCode: document.getElementById('whatsapp-country-code'),
    phoneNumber: document.getElementById('whatsapp-phone-number'),
  };
  const whatsAppConnection = {
    badge: document.getElementById('clinic-whatsapp-badge'),
    statusText: document.getElementById('clinic-whatsapp-status-text'),
    phone: document.getElementById('clinic-whatsapp-phone'),
    lastSeen: document.getElementById('clinic-whatsapp-last-seen'),
    instance: document.getElementById('clinic-whatsapp-instance'),
    feedback: document.getElementById('clinic-whatsapp-feedback'),
    connectButton: document.getElementById('clinic-whatsapp-connect'),
    refreshButton: document.getElementById('clinic-whatsapp-refresh'),
    disconnectButton: document.getElementById('clinic-whatsapp-disconnect'),
    deleteButton: document.getElementById('clinic-whatsapp-delete'),
    qrImage: document.getElementById('clinic-whatsapp-qr-image'),
    qrPlaceholder: document.getElementById('clinic-whatsapp-qr-placeholder'),
    qrPairingCode: document.getElementById('clinic-whatsapp-pairing-code'),
    engineHealth: document.getElementById('clinic-whatsapp-engine-health'),
    diagnostics: document.getElementById('clinic-whatsapp-diagnostics'),
  };

  let logoData = '';
  let logoFile = '';
  let logoRemoved = false;
  let pendingImportPayload = null;
  let subscriptionOverview = null;
  let subscriptionLoaded = false;
  let subscriptionLoading = false;
  let whatsAppPollTimer = null;
  let whatsAppQrState = {
    qrDataUrl: '',
    pairingCode: '',
    qrMessage: '',
    status: '',
  };
  const CRO_PREFIX = 'CRO-';
  const PLAN_LABELS = {
    MONTHLY: 'Mensal',
    QUARTERLY: 'Trimestral',
    SEMIANNUAL: 'Semestral',
    ANNUAL: 'Anual',
    LEGACY: 'Legado',
  };
  const PLAN_MONTH_DIVISOR = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    ANNUAL: 12,
  };

  const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
  const formatCroValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return CRO_PREFIX;
    if (raw.toUpperCase().startsWith(CRO_PREFIX)) return `${CRO_PREFIX}${raw.slice(CRO_PREFIX.length)}`;
    return `${CRO_PREFIX}${raw}`;
  };
  const cleanCroValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === CRO_PREFIX) return '';
    return formatCroValue(raw);
  };

  const normalizeImportKey = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const detectDelimitedSeparator = (line = '') => {
    const commaCount = (line.match(/,/g) || []).length;
    const semicolonCount = (line.match(/;/g) || []).length;
    const tabCount = (line.match(/\t/g) || []).length;
    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    if (semicolonCount > commaCount) return ';';
    return ',';
  };

  const splitDelimitedLine = (line = '', separator = ',') => {
    const result = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (char === separator && !quoted) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    result.push(current.trim());
    return result.map((value) => String(value || '').replace(/^"|"$/g, '').trim());
  };

  const parseDelimitedText = (text = '') => {
    const raw = String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    if (!raw) {
      throw new Error('Arquivo vazio.');
    }
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      throw new Error('Arquivo vazio.');
    }
    const separator = detectDelimitedSeparator(lines[0]);
    const headers = splitDelimitedLine(lines[0], separator);
    const rows = lines.slice(1).map((line) => splitDelimitedLine(line, separator));
    return { headers, rows };
  };

  const mapImportedRowToClinicPayload = (row = {}, headers = []) => {
    const normalized = {};
    headers.forEach((header, index) => {
      const key = normalizeImportKey(header);
      const value = String(row[index] || '').trim();
      if (!value) return;
      normalized[key] = value;
    });

    const pick = (...keys) => {
      for (const key of keys) {
        const found = normalized[normalizeImportKey(key)];
        if (found) return found;
      }
      return '';
    };

    const clinic = {};
    const endereco = {};

    const nomeFantasia = pick('nomeFantasia', 'nome da clinica', 'nomeclinica', 'nome');
    const razaoSocial = pick('razaoSocial', 'razao social', 'razaosocial', 'legalname');
    const cnpjCpf = pick('cnpjCpf', 'cnpj/cpf', 'cnpj', 'cpf', 'cpfcnpj', 'documento');
    const telefone = pick('telefone', 'telefonecomercial', 'phone', 'celular');
    const email = pick('email', 'e-mail', 'emailclinica');
    const cro = pick('cro');
    const responsavelTecnico = pick('responsavelTecnico', 'responsavel tecnico', 'responsavel', 'responsaveltecnico');
    const whatsapp = pick('whatsapp');
    const logoVersion = pick('logoVersion', 'logo version');

    if (nomeFantasia) clinic.nomeFantasia = nomeFantasia;
    if (razaoSocial) clinic.razaoSocial = razaoSocial;
    if (cnpjCpf) clinic.cnpjCpf = cnpjCpf;
    if (telefone) clinic.telefone = telefone;
    if (email) clinic.email = email;
    if (cro) clinic.cro = cro;
    if (responsavelTecnico) clinic.responsavelTecnico = responsavelTecnico;
    if (whatsapp) clinic.whatsapp = whatsapp;
    if (logoVersion) clinic.logoVersion = logoVersion;

    const rua = pick('rua', 'logradouro', 'endereco');
    const numero = pick('numero', 'num');
    const complemento = pick('complemento', 'complement');
    const bairro = pick('bairro');
    const cidade = pick('cidade', 'municipio');
    const uf = pick('uf', 'estado');
    const cep = pick('cep', 'zipcode');

    if (rua) endereco.rua = rua;
    if (numero) endereco.numero = numero;
    if (complemento) endereco.complemento = complemento;
    if (bairro) endereco.bairro = bairro;
    if (cidade) endereco.cidade = cidade;
    if (uf) endereco.uf = uf;
    if (cep) endereco.cep = cep;

    if (Object.keys(endereco).length) {
      clinic.endereco = endereco;
    }

    const operationalSettings = {};
    const clinicProfile = {};
    if (whatsapp) clinicProfile.whatsapp = whatsapp;
    if (cro) clinicProfile.cro = cro;
    if (responsavelTecnico) clinicProfile.responsavelTecnico = responsavelTecnico;
    if (logoVersion) clinicProfile.logoVersion = logoVersion;
    if (Object.keys(endereco).length) clinicProfile.endereco = endereco;
    if (Object.keys(clinicProfile).length) operationalSettings.clinicProfile = clinicProfile;

    const timezone = pick('timezone', 'fuso horario', 'fuso');
    const reminderHours = pick('reminderhours', 'horaslembrete');
    const summaryTime = pick('summarytime', 'horariosumario');
    if (timezone) operationalSettings.agendaSettings = { timezone };
    if (reminderHours || summaryTime) {
      operationalSettings.notificationPreferences = {};
      if (reminderHours) operationalSettings.notificationPreferences.reminderHours = Number(reminderHours) || 24;
      if (summaryTime) operationalSettings.notificationPreferences.summaryTime = summaryTime;
    }

    const payload = { source: 'file-upload' };
    if (Object.keys(clinic).length) payload.clinic = clinic;
    if (Object.keys(operationalSettings).length) payload.operationalSettings = operationalSettings;
    return payload;
  };

  const parseImportFile = async (file) => {
    if (!file) {
      throw new Error('Selecione um arquivo.');
    }
    const fileName = String(file.name || '').trim();
    const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    if (['xlsx', 'xls', 'zip', 'rar'].includes(extension)) {
      throw new Error('Este formato ainda nao e processado nesta etapa. Use CSV ou JSON para importar.');
    }

    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
      reader.readAsText(file, 'utf-8');
    });

    if (extension === 'csv') {
      const { headers, rows } = parseDelimitedText(text);
      if (!rows.length) {
        throw new Error('CSV sem linhas de dados.');
      }
      return mapImportedRowToClinicPayload(rows[0], headers);
    }

    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON invalido.');
      }
      return parsed;
    } catch (_error) {
      throw new Error('Arquivo invalido. Use JSON ou CSV.');
    }
  };

  const setFieldError = (input, message) => {
    if (!input || !input.parentElement) return;
    const field = input.parentElement;
    field.classList.toggle('error', !!message);
    let errorEl = field.querySelector('.error-text');
    if (message) {
      if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.className = 'error-text';
        field.appendChild(errorEl);
      }
      errorEl.textContent = message;
    } else if (errorEl) {
      errorEl.remove();
    }
  };

  const clearFieldErrors = () => {
    Object.values(fields).forEach((input) => setFieldError(input, ''));
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  const isValidCpf = (value) => {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
    check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === Number(cpf[10]);
  };

  const isValidCnpj = (value) => {
    const cnpj = onlyDigits(value);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;
    const calc = (base) => {
      const weights = base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = base.split('').reduce((acc, num, idx) => acc + Number(num) * weights[idx], 0);
      const mod = sum % 11;
      return mod < 2 ? 0 : 11 - mod;
    };
    const base = cnpj.slice(0, 12);
    const dig1 = calc(base);
    const dig2 = calc(base + dig1);
    return cnpj === base + String(dig1) + String(dig2);
  };

  const formatCpfCnpj = (value) => {
    const digits = onlyDigits(value);
    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d{1,2})$/, '$1.$2.$3/$4-$5');
  };

  const getClinicDocumentValidation = (value) => {
    const digits = onlyDigits(value);
    if (!digits) {
      return { ok: true, normalized: '', message: '' };
    }
    if (digits.length < 11) {
      return { ok: false, normalized: digits, message: 'CPF/CNPJ incompleto. Confira se o documento possui 11 ou 14 digitos.' };
    }
    if (digits.length === 11) {
      return isValidCpf(digits)
        ? { ok: true, normalized: digits, message: '' }
        : { ok: false, normalized: digits, message: 'CPF invalido. Confira os 11 digitos.' };
    }
    if (digits.length < 14) {
      return { ok: false, normalized: digits, message: 'CNPJ incompleto. Confira os 14 digitos.' };
    }
    if (digits.length === 14) {
      return isValidCnpj(digits)
        ? { ok: true, normalized: digits, message: '' }
        : { ok: false, normalized: digits, message: 'CNPJ invalido. Confira os 14 digitos.' };
    }
    return { ok: false, normalized: digits.slice(0, 14), message: 'CPF/CNPJ deve conter 11 ou 14 digitos.' };
  };

  const formatPhone = (value) => {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^(\d{2})\s(\d{4})(\d)/, '($1) $2-$3');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^(\d{2})\s(\d{5})(\d)/, '($1) $2-$3');
  };

  const formatCep = (value) => {
    const digits = onlyDigits(value).slice(0, 8);
    return digits.replace(/^(\d{5})(\d)/, '$1-$2');
  };

  const setStatus = (text, muted = true) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = muted ? '#64748b' : '#16a34a';
  };

  const clearWhatsAppPoll = () => {
    if (whatsAppPollTimer) {
      window.clearTimeout(whatsAppPollTimer);
      whatsAppPollTimer = null;
    }
  };

  const scheduleWhatsAppPoll = (status) => {
    clearWhatsAppPoll();
    const normalized = String(status || '').trim().toUpperCase();
    if (!clinicApi.refreshWhatsAppConnection) return;
    if (normalized === 'CONNECTED' || normalized === 'READY' || normalized === 'ERROR' || normalized === 'NOT_CONFIGURED') return;
    whatsAppPollTimer = window.setTimeout(() => {
      void loadWhatsAppConnection(true);
      void loadWhatsAppEngineHealth(true);
      void loadWhatsAppDiagnostics();
    }, 5000);
  };

  const formatDateTime = (value, fallback) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  };

  const formatDateOnly = (value, fallback = '--') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
  };

  const formatCurrency = (value, fallback = '--') => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return fallback;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  };

  const normalizePlanType = (value) => String(value || '').trim().toUpperCase();

  const getSubscriptionPlan = (overview = {}) => {
    const subscription = overview?.subscription || {};
    const planType = normalizePlanType(subscription?.planType) || 'MONTHLY';
    const catalog = Array.isArray(overview?.plans) ? overview.plans : [];
    const catalogPlan = catalog.find((plan) => normalizePlanType(plan?.planType) === planType) || {};
    const amount = Number(subscription?.amount || catalogPlan?.amount || 0);
    return {
      planType,
      label: PLAN_LABELS[planType] || planType || 'Mensal',
      amount,
      monthlyAmount: amount > 0 ? amount / (PLAN_MONTH_DIVISOR[planType] || 1) : 0,
    };
  };

  const resolveSubscriptionStatus = (overview = {}) => {
    const effectiveStatus = String(overview?.effectiveStatus || overview?.subscription?.status || '').trim().toUpperCase();
    const accessMode = String(overview?.accessMode || '').trim().toUpperCase();
    if (overview?.readOnly === true || accessMode === 'READ_ONLY' || effectiveStatus === 'TRIAL_EXPIRED') return 'READ_ONLY';
    if (effectiveStatus === 'TRIALING') return 'TRIALING';
    if (effectiveStatus === 'ACTIVE' || effectiveStatus === 'GRACE_PERIOD') return 'ACTIVE';
    return 'PAYMENT_REQUIRED';
  };

  const getTrialDaysRemaining = (trialEndsAt) => {
    const end = trialEndsAt ? new Date(trialEndsAt) : null;
    if (!end || Number.isNaN(end.getTime())) return null;
    const remainingMs = end.getTime() - Date.now();
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  };

  const resolvePaymentLink = (...values) => values
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';

  const setSubscriptionFeedback = (message = '', tone = 'muted') => {
    if (!subscriptionFeedback) return;
    subscriptionFeedback.textContent = message;
    subscriptionFeedback.dataset.tone = tone;
  };

  const setSubscriptionLoading = (loading) => {
    subscriptionLoading = loading === true;
    if (subscriptionActivateButton) {
      const currentStatus = resolveSubscriptionStatus(subscriptionOverview || {});
      subscriptionActivateButton.disabled = subscriptionLoading || currentStatus === 'ACTIVE';
    }
    if (subscriptionRefreshButton) subscriptionRefreshButton.disabled = subscriptionLoading;
  };

  const openCheckoutLink = async (paymentLink) => {
    const link = String(paymentLink || '').trim();
    if (!link) throw new Error('Checkout indisponivel no momento.');
    const isDesktopMode = String(appApi?.mode || '').trim().toLowerCase() === 'desktop';
    if (isDesktopMode && typeof appApi?.openExternalUrl === 'function') {
      await appApi.openExternalUrl(link);
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const renderPaymentSummary = (payment) => {
    if (!payment) return 'Nenhum pagamento registrado.';
    const status = String(payment?.status || '').trim().toUpperCase() || 'PENDING';
    const paidAt = payment?.paidAt ? `Pago em ${formatDateTime(payment.paidAt, '--')}` : `Criado em ${formatDateTime(payment?.createdAt, '--')}`;
    return `
      <div class="subscription-payment-title">${status}</div>
      <div class="subscription-payment-meta">${paidAt}</div>
      <div class="subscription-payment-amount">${formatCurrency(payment?.amount)}</div>
    `;
  };

  const renderSubscriptionHistory = (payments = []) => {
    if (!subscriptionPaymentHistory) return;
    const safePayments = Array.isArray(payments) ? payments : [];
    if (!safePayments.length) {
      subscriptionPaymentHistory.innerHTML = '<div class="subscription-empty-state">Nenhuma cobranca encontrada.</div>';
      return;
    }
    subscriptionPaymentHistory.innerHTML = safePayments.slice(0, 8).map((payment) => {
      const status = String(payment?.status || '').trim().toUpperCase() || 'PENDING';
      const dateLabel = payment?.paidAt
        ? `Pago em ${formatDateTime(payment.paidAt, '--')}`
        : `Criado em ${formatDateTime(payment?.createdAt, '--')}`;
      return `
        <div class="subscription-payment-row">
          <div>
            <div class="subscription-payment-title">${status}</div>
            <div class="subscription-payment-meta">${dateLabel} · ${payment?.provider || 'ASAAS'}</div>
          </div>
          <div class="subscription-payment-amount">${formatCurrency(payment?.amount)}</div>
        </div>
      `;
    }).join('');
  };

  const renderSubscription = (overview = {}) => {
    subscriptionOverview = overview;
    const subscription = overview?.subscription || null;
    const status = resolveSubscriptionStatus(overview);
    const plan = getSubscriptionPlan(overview);
    const trialEndsAt = subscription?.trialEndsAt || '';
    const trialDays = getTrialDaysRemaining(trialEndsAt);
    const paymentLink = resolvePaymentLink(overview?.paymentLink, subscription?.lastPayment?.paymentLink);

    if (subscriptionStatusPill) {
      subscriptionStatusPill.textContent = status;
      subscriptionStatusPill.dataset.status = status;
    }

    if (subscriptionHeadline) {
      subscriptionHeadline.textContent = status === 'READ_ONLY'
        ? 'Modo visualizacao'
        : status === 'ACTIVE'
          ? 'Assinatura ativa'
          : status === 'TRIALING'
            ? 'Teste gratis ativo'
            : 'Pagamento necessario';
    }

    if (subscriptionSummary) {
      subscriptionSummary.textContent = status === 'READ_ONLY'
        ? 'Seu periodo de teste expirou. Ative a assinatura para voltar a editar dados.'
        : status === 'ACTIVE'
          ? 'Sua clinica esta com acesso completo.'
          : status === 'TRIALING'
            ? 'Use a Voithos normalmente durante o periodo de teste.'
            : 'Gere o checkout seguro do Asaas para ativar a assinatura.';
    }

    if (subscriptionTrialHighlight) {
      subscriptionTrialHighlight.dataset.state = status === 'READ_ONLY' ? 'expired' : 'active';
    }
    if (subscriptionTrialDays) {
      subscriptionTrialDays.textContent = status === 'READ_ONLY'
        ? 'Modo visualizacao'
        : trialDays === null
          ? '--'
          : `Teste grátis: ${trialDays} dia${trialDays === 1 ? '' : 's'} restante${trialDays === 1 ? '' : 's'}`;
    }
    if (subscriptionTrialCopy) {
      subscriptionTrialCopy.textContent = status === 'READ_ONLY'
        ? 'O trial expirou. A leitura continua liberada, mas edicoes exigem assinatura ativa.'
        : trialEndsAt
          ? `Disponivel ate ${formatDateOnly(trialEndsAt)}.`
          : 'Periodo de teste indisponivel para esta assinatura.';
    }

    if (subscriptionPlan) subscriptionPlan.textContent = plan.label;
    if (subscriptionMonthlyAmount) subscriptionMonthlyAmount.textContent = formatCurrency(plan.monthlyAmount);
    if (subscriptionTrialEnds) subscriptionTrialEnds.textContent = formatDateOnly(trialEndsAt);
    if (subscriptionNextDue) subscriptionNextDue.textContent = formatDateOnly(subscription?.endDate || subscription?.graceUntil);
    if (subscriptionLastPayment) subscriptionLastPayment.innerHTML = renderPaymentSummary(subscription?.lastPayment);
    renderSubscriptionHistory(subscription?.payments || []);

    if (subscriptionActivateButton) {
      subscriptionActivateButton.textContent = paymentLink ? 'Abrir checkout Asaas' : 'Ativar assinatura';
      subscriptionActivateButton.disabled = subscriptionLoading || status === 'ACTIVE';
    }
    if (subscriptionRefreshButton) subscriptionRefreshButton.disabled = subscriptionLoading;
  };

  const loadSubscription = async ({ force = false } = {}) => {
    if (!subscriptionPanel || !subscriptionApi.getMySubscription) return;
    if (subscriptionLoaded && !force) return;
    setSubscriptionLoading(true);
    setSubscriptionFeedback('Carregando assinatura...', 'muted');
    try {
      const overview = await subscriptionApi.getMySubscription();
      subscriptionLoaded = true;
      renderSubscription(overview || {});
      setSubscriptionFeedback('', 'muted');
    } catch (error) {
      console.warn('[CLINICA] Falha ao carregar assinatura', error);
      setSubscriptionFeedback(error?.message || 'Nao foi possivel carregar os dados da assinatura.', 'error');
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const activateSubscription = async () => {
    if (!subscriptionApi.createCheckout) {
      setSubscriptionFeedback('Checkout indisponivel neste ambiente.', 'error');
      return;
    }

    setSubscriptionLoading(true);
    setSubscriptionFeedback('Preparando checkout seguro do Asaas...', 'muted');
    try {
      let overview = subscriptionOverview;
      if (!overview && subscriptionApi.getMySubscription) {
        overview = await subscriptionApi.getMySubscription();
      }

      let subscription = overview?.subscription || null;
      const plan = getSubscriptionPlan(overview || {});
      let paymentLink = resolvePaymentLink(overview?.paymentLink, subscription?.lastPayment?.paymentLink);

      if (!subscription && subscriptionApi.create) {
        await subscriptionApi.create({
          planType: plan.planType || 'MONTHLY',
          provider: 'MANUAL',
          gatewayMode: 'CHECKOUT',
        });
        overview = await subscriptionApi.getMySubscription?.();
        subscription = overview?.subscription || null;
        paymentLink = resolvePaymentLink(overview?.paymentLink, subscription?.lastPayment?.paymentLink);
      }

      if (!paymentLink) {
        const checkout = await subscriptionApi.createCheckout({
          planType: plan.planType || subscription?.planType || 'MONTHLY',
          paymentMethod: 'PIX',
        });
        paymentLink = resolvePaymentLink(checkout?.paymentLink, checkout?.invoiceUrl, checkout?.url, checkout?.checkoutUrl);
      }

      await loadSubscription({ force: true });
      await openCheckoutLink(paymentLink);
      setSubscriptionFeedback('Checkout aberto. A ativacao acontece automaticamente quando o webhook Asaas confirmar o pagamento.', 'success');
    } catch (error) {
      console.error('[CLINICA] Falha ao gerar checkout', error);
      setSubscriptionFeedback(error?.message || 'Nao foi possivel gerar o checkout agora.', 'error');
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const showClinicTab = (tabName = 'profile') => {
    const normalized = tabName === 'subscription' ? 'subscription' : 'profile';
    tabPanels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.getAttribute('data-clinic-tab-panel') !== normalized);
    });
    tabTriggers.forEach((trigger) => {
      trigger.classList.toggle('active', trigger.getAttribute('data-clinic-tab-trigger') === normalized);
    });
    if (pageTitle) pageTitle.textContent = normalized === 'subscription' ? 'Assinaturas' : 'Dados da clinica';
    if (pageSubtitle) {
      pageSubtitle.textContent = normalized === 'subscription'
        ? 'Status, trial e ativacao da assinatura da clinica.'
        : 'Informacoes principais e identidade visual.';
    }
    if (normalized === 'subscription') {
      window.history.replaceState({}, document.title, '#assinaturas');
      void loadSubscription();
    } else if (window.location.hash === '#assinaturas') {
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    }
  };

  const formatWhatsAppStatus = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    switch (normalized) {
      case 'CONNECTED':
        return 'Conectado';
      case 'READY':
        return 'Pronto';
      case 'CONNECTING':
        return 'Conectando';
      case 'DISCONNECTED':
        return 'Desconectado';
      case 'DEGRADED':
        return 'Degradado';
      case 'FAILED':
        return 'Falha no envio';
      case 'ERROR':
        return 'Com erro';
      case 'QR_REQUIRED':
        return 'QR necessario';
      case 'SESSION_INVALID':
        return 'Sessao invalida';
      case 'CREATED':
        return 'Pronto para conectar';
      case 'NOT_CONFIGURED':
        return 'Nao configurado';
      default:
        return normalized || 'Indisponivel';
    }
  };

  const badgeClassForStatus = (status) => {
    const normalized = String(status || '').trim().toUpperCase();
    switch (normalized) {
      case 'CONNECTED':
      case 'READY':
        return 'status-connected';
      case 'CONNECTING':
        return 'status-connecting';
      case 'DISCONNECTED':
        return 'status-disconnected';
      case 'DEGRADED':
      case 'FAILED':
      case 'QR_REQUIRED':
      case 'SESSION_INVALID':
      case 'ERROR':
        return 'status-error';
      case 'CREATED':
      case 'NOT_CONFIGURED':
      default:
        return 'status-created';
    }
  };

  const setWhatsAppFeedback = (text, tone = 'muted') => {
    if (!whatsAppConnection.feedback) return;
    whatsAppConnection.feedback.textContent = text;
    whatsAppConnection.feedback.dataset.tone = tone;
  };

  const renderWhatsAppDiagnostics = (items = []) => {
    if (!whatsAppConnection.diagnostics) return;
    whatsAppConnection.diagnostics.style.display = 'none';
    if (!Array.isArray(items) || !items.length) {
      whatsAppConnection.diagnostics.innerHTML = '<div class="whatsapp-diagnostics-empty">Sem diagnostico recente desta clinica.</div>';
      return;
    }

    const relevant = items
      .filter((item) => String(item?.channel || '').trim().toLowerCase() === 'whatsapp')
      .slice(0, 6);

    if (!relevant.length) {
      whatsAppConnection.diagnostics.innerHTML = '<div class="whatsapp-diagnostics-empty">Sem diagnostico recente desta clinica.</div>';
      return;
    }

    whatsAppConnection.diagnostics.innerHTML = relevant.map((item) => {
      const tone = ['success', 'warning', 'error'].includes(String(item?.status || '').trim().toLowerCase())
        ? String(item.status).trim().toLowerCase()
        : 'muted';
      const type = String(item?.type || '').trim();
      const title = type === 'engine_health'
        ? 'Saude do motor NG'
        : type === 'pending_queue'
          ? 'Acao pendente'
          : 'Evento de envio';
      const summary = item?.message || item?.error || 'Sem resumo disponivel.';
      const meta = [];
      if (item?.instanceId) meta.push(`Instancia ${item.instanceId}`);
      if (item?.meta?.operationalStatus) meta.push(`Status ${item.meta.operationalStatus}`);
      if (item?.meta?.runtimeSocketState) meta.push(`Runtime ${item.meta.runtimeSocketState}`);
      return `
        <article class="whatsapp-diagnostic-item" data-tone="${tone}">
          <div class="whatsapp-diagnostic-head">
            <strong>${title}</strong>
            <span>${formatDateTime(item?.createdAt, 'agora')}</span>
          </div>
          <p>${summary}</p>
          ${meta.length ? `<div class="whatsapp-diagnostic-meta">${meta.join(' · ')}</div>` : ''}
        </article>
      `;
    }).join('');
  };

  const loadWhatsAppDiagnostics = async () => {
    if (!clinicApi.listMessagingLogs) return;
    try {
      const [logData, pendingData] = await Promise.all([
        clinicApi.listMessagingLogs({ limit: 8 }),
        clinicApi.listWhatsAppPending
          ? clinicApi.listWhatsAppPending({ limit: 6 }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ]);
      const logs = Array.isArray(logData?.items) ? logData.items : [];
      const summary = pendingData?.summary || {};
      const pending = (Array.isArray(pendingData?.items) ? pendingData.items : []).map((item) => ({
        channel: 'whatsapp',
        type: 'pending_queue',
        status: 'warning',
        createdAt: item?.createdAt || item?.updatedAt || '',
        instanceId: item?.instanceId || '',
        message: `Envio ${String(item?.type || 'MANUAL').trim()} pendente para ${item?.phone || 'destino desconhecido'}.`,
        meta: {
          operationalStatus: `tentativa ${Number(item?.retryCount || 0) + 1}`,
          runtimeSocketState: item?.nextRetryAt ? `proxima tentativa ${formatDateTime(item.nextRetryAt, '-')}` : '',
        },
      }));
      const queueSummary = summary?.pendingTotal > 0 ? [{
        channel: 'whatsapp',
        type: 'pending_queue',
        status: summary?.queuePressure || summary?.campaignPressure ? 'warning' : 'success',
        createdAt: new Date().toISOString(),
        message: `Fila local com ${summary.pendingTotal} pendencia(s): ${summary.pendingConfirmations || 0} confirmacao(oes), ${summary.pendingReminders || 0} lembrete(s), ${summary.pendingManual || 0} manual(is), ${summary.pendingCampaigns || 0} campanha(s).`,
        meta: {
          operationalStatus: summary?.queuePressure ? 'pressao operacional' : 'estavel',
          runtimeSocketState: summary?.campaignPressure ? 'campanhas limitadas para proteger a clinica' : '',
        },
      }] : [];
      renderWhatsAppDiagnostics([...queueSummary, ...pending, ...logs]);
    } catch (_error) {
      renderWhatsAppDiagnostics([]);
    }
  };

  const renderWhatsAppEngineHealth = (health = {}, silent = false) => {
    if (!whatsAppConnection.engineHealth) return;
    const ready = health?.ready === true;
    const status = String(health?.status || '').trim().toLowerCase();
    let text = 'Aguardando leitura do QR Code.';
    let tone = 'muted';

    if (ready) {
      text = 'Conectado.';
      tone = 'success';
    } else if (status === 'starting') {
      text = 'Aguardando leitura do QR Code.';
      tone = 'warning';
    } else if (status === 'warning') {
      text = 'Conexao aguardando atualizacao.';
      tone = 'warning';
    } else if (status === 'timeout') {
      text = 'Conexao temporariamente indisponivel.';
      tone = 'warning';
    } else if (health?.message) {
      text = 'Desconectado.';
      tone = 'error';
    }

    whatsAppConnection.engineHealth.textContent = text;
    whatsAppConnection.engineHealth.dataset.tone = tone;
  };

  const loadWhatsAppEngineHealth = async (silent = false) => {
    if (!clinicApi.getWhatsAppEngineHealth) {
      try {
        if (clinicApi.getWhatsAppConnection) {
          const connection = await clinicApi.getWhatsAppConnection();
          renderWhatsAppEngineHealth({
            status: connection?.exists ? 'warning' : 'offline',
            message: connection?.exists
              ? 'Health dedicado do motor NG indisponivel nesta versao do app. Usando o status da conexao da clinica.'
              : 'Integracao de health do motor NG indisponivel nesta versao do app.',
          }, true);
          return;
        }
      } catch (_fallbackError) {
        // keep default message below when even the connection status cannot be read
      }
      renderWhatsAppEngineHealth({ message: 'Integracao de health do motor NG indisponivel.', status: 'offline' }, silent);
      return;
    }
    try {
      const health = await clinicApi.getWhatsAppEngineHealth();
      renderWhatsAppEngineHealth(health, silent);
    } catch (error) {
      try {
        if (clinicApi.getWhatsAppConnection) {
          const connection = await clinicApi.getWhatsAppConnection();
          if (connection?.exists) {
            renderWhatsAppEngineHealth({
              status: 'warning',
              message: error?.message || 'Health do motor NG indisponivel no momento. Usando o status da conexao da clinica.',
            }, true);
            return;
          }
        }
      } catch (_fallbackError) {
        // ignore fallback failure and render the original health error
      }
      renderWhatsAppEngineHealth({
        status: 'offline',
        message: error?.message || 'Nao foi possivel verificar a saude do motor NG.',
      }, silent);
    }
  };

  const setWhatsAppLoading = (loading) => {
    if (whatsAppConnection.connectButton) whatsAppConnection.connectButton.disabled = loading;
    if (whatsAppConnection.refreshButton) whatsAppConnection.refreshButton.disabled = loading;
    if (whatsAppConnection.disconnectButton) whatsAppConnection.disconnectButton.disabled = loading;
    if (whatsAppConnection.deleteButton) whatsAppConnection.deleteButton.disabled = loading;
  };

  const mapWhatsAppError = (error) => {
    const code = String(error?.code || '').trim().toUpperCase();
    if (code === 'ENGINE_DATABASE_UNAVAILABLE') {
      return {
        feedback: 'O WhatsApp Engine esta sem acesso ao banco de dados. Inicie o ambiente completo do engine e tente novamente.',
        qrMessage: 'O QR Code ficara disponivel assim que o banco de dados do WhatsApp Engine estiver ativo.',
      };
    }
    if (code === 'ENGINE_INVALID_TOKEN') {
      return {
        feedback: 'A integracao interna com o WhatsApp Engine esta com token invalido. Ajuste a configuracao do ambiente.',
        qrMessage: 'A conexao da clinica depende da autenticacao interna do WhatsApp Engine.',
      };
    }
    if (code === 'ENGINE_UNAVAILABLE') {
      return {
        feedback: 'O WhatsApp Engine nao esta online neste momento. Inicie o engine e tente novamente.',
        qrMessage: 'Quando o WhatsApp Engine estiver online, o QR Code podera ser gerado aqui.',
      };
    }
    if (code === 'ENGINE_STARTING') {
      return {
        feedback: 'O WhatsApp Engine esta iniciando e recuperando as instancias. Aguarde alguns segundos.',
        qrMessage: 'O QR Code sera liberado assim que o motor NG concluir a inicializacao.',
      };
    }
    if (code === 'ENGINE_RECONNECTING') {
      return {
        feedback: 'O WhatsApp da clinica esta reconectando no engine. Aguarde alguns segundos para gerar um novo QR Code.',
        qrMessage: 'A instancia esta reconectando. Assim que o runtime estabilizar, o QR Code ou codigo de pareamento sera exibido aqui.',
      };
    }
    return {
      feedback: error?.message || 'Nao foi possivel comunicar com o WhatsApp da clinica.',
      qrMessage: 'Nao foi possivel preparar o QR Code neste momento.',
    };
  };

  const renderWhatsAppConnection = (connection = {}) => {
    const persistedStatus = String(connection?.persistedStatus || '').trim().toUpperCase();
    const runtimeSocketState = String(connection?.runtimeSocketState || '').trim().toUpperCase();
    const runtimeReady = connection?.connectedInRuntime === true;
    let status = String(connection?.operationalStatus || connection?.status || 'NOT_CONFIGURED').trim().toUpperCase();
    if (!runtimeReady && status === 'CONNECTED') {
      status = runtimeSocketState === 'CONNECTING' ? 'CONNECTING' : 'DISCONNECTED';
    }
    const statusLabel = formatWhatsAppStatus(status);
    const hasDivergence = persistedStatus === 'CONNECTED' && !runtimeReady;

    console.info('[CLINICA_UI] whatsapp_status_render', JSON.stringify({
      clinicId: connection?.clinicId || '',
      instanceId: connection?.instanceId || '',
      displayedStatus: status,
      operationalStatus: String(connection?.operationalStatus || connection?.status || '').trim().toUpperCase(),
      persistedStatus,
      connectedInRuntime: runtimeReady,
      runtimeSocketState,
      divergence: hasDivergence,
      syncedAt: new Date().toISOString(),
    }));

    if (whatsAppConnection.badge) {
      whatsAppConnection.badge.textContent = statusLabel;
      whatsAppConnection.badge.className = `whatsapp-badge ${badgeClassForStatus(status)}`;
    }
    if (whatsAppConnection.statusText) {
      const runtimeText = runtimeReady ? ' ativo no sistema' : runtimeSocketState ? ` runtime ${runtimeSocketState}` : '';
      whatsAppConnection.statusText.textContent = `${statusLabel}${runtimeText}`;
    }
    if (whatsAppConnection.phone) {
      whatsAppConnection.phone.textContent = connection?.phoneNumber || 'Ainda nao conectado';
    }
    if (whatsAppConnection.lastSeen) {
      whatsAppConnection.lastSeen.textContent = formatDateTime(connection?.lastSeenAt, 'Sem atividade recente');
    }
    if (whatsAppConnection.instance) {
      whatsAppConnection.instance.textContent = connection?.instanceId || 'Sera criada ao conectar';
    }
    if (whatsAppConnection.connectButton) {
      const connectedLike = status === 'CONNECTED' || status === 'READY';
      whatsAppConnection.connectButton.textContent = connectedLike ? 'Conectado' : 'Conectar WhatsApp';
      whatsAppConnection.connectButton.disabled = connectedLike;
    }
    if (whatsAppConnection.disconnectButton) {
      const canDisconnect = Boolean(connection?.instanceId) && status !== 'NOT_CONFIGURED';
      whatsAppConnection.disconnectButton.disabled = !canDisconnect;
    }
    if (whatsAppConnection.deleteButton) {
      const canDelete = Boolean(connection?.instanceId);
      whatsAppConnection.deleteButton.disabled = !canDelete;
    }

    const incomingQrDataUrl = String(connection?.qrDataUrl || '').trim();
    const incomingPairingCode = String(connection?.pairingCode || '').trim();
    const incomingQrMessage = String(connection?.qrMessage || '').trim();
    const qrPending = connection?.qrPending === true;
    if (incomingQrDataUrl) {
      whatsAppQrState = {
        qrDataUrl: incomingQrDataUrl,
        pairingCode: incomingPairingCode,
        qrMessage: incomingQrMessage,
        status,
      };
    } else if (['CONNECTED', 'READY', 'DEGRADED', 'FAILED', 'ERROR', 'NOT_CONFIGURED'].includes(status)) {
      whatsAppQrState = {
        qrDataUrl: '',
        pairingCode: '',
        qrMessage: '',
        status,
      };
    }

    const qrDataUrl = incomingQrDataUrl || whatsAppQrState.qrDataUrl;
    const pairingCode = incomingPairingCode || whatsAppQrState.pairingCode;
    if (whatsAppConnection.qrImage) {
      whatsAppConnection.qrImage.src = qrDataUrl;
      whatsAppConnection.qrImage.style.display = qrDataUrl ? 'block' : 'none';
    }
    if (whatsAppConnection.qrPlaceholder) {
      const defaultText = (status === 'CONNECTED' || status === 'READY')
        ? 'WhatsApp conectado com sucesso. Nao e necessario gerar um novo QR Code.'
        : status === 'CONNECTING'
          ? 'A instancia esta sendo preparada. Aguarde alguns segundos ou atualize o status para carregar o QR Code.'
          : 'Clique em "Conectar WhatsApp" para gerar o QR Code da sua clinica.';
      const pendingText = qrPending
        ? 'A instancia esta reconectando e preparando novo QR Code. Aguarde alguns segundos e atualize o status.'
        : '';
      const divergenceText = hasDivergence
        ? 'A ultima sessao salva parecia conectada, mas o runtime real do WhatsApp esta indisponivel. Gere um novo QR Code ou reconecte a instancia.'
        : '';
      whatsAppConnection.qrPlaceholder.textContent = incomingQrMessage || whatsAppQrState.qrMessage || pendingText || divergenceText || defaultText;
      whatsAppConnection.qrPlaceholder.style.display = qrDataUrl ? 'none' : 'grid';
    }
    if (whatsAppConnection.qrPairingCode) {
      whatsAppConnection.qrPairingCode.textContent = pairingCode ? `Codigo de pareamento: ${pairingCode}` : '';
      whatsAppConnection.qrPairingCode.style.display = pairingCode ? 'block' : 'none';
    }

    scheduleWhatsAppPoll(status);
  };

  const loadWhatsAppConnection = async (silent = false) => {
    if (!clinicApi.getWhatsAppConnection) {
      setWhatsAppFeedback('Integracao do WhatsApp Engine indisponivel neste ambiente.', 'error');
      return;
    }

    if (!silent) setWhatsAppLoading(true);
    try {
      const data = await clinicApi.getWhatsAppConnection();
      renderWhatsAppEngineHealth(data?.engineHealth || {}, true);
      renderWhatsAppConnection(data);
      await loadWhatsAppDiagnostics();
      if (!silent) {
        const status = String(data?.operationalStatus || data?.status || '').trim().toUpperCase();
        if (status === 'CONNECTED' || status === 'READY') {
          setWhatsAppFeedback('WhatsApp da clinica conectado e pronto para uso.', 'success');
        } else if (status === 'DEGRADED' || status === 'FAILED') {
          setWhatsAppFeedback('WhatsApp conectado, mas os ultimos envios falharam. Verifique a conexao antes de novas confirmacoes.', 'error');
        } else if (String(data?.persistedStatus || '').trim().toUpperCase() === 'CONNECTED' && data?.connectedInRuntime !== true) {
          setWhatsAppFeedback('O WhatsApp salvo anteriormente nao esta operacional agora. Reconecte a instancia para voltar a enviar mensagens.', 'error');
        } else if (status === 'NOT_CONFIGURED') {
          setWhatsAppFeedback('Clique em "Conectar WhatsApp" para criar a instancia e gerar o QR Code.', 'muted');
        } else {
          setWhatsAppFeedback('Acompanhe o status abaixo. Se necessario, gere um novo QR Code.', 'muted');
        }
      }
    } catch (err) {
      const mapped = mapWhatsAppError(err);
      renderWhatsAppConnection({ status: 'ERROR', qrMessage: mapped.qrMessage });
      await loadWhatsAppEngineHealth(true);
      await loadWhatsAppDiagnostics();
      setWhatsAppFeedback(mapped.feedback, 'error');
    } finally {
      if (!silent) setWhatsAppLoading(false);
    }
  };

  const connectWhatsApp = async () => {
    if (!clinicApi.connectWhatsApp) {
      setWhatsAppFeedback('Integracao do WhatsApp Engine indisponivel neste ambiente.', 'error');
      return;
    }

    setWhatsAppLoading(true);
    setWhatsAppFeedback('Gerando QR Code da clinica...', 'muted');
    try {
      const data = await clinicApi.connectWhatsApp();
      renderWhatsAppEngineHealth(data?.engineHealth || {}, true);
      renderWhatsAppConnection({
        ...data,
        qrMessage: data?.qrDataUrl
          ? 'Escaneie o QR Code no WhatsApp da clinica para concluir a conexao.'
          : 'A instancia foi preparada. Atualize o status se o QR ainda nao apareceu.',
      });
      if (['CONNECTED', 'READY'].includes(String(data?.operationalStatus || data?.status || '').trim().toUpperCase())) {
        setWhatsAppFeedback('WhatsApp da clinica ja estava conectado.', 'success');
      } else if (data?.qrDataUrl) {
        setWhatsAppFeedback('QR Code atualizado. Escaneie no celular da clinica.', 'success');
      } else {
        setWhatsAppFeedback('Instancia preparada. O sistema vai continuar buscando o QR automaticamente por alguns segundos.', 'muted');
      }
      await loadWhatsAppDiagnostics();
    } catch (err) {
      const mapped = mapWhatsAppError(err);
      renderWhatsAppConnection({ status: 'ERROR', qrMessage: mapped.qrMessage });
      await loadWhatsAppEngineHealth(true);
      await loadWhatsAppDiagnostics();
      setWhatsAppFeedback(mapped.feedback, 'error');
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!clinicApi.disconnectWhatsApp) {
      setWhatsAppFeedback('A rotina de desconectar o WhatsApp ainda nao esta disponivel neste ambiente.', 'error');
      return;
    }
    if (!window.confirm('Deseja desconectar o WhatsApp da clinica e limpar a sessao atual?')) return;

    setWhatsAppLoading(true);
    try {
      await clinicApi.disconnectWhatsApp();
      await loadWhatsAppEngineHealth(true);
      whatsAppQrState = {
        qrDataUrl: '',
        pairingCode: '',
        qrMessage: '',
        status: 'CREATED',
      };
      renderWhatsAppConnection({
        status: 'CREATED',
        connectedInRuntime: false,
        phoneNumber: '',
        instanceId: '',
      });
      setWhatsAppFeedback('WhatsApp desconectado. Gere um novo QR Code para parear novamente.', 'success');
      await loadWhatsAppDiagnostics();
      await loadWhatsAppConnection(true);
    } catch (error) {
      const mapped = mapWhatsAppError(error);
      await loadWhatsAppEngineHealth(true);
      await loadWhatsAppDiagnostics();
      setWhatsAppFeedback(mapped.feedback, 'error');
    } finally {
      setWhatsAppLoading(false);
    }
  };
  const deleteWhatsAppInstance = async () => {
    if (!clinicApi.deleteWhatsAppInstance) {
      setWhatsAppFeedback('A rotina de exclusao da instancia ainda nao esta disponivel neste ambiente.', 'error');
      return;
    }
    if (!window.confirm('Deseja excluir a instancia WhatsApp desta clinica? Uma nova instancia sera criada no proximo pareamento.')) return;

    setWhatsAppLoading(true);
    try {
      await clinicApi.deleteWhatsAppInstance();
      await loadWhatsAppEngineHealth(true);
      whatsAppQrState = {
        qrDataUrl: '',
        pairingCode: '',
        qrMessage: '',
        status: 'NOT_CONFIGURED',
      };
      renderWhatsAppConnection({
        status: 'NOT_CONFIGURED',
        connectedInRuntime: false,
        phoneNumber: '',
        instanceId: '',
      });
      setWhatsAppFeedback('Instancia excluida com sucesso. Clique em "Conectar WhatsApp" para criar uma nova.', 'success');
      await loadWhatsAppDiagnostics();
    } catch (error) {
      const mapped = mapWhatsAppError(error);
      await loadWhatsAppEngineHealth(true);
      await loadWhatsAppDiagnostics();
      setWhatsAppFeedback(mapped.feedback, 'error');
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const showLogo = (src) => {
    if (!logoImage) return;
    logoImage.src = src;
    logoImage.style.display = src ? 'block' : 'none';
    if (logoPreview) logoPreview.classList.toggle('is-empty', !src);
  };

  const renderImportPreview = (preview) => {
    if (!importPreview) return;
    const summary = preview?.summary || {};
    const sections = Array.isArray(preview?.settingsSections) ? preview.settingsSections : [];
    const fieldsCount = Number(summary.profileFields || 0) + Number(summary.addressFields || 0);
    importPreview.classList.remove('hidden');
    importPreview.innerHTML = `
      <strong>Preview validado</strong>
      <ul>
        <li>${fieldsCount} campos cadastrais reconhecidos</li>
        <li>${Number(summary.settingsSections || 0)} blocos de configuracao reconhecidos</li>
        <li>${sections.length ? `Configuracoes: ${sections.join(', ')}` : 'Sem configuracoes extras'}</li>
      </ul>
    `;
  };

  const clearImportPreview = () => {
    pendingImportPayload = null;
    if (importFileInput) importFileInput.value = '';
    if (importPreview) {
      importPreview.innerHTML = '';
      importPreview.classList.add('hidden');
    }
    if (importApplyButton) importApplyButton.disabled = true;
  };

  const exportClinicData = async () => {
    if (!clinicApi.exportData) {
      setStatus('Exportacao ainda nao disponivel no backend web.', true);
      return;
    }
    try {
      setStatus('Preparando exportacao...', true);
      const data = await clinicApi.exportData();
      const clinicName = String(data?.clinic?.nomeFantasia || data?.clinic?.razaoSocial || 'clinica')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'clinica';
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `voithos-${clinicName}-export.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Exportacao gerada com sucesso.', false);
    } catch (err) {
      console.error('[CLINICA] Erro ao exportar dados', err);
      setStatus(err?.message || 'Erro ao exportar dados da clinica.', true);
    }
  };

  const previewClinicImport = async (file) => {
    if (!clinicApi.previewImport) {
      setStatus('Importacao ainda nao disponivel no backend web.', true);
      return;
    }
    try {
      setStatus('Validando arquivo de importacao...', true);
      const payload = await parseImportFile(file);
      const preview = await clinicApi.previewImport(payload);
      pendingImportPayload = payload;
      renderImportPreview(preview);
      if (importApplyButton) importApplyButton.disabled = false;
      setStatus('Preview validado. Revise antes de aplicar.', true);
    } catch (err) {
      console.error('[CLINICA] Erro ao validar importacao', err);
      clearImportPreview();
      setStatus(err?.message || 'Arquivo de importacao invalido.', true);
    }
  };

  const applyClinicImport = async () => {
    if (!pendingImportPayload || !clinicApi.applyImport) return;
    if (!window.confirm('Aplicar os dados importados nesta clinica? Esta acao atualiza apenas a clinica autenticada.')) return;
    try {
      setStatus('Aplicando importacao...', true);
      await clinicApi.applyImport(pendingImportPayload);
      clearImportPreview();
      await loadClinic();
      setStatus('Importacao aplicada com sucesso.', false);
    } catch (err) {
      console.error('[CLINICA] Erro ao aplicar importacao', err);
      setStatus(err?.message || 'Erro ao aplicar importacao.', true);
    }
  };

  const readLogoFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      logoData = String(reader.result || '');
      logoRemoved = false;
      showLogo(logoData);
      setStatus('Logo carregado, lembre-se de salvar.', true);
    };
    reader.readAsDataURL(file);
  };

  const loadClinic = async () => {
    if (!clinicApi.get) return;
    try {
      const data = await clinicApi.get();
      logoFile = data.logoFile || '';
      Object.keys(fields).forEach((key) => {
        if (fields[key]) fields[key].value = data[key] || '';
      });
      if (fields.cnpjCpf) fields.cnpjCpf.value = formatCpfCnpj(data?.cnpjCpf || data?.cnpj || '');
      if (fields.cro) fields.cro.value = formatCroValue(data?.cro || '');
      if (fields.telefone) fields.telefone.value = formatPhone(data?.telefone || '');
      if (fields.cep) fields.cep.value = formatCep(data?.cep || '');
      if (birthdayFields.enabled) birthdayFields.enabled.checked = data?.messaging?.birthday?.enabled === true;
      if (birthdayFields.draftMode) birthdayFields.draftMode.checked = data?.messaging?.birthday?.draftMode !== false;
      if (birthdayFields.sendTime) birthdayFields.sendTime.value = data?.messaging?.birthday?.sendTime || '09:00';
      if (birthdayFields.dailyLimit) birthdayFields.dailyLimit.value = data?.messaging?.birthday?.dailyLimit || 200;
      if (birthdayFields.throttleMs) birthdayFields.throttleMs.value = data?.messaging?.birthday?.throttleMs || 1000;
      if (birthdayFields.template) birthdayFields.template.value = data?.messaging?.birthday?.template || '';

      if (whatsAppFields.countryCode) whatsAppFields.countryCode.value = data?.messaging?.whatsapp?.countryCode || '55';
      if (whatsAppFields.phoneNumber) {
        whatsAppFields.phoneNumber.value = data?.messaging?.whatsapp?.phoneNumber || data?.telefone || '';
      }
      showLogo(data.logoData || '');
      setStatus('Dados carregados.', true);
    } catch (err) {
      console.warn('[CLINICA] Falha ao carregar dados', err);
      setStatus('Nao foi possivel carregar os dados.', true);
    }

    void loadWhatsAppEngineHealth(true);
    void loadWhatsAppDiagnostics();
    void loadWhatsAppConnection();
  };

  if (logoInput) {
    logoInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      readLogoFile(file);
    });
  }

  if (logoRemove) {
    logoRemove.addEventListener('click', () => {
      logoData = '';
      logoRemoved = true;
      logoFile = '';
      showLogo('');
      setStatus('Logo removido. Salve para confirmar.', true);
    });
  }

  exportDataButton?.addEventListener('click', () => {
    void exportClinicData();
  });

  importFileInput?.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    void previewClinicImport(file);
  });

  importClearButton?.addEventListener('click', () => {
    clearImportPreview();
    setStatus('Importacao cancelada.', true);
  });

  importApplyButton?.addEventListener('click', () => {
    void applyClinicImport();
  });

  tabTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      const tabName = trigger.getAttribute('data-clinic-tab-trigger');
      if (!tabName) return;
      event.preventDefault();
      showClinicTab(tabName);
    });
  });

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#assinaturas') {
      showClinicTab('subscription');
    }
  });

  window.addEventListener('voithos:subscription-read-only', () => {
    showClinicTab('subscription');
  });

  subscriptionActivateButton?.addEventListener('click', () => {
    void activateSubscription();
  });

  subscriptionRefreshButton?.addEventListener('click', () => {
    subscriptionLoaded = false;
    void loadSubscription({ force: true });
  });

  Object.values(fields).forEach((input) => {
    input?.addEventListener('input', () => {
      setStatus('Alteracoes pendentes.', true);
      setFieldError(input, '');
    });
  });

  Object.values(birthdayFields).forEach((input) => {
    if (!input) return;
    const evt = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(evt, () => setStatus('Alteracoes pendentes.', true));
  });

  Object.values(whatsAppFields).forEach((input) => {
    if (!input) return;
    const evt = input.type === 'checkbox' ? 'change' : 'input';
    input.addEventListener(evt, () => setStatus('Alteracoes pendentes.', true));
  });

  if (fields.cnpjCpf) {
    fields.cnpjCpf.addEventListener('input', () => {
      fields.cnpjCpf.value = formatCpfCnpj(fields.cnpjCpf.value);
    });
  }

  if (fields.telefone) {
    fields.telefone.addEventListener('input', () => {
      fields.telefone.value = formatPhone(fields.telefone.value);
    });
  }

  if (fields.cro) {
    fields.cro.value = formatCroValue(fields.cro.value);
    fields.cro.addEventListener('focus', () => {
      fields.cro.value = formatCroValue(fields.cro.value);
    });
    fields.cro.addEventListener('blur', () => {
      fields.cro.value = formatCroValue(fields.cro.value);
    });
  }

  if (whatsAppFields.phoneNumber) {
    whatsAppFields.phoneNumber.addEventListener('input', () => {
      whatsAppFields.phoneNumber.value = formatPhone(whatsAppFields.phoneNumber.value);
    });
  }
  if (fields.cep) {
    fields.cep.addEventListener('input', () => {
      fields.cep.value = formatCep(fields.cep.value);
    });

    fields.cep.addEventListener('blur', async () => {
      const cepDigits = onlyDigits(fields.cep.value);
      if (cepDigits.length !== 8) return;
      try {
        setStatus('Buscando CEP...', true);
        const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, { cache: 'no-store' });
        if (!resp.ok) throw new Error('CEP nao encontrado.');
        const data = await resp.json();
        if (data.erro) throw new Error('CEP nao encontrado.');
        if (fields.rua && !fields.rua.value) fields.rua.value = data.logradouro || '';
        if (fields.bairro && !fields.bairro.value) fields.bairro.value = data.bairro || '';
        if (fields.cidade && !fields.cidade.value) fields.cidade.value = data.localidade || '';
        if (fields.estado && !fields.estado.value) fields.estado.value = data.uf || '';
        setStatus('Endereco preenchido pelo CEP.', true);
      } catch (err) {
        console.warn('[CLINICA] CEP invalido', err);
        setFieldError(fields.cep, 'CEP nao encontrado.');
        setStatus('Nao foi possivel localizar o CEP.', true);
      }
    });
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!clinicApi.save) return;

    clearFieldErrors();
    let hasError = false;
    const clinicDocumentValidation = getClinicDocumentValidation(fields.cnpjCpf?.value || '');
    if (!clinicDocumentValidation.ok) {
      setFieldError(fields.cnpjCpf, clinicDocumentValidation.message);
      hasError = true;
    }

    if (fields.email?.value && !isValidEmail(fields.email.value)) {
      setFieldError(fields.email, 'E-mail invalido.');
      hasError = true;
    }

    if (fields.telefone?.value) {
      const telDigits = onlyDigits(fields.telefone.value);
      if (telDigits.length < 10) {
        setFieldError(fields.telefone, 'Telefone incompleto.');
        hasError = true;
      }
    }

    if (fields.cep?.value) {
      const cepDigits = onlyDigits(fields.cep.value);
      if (cepDigits.length > 0 && cepDigits.length !== 8) {
        setFieldError(fields.cep, 'CEP incompleto.');
        hasError = true;
      }
    }

    if (hasError) {
      setStatus('Corrija os campos destacados.', true);
      return;
    }

    const payload = {
      cnpjCpf: fields.cnpjCpf?.value || '',
      razaoSocial: fields.razaoSocial?.value || '',
      nomeClinica: fields.nomeClinica?.value || '',
      telefone: fields.telefone?.value || '',
      email: fields.email?.value || '',
      cro: cleanCroValue(fields.cro?.value || ''),
      responsavelTecnico: fields.responsavelTecnico?.value || '',
      cep: fields.cep?.value || '',
      rua: fields.rua?.value || '',
      numero: fields.numero?.value || '',
      complemento: fields.complemento?.value || '',
      bairro: fields.bairro?.value || '',
      cidade: fields.cidade?.value || '',
      estado: fields.estado?.value || '',
      logoData,
      logoFile,
      logoRemove: logoRemoved,
      messaging: {
        birthday: {
          enabled: !!birthdayFields.enabled?.checked,
          draftMode: !!birthdayFields.draftMode?.checked,
          sendTime: birthdayFields.sendTime?.value || '09:00',
          dailyLimit: Number(birthdayFields.dailyLimit?.value || 200),
          throttleMs: Number(birthdayFields.throttleMs?.value || 1000),
          template: birthdayFields.template?.value || '',
        },
        whatsapp: {
          countryCode: whatsAppFields.countryCode?.value || '55',
          phoneNumber: whatsAppFields.phoneNumber?.value || '',
        },
      },
    };

    try {
      await clinicApi.save(payload);
      await loadClinic();
      logoData = '';
      logoRemoved = false;
      setStatus('Alteracoes salvas com sucesso.', false);
    } catch (err) {
      console.error('[CLINICA] Erro ao salvar', err);
      setStatus(err?.message || 'Erro ao salvar dados da clinica.', true);
    }
  });

  whatsAppConnection.connectButton?.addEventListener('click', () => {
    void connectWhatsApp();
  });

  whatsAppConnection.refreshButton?.addEventListener('click', () => {
    void loadWhatsAppConnection();
  });

  whatsAppConnection.disconnectButton?.addEventListener('click', () => {
    void disconnectWhatsApp();
  });

  whatsAppConnection.deleteButton?.addEventListener('click', () => {
    void deleteWhatsAppInstance();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearWhatsAppPoll();
      return;
    }
    void loadWhatsAppConnection(true);
  });
  if (window.location.hash === '#assinaturas') {
    showClinicTab('subscription');
  } else {
    showClinicTab('profile');
  }
  loadClinic();
});
