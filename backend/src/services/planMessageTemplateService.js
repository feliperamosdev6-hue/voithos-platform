const cleanText = (value) => String(value || '').trim();

const formatMoneyBr = (value) => (Number(value) || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatDateBr = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
  }).format(date);
};

const replacePlaceholders = (template, vars = {}) => String(template || '').replace(/\{([A-Z_]+)\}/g, (_match, key) => {
  const value = vars[key];
  return value == null ? '' : String(value);
});

const TEMPLATES = {
  PLAN_INSTALLMENT_DUE_SOON: {
    key: 'plan_installment_due_soon',
    version: 1,
    body: [
      'Ola, {NOME_PACIENTE}!',
      '',
      'A clinica {NOME_CLINICA} esta lembrando que a parcela do plano {NOME_PLANO} vence em breve.',
      'Valor: {VALOR}',
      'Vencimento: {VENCIMENTO}',
      '{LINK_PAGAMENTO}',
    ].join('\n'),
  },
  PLAN_INSTALLMENT_DUE_TODAY: {
    key: 'plan_installment_due_today',
    version: 1,
    body: [
      'Ola, {NOME_PACIENTE}!',
      '',
      'A parcela do plano {NOME_PLANO} vence hoje na clinica {NOME_CLINICA}.',
      'Valor: {VALOR}',
      'Vencimento: {VENCIMENTO}',
      '{LINK_PAGAMENTO}',
    ].join('\n'),
  },
  PLAN_INSTALLMENT_OVERDUE: {
    key: 'plan_installment_overdue',
    version: 1,
    body: [
      'Ola, {NOME_PACIENTE}!',
      '',
      'Identificamos uma parcela em atraso do plano {NOME_PLANO} na clinica {NOME_CLINICA}.',
      'Valor: {VALOR}',
      'Vencimento: {VENCIMENTO}',
      '{LINK_PAGAMENTO}',
    ].join('\n'),
  },
  PLAN_PAYMENT_CONFIRMED: {
    key: 'plan_payment_confirmed',
    version: 1,
    body: [
      'Ola, {NOME_PACIENTE}!',
      '',
      'Recebemos o pagamento da parcela do plano {NOME_PLANO} na clinica {NOME_CLINICA}.',
      'Valor confirmado: {VALOR}',
      'Referencia: {VENCIMENTO}',
    ].join('\n'),
  },
};

const planMessageTemplateService = {
  getTemplate: (eventType) => {
    const normalized = cleanText(eventType).toUpperCase();
    return TEMPLATES[normalized] || null;
  },

  render: ({ eventType, patientName, clinicName, planName, amount, dueDate, paymentUrl }) => {
    const template = planMessageTemplateService.getTemplate(eventType);
    if (!template) {
      throw new Error(`Template nao encontrado para ${cleanText(eventType) || 'evento desconhecido'}.`);
    }

    const linkLine = cleanText(paymentUrl) ? `Link de pagamento: ${cleanText(paymentUrl)}` : '';
    const body = replacePlaceholders(template.body, {
      NOME_PACIENTE: cleanText(patientName || 'Paciente'),
      NOME_CLINICA: cleanText(clinicName || 'Voithos'),
      NOME_PLANO: cleanText(planName || 'Plano odontologico'),
      VALOR: formatMoneyBr(amount),
      VENCIMENTO: formatDateBr(dueDate),
      LINK_PAGAMENTO: linkLine,
    }).replace(/\n{3,}/g, '\n\n').trim();

    return {
      templateKey: template.key,
      templateVersion: template.version,
      body,
      auditBody: body,
    };
  },
};

module.exports = { planMessageTemplateService };
