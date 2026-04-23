const { Resend } = require('resend');

const getResendClient = () => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  return new Resend(apiKey);
};

const getEmailFrom = () => {
  const from = String(process.env.EMAIL_FROM || '').trim();
  if (!from) {
    throw new Error('EMAIL_FROM is not configured.');
  }

  if (from.includes('<') && from.includes('>')) {
    return from;
  }

  return `Voithos <${from}>`;
};

const maskEmail = (email) => {
  const [localPart = '', domain = ''] = String(email || '').trim().toLowerCase().split('@');
  if (!localPart || !domain) return '';
  const localMask = localPart.length <= 2
    ? `${localPart[0] || '*'}*`
    : `${localPart.slice(0, 2)}***`;
  return `${localMask}@${domain}`;
};

const logEmailDiagnostic = (stage, payload = {}, extra = {}) => {
  console.info('[email][email-service]', {
    stage,
    endpoint: extra.endpoint || '',
    email: maskEmail(Array.isArray(payload.to) ? payload.to[0] : payload.to || ''),
    from: payload.from || '',
    subject: payload.subject || '',
    status: extra.status || '',
    resendEmailId: extra.resendEmailId || '',
    fallback: false,
    error: extra.error || '',
    resendError: extra.resendError || null,
  });
};

const buildEmailFailure = (payload, stage, extra = {}) => {
  const errorMessage = extra.error || 'Email send failed.';
  logEmailDiagnostic(stage, payload, {
    ...extra,
    status: extra.status || 'failed',
    error: errorMessage,
    resendEmailId: '',
  });
  const failure = new Error(errorMessage);
  failure.success = false;
  failure.resendEmailId = '';
  failure.data = null;
  failure.resendError = extra.resendError || null;
  return failure;
};

const sendWithResend = async (payload) => {
  const resend = getResendClient();
  const flow = String(payload?.idempotencyKey || '').startsWith('password-reset/')
    ? 'password-reset'
    : String(payload?.idempotencyKey || '').startsWith('signup-verification/')
      ? 'signup-verification'
      : 'unknown';
  logEmailDiagnostic(`${flow}_resend_call_started`, payload, {
    endpoint: flow === 'password-reset'
      ? '/auth/password-reset/request'
      : flow === 'signup-verification'
        ? '/auth/signup'
        : '',
    status: 'started',
  });
  const response = await resend.emails.send(payload);
  logEmailDiagnostic(`${flow}_resend_call_completed`, payload, {
    endpoint: flow === 'password-reset'
      ? '/auth/password-reset/request'
      : flow === 'signup-verification'
        ? '/auth/signup'
        : '',
    status: 'response_received',
    resendEmailId: response?.data?.id || '',
  });

  if (!response || response.error) {
    const error = response?.error || null;
    throw buildEmailFailure(payload, `${flow}_resend_call_failed`, {
      endpoint: flow === 'password-reset'
        ? '/auth/password-reset/request'
        : flow === 'signup-verification'
          ? '/auth/signup'
          : '',
      status: 'failed',
      error: error?.message || error?.name || 'Unknown Resend error',
      resendError: error,
    });
  }

  if (!response?.data || !response.data.id) {
    throw buildEmailFailure(payload, `${flow}_resend_call_failed`, {
      endpoint: flow === 'password-reset'
        ? '/auth/password-reset/request'
        : flow === 'signup-verification'
          ? '/auth/signup'
          : '',
      status: 'failed',
      error: 'Resend did not return a message id.',
      resendError: null,
    });
  }

  logEmailDiagnostic(`${flow}_resend_call_accepted`, payload, {
    endpoint: flow === 'password-reset'
      ? '/auth/password-reset/request'
      : flow === 'signup-verification'
        ? '/auth/signup'
        : '',
    status: 'accepted',
    resendEmailId: response.data.id,
  });

  return {
    success: true,
    resendEmailId: response.data.id,
    data: response.data,
    error: null,
    resendError: null,
  };
};

const sendVerificationEmail = async (email, code) => {
  const to = String(email || '').trim().toLowerCase();
  const verificationCode = String(code || '').trim();

  if (!to) {
    throw new Error('Verification email recipient is required.');
  }

  if (!/^\d{6}$/.test(verificationCode)) {
    throw new Error('Verification code must contain 6 digits.');
  }

  logEmailDiagnostic('signup_verification_send_started', {
    from: getEmailFrom(),
    to,
    subject: 'Confirme seu e-mail - Voithos',
  }, {
    endpoint: '/auth/signup',
    status: 'started',
  });
  return sendWithResend({
    from: getEmailFrom(),
    to,
    subject: 'Confirme seu e-mail - Voithos',
    idempotencyKey: `signup-verification/${to}/${verificationCode}`,
    text: [
      'Confirme seu e-mail na Voithos.',
      '',
      `Seu codigo de verificacao e: ${verificationCode}`,
      '',
      'Este codigo expira em 10 minutos.',
      'Se voce nao criou uma conta na Voithos, ignore este e-mail.',
    ].join('\n'),
    html: [
      '<p>Confirme seu e-mail na Voithos.</p>',
      `<p>Seu codigo de verificacao e: <strong>${verificationCode}</strong></p>`,
      '<p>Este codigo expira em 10 minutos.</p>',
      '<p>Se voce nao criou uma conta na Voithos, ignore este e-mail.</p>',
    ].join(''),
  });
};

const sendPasswordResetEmail = async (email, code) => {
  const to = String(email || '').trim().toLowerCase();
  const resetCode = String(code || '').trim();

  if (!to) {
    throw new Error('Password reset email recipient is required.');
  }

  if (!/^\d{6}$/.test(resetCode)) {
    throw new Error('Password reset code must contain 6 digits.');
  }

  logEmailDiagnostic('password_reset_send_started', {
    from: getEmailFrom(),
    to,
    subject: 'Redefina sua senha - Voithos',
  }, {
    endpoint: '/auth/password-reset/request',
    status: 'started',
  });
  return sendWithResend({
    from: getEmailFrom(),
    to,
    subject: 'Redefina sua senha - Voithos',
    idempotencyKey: `password-reset/${to}/${resetCode}`,
    text: [
      'Redefina sua senha na Voithos.',
      '',
      `Seu codigo de redefinicao e: ${resetCode}`,
      '',
      'Este codigo expira em 10 minutos.',
      'Se voce nao solicitou a redefinicao, ignore este e-mail.',
    ].join('\n'),
    html: [
      '<p>Redefina sua senha na Voithos.</p>',
      `<p>Seu codigo de redefinicao e: <strong>${resetCode}</strong></p>`,
      '<p>Este codigo expira em 10 minutos.</p>',
      '<p>Se voce nao solicitou a redefinicao, ignore este e-mail.</p>',
    ].join(''),
  });
};

module.exports = {
  emailService: {
    sendVerificationEmail,
    sendPasswordResetEmail,
  },
};
