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

  return from;
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

  const resend = getResendClient();

  return resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: 'Confirme seu e-mail - Voithos',
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

module.exports = {
  emailService: {
    sendVerificationEmail,
  },
};
