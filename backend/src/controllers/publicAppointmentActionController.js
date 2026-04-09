const { AppError } = require('../errors/AppError');
const { appointmentActionTokenService } = require('../services/appointmentActionTokenService');

const renderPage = ({ title, message, tone = 'neutral' }) => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light; --bg: #f4efe6; --panel: #fffaf2; --ink: #142132; --muted: #5b6a79; --accent: #1d8f78; --warn: #ba5d2c; --border: #d9ccba; }
      body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: radial-gradient(circle at top, #fff7eb 0%, var(--bg) 60%, #efe4d3 100%); color: var(--ink); }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      article { width: min(560px, 100%); background: var(--panel); border: 1px solid var(--border); border-radius: 20px; padding: 28px; box-shadow: 0 24px 60px rgba(20, 33, 50, 0.08); }
      .eyebrow { font: 700 12px/1.2 ui-monospace, SFMono-Regular, monospace; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
      h1 { margin: 12px 0 10px; font-size: clamp(28px, 6vw, 40px); }
      p { margin: 0; color: var(--muted); font-size: 16px; line-height: 1.6; }
      .tone-success { color: var(--accent); }
      .tone-error { color: var(--warn); }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="eyebrow">Voithos</div>
        <h1 class="${tone === 'success' ? 'tone-success' : tone === 'error' ? 'tone-error' : ''}">${title}</h1>
        <p>${message}</p>
      </article>
    </main>
  </body>
</html>`;

const mapErrorToPage = (error) => {
  if (!(error instanceof AppError)) {
    return {
      statusCode: 500,
      title: 'Nao foi possivel processar o link',
      message: 'Tente novamente mais tarde ou fale com a clinica.',
      tone: 'error',
    };
  }

  if (error.code === 'ACTION_TOKEN_EXPIRED') {
    return { statusCode: 410, title: 'Link expirado', message: 'Este link expirou. Entre em contato com a clinica para receber um novo lembrete.', tone: 'error' };
  }
  if (error.code === 'ACTION_TOKEN_ALREADY_USED') {
    return { statusCode: 409, title: 'Link ja utilizado', message: 'Esta acao ja foi registrada anteriormente.', tone: 'neutral' };
  }
  if (error.code === 'APPOINTMENT_ACTION_UNAVAILABLE') {
    return { statusCode: 409, title: 'Consulta indisponivel para alteracao', message: error.message, tone: 'error' };
  }

  return {
    statusCode: error.statusCode || 400,
    title: 'Link invalido',
    message: error.message || 'Este link nao esta disponivel.',
    tone: 'error',
  };
};

const consumeAppointmentActionLink = async (req, res) => {
  try {
    const result = await appointmentActionTokenService.consumePublicToken({
      token: req.params.token,
      requestMeta: {
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
      },
    });

    const title = result.outcome === 'RESCHEDULE_REQUESTED'
      ? 'Pedido de remarcacao recebido'
      : 'Consulta confirmada';
    const message = result.outcome === 'ALREADY_CONFIRMED'
      ? 'Sua consulta ja estava confirmada. Nenhuma nova acao foi necessaria.'
      : result.outcome === 'RESCHEDULE_REQUESTED'
        ? 'Recebemos sua solicitacao de remarcacao. A clinica pode entrar em contato para ajustar o horario.'
        : 'Sua consulta foi confirmada com sucesso.';

    res.status(200).type('html').send(renderPage({
      title,
      message,
      tone: 'success',
    }));
  } catch (error) {
    const mapped = mapErrorToPage(error);
    res.status(mapped.statusCode).type('html').send(renderPage(mapped));
  }
};

module.exports = { consumeAppointmentActionLink };
