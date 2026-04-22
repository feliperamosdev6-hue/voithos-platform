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

const sendWithResend = async (payload) => {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send(payload);

  if (error) {
    const message = error?.message || error?.name || 'Unknown Resend error';
    const resendError = new Error(message);
    resendError.resendError = error;
    throw resendError;
  }

  return { data, error: null };
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
