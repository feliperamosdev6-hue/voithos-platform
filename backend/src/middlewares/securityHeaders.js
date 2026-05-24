const normalizeText = (value) => String(value || '').trim();

const isProduction = () => normalizeText(process.env.NODE_ENV).toLowerCase() === 'production';

const splitCsv = (value) => normalizeText(value)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const normalizeOrigin = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch (_error) {
    return '';
  }
};

const uniq = (values) => Array.from(new Set(values.filter(Boolean)));

const resolveTrustedOrigins = () => {
  const configuredOrigins = [
    process.env.PUBLIC_APP_BASE_URL,
    process.env.PUBLIC_BACKEND_BASE_URL,
    process.env.API_BASE_URL,
    ...splitCsv(process.env.PUBLIC_APP_ALLOWED_ORIGINS),
    ...splitCsv(process.env.CORS_ORIGIN),
    ...splitCsv(process.env.CORS_ALLOWED_ORIGINS),
    ...splitCsv(process.env.SECURITY_CSP_EXTRA_ORIGINS),
  ].map(normalizeOrigin);

  return uniq([
    'https://app.voithosodonto.com.br',
    'https://*.voithosodonto.com.br',
    'https://voithos.app',
    'https://www.voithos.app',
    'https://*.voithos.app',
    'https://*.pages.dev',
    'https://asaas.com',
    'https://www.asaas.com',
    'https://sandbox.asaas.com',
    'https://api.asaas.com',
    'https://api-sandbox.asaas.com',
    'https://cdnjs.cloudflare.com',
    'https://static.cloudflareinsights.com',
    ...configuredOrigins,
  ]);
};

const buildCspHeader = () => {
  const trustedOrigins = resolveTrustedOrigins();
  const connectSrc = uniq([
    "'self'",
    ...trustedOrigins,
    'https://*.onrender.com',
    'https://*.asaas.com',
  ]);

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["form-action", "'self'", ...trustedOrigins, 'https://*.asaas.com'],
    ["connect-src", ...connectSrc],
    ["img-src", "'self'", 'data:', 'blob:', 'https:'],
    ["font-src", "'self'", 'data:', 'https://cdnjs.cloudflare.com'],
    ["script-src", "'self'", "'unsafe-inline'", ...trustedOrigins],
    ["style-src", "'self'", "'unsafe-inline'", ...trustedOrigins],
    ["frame-src", "'self'", 'https://*.asaas.com', 'https://asaas.com', 'https://sandbox.asaas.com'],
    ["media-src", "'self'", 'blob:', 'data:'],
    ["worker-src", "'self'", 'blob:'],
    ["upgrade-insecure-requests"],
  ];

  return directives
    .map(([name, ...values]) => values.length ? `${name} ${uniq(values).join(' ')}` : name)
    .join('; ');
};

const configureTrustProxy = (app) => {
  const raw = normalizeText(process.env.TRUST_PROXY);
  if (!raw) {
    if (isProduction()) app.set('trust proxy', 1);
    return;
  }

  const normalized = raw.toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) {
    app.set('trust proxy', 1);
    return;
  }
  if (['false', '0', 'no'].includes(normalized)) {
    app.set('trust proxy', false);
    return;
  }

  const numeric = Number(raw);
  app.set('trust proxy', Number.isFinite(numeric) ? numeric : raw);
};

const securityHeaders = (_req, res, next) => {
  res.setHeader('Content-Security-Policy', buildCspHeader());
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'fullscreen=(self)',
  ].join(', '));
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');

  if (isProduction() || normalizeText(process.env.SECURITY_HEADERS_HSTS).toLowerCase() === 'true') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains; preload');
  }

  return next();
};

module.exports = {
  configureTrustProxy,
  securityHeaders,
  resolveTrustedOrigins,
};
