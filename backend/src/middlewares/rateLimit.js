const crypto = require('crypto');

const normalizeText = (value) => String(value || '').trim();

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const hashValue = (value) => crypto
  .createHash('sha256')
  .update(normalizeText(value) || 'unknown')
  .digest('hex')
  .slice(0, 16);

const resolveClientIp = (req) => {
  const expressIp = normalizeText(req.ip);
  if (expressIp) return expressIp;

  const forwarded = normalizeText(req.headers?.['x-forwarded-for'])
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0];
  if (forwarded) return forwarded;

  return normalizeText(req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown');
};

const cleanupBucket = (store, now) => {
  if (store.size < 10000) return;
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.resetAt <= now) store.delete(key);
  }
};

const createRateLimit = ({
  name,
  windowMs,
  max,
  envPrefix,
  keyGenerator,
} = {}) => {
  const limiterName = normalizeText(name) || 'rate_limit';
  const normalizedEnvPrefix = normalizeText(envPrefix).toUpperCase();
  const resolvedWindowMs = parsePositiveInteger(
    process.env[`${normalizedEnvPrefix}_WINDOW_MS`],
    parsePositiveInteger(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS, windowMs || 600000)
  );
  const resolvedMax = parsePositiveInteger(
    process.env[`${normalizedEnvPrefix}_MAX`],
    parsePositiveInteger(process.env.RATE_LIMIT_DEFAULT_MAX, max || 60)
  );
  const store = new Map();

  return (req, res, next) => {
    const now = Date.now();
    cleanupBucket(store, now);

    const clientIp = resolveClientIp(req);
    const scopedKey = typeof keyGenerator === 'function'
      ? keyGenerator(req, clientIp)
      : `${limiterName}:${clientIp}`;
    const key = normalizeText(scopedKey) || `${limiterName}:unknown`;
    const existing = store.get(key);
    const entry = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + resolvedWindowMs };
    entry.count += 1;
    store.set(key, entry);

    const remaining = Math.max(0, resolvedMax - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(resolvedMax));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count <= resolvedMax) {
      return next();
    }

    res.setHeader('Retry-After', String(retryAfterSeconds));
    console.warn('[security][rate-limit]', {
      limiter: limiterName,
      ipHash: hashValue(clientIp),
      route: req.route?.path || req.path || '',
      method: req.method || '',
      retryAfterSeconds,
    });

    return res.status(429).json({
      ok: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
        retryAfterSeconds,
      },
    });
  };
};

const rateLimitByIp = (name) => (req, clientIp) => `${name}:${clientIp}`;
const rateLimitByIpAndRoute = (name) => (req, clientIp) => `${name}:${clientIp}:${normalizeText(req.route?.path || req.path)}`;

const rateLimitByIpAndUser = (name) => (req, clientIp) => {
  const userId = normalizeText(req.auth?.userId || '');
  return `${name}:${clientIp}:${userId || 'anonymous'}`;
};

const authRateLimits = {
  login: createRateLimit({
    name: 'auth_login',
    envPrefix: 'RATE_LIMIT_LOGIN',
    windowMs: 10 * 60 * 1000,
    max: 10,
    keyGenerator: rateLimitByIp('auth_login'),
  }),
  passwordReset: createRateLimit({
    name: 'auth_password_reset',
    envPrefix: 'RATE_LIMIT_PASSWORD_RESET',
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: rateLimitByIpAndRoute('auth_password_reset'),
  }),
  publicSignup: createRateLimit({
    name: 'auth_public_signup',
    envPrefix: 'RATE_LIMIT_PUBLIC_SIGNUP',
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: rateLimitByIp('auth_public_signup'),
  }),
  emailVerification: createRateLimit({
    name: 'auth_email_verification',
    envPrefix: 'RATE_LIMIT_EMAIL_VERIFICATION',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: rateLimitByIp('auth_email_verification'),
  }),
  superAdmin: createRateLimit({
    name: 'auth_superadmin',
    envPrefix: 'RATE_LIMIT_SUPERADMIN',
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyGenerator: rateLimitByIpAndUser('auth_superadmin'),
  }),
};

module.exports = {
  authRateLimits,
  createRateLimit,
  resolveClientIp,
};
