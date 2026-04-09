const crypto = require('crypto');

const SECRET_PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

const getSecretKey = () => {
  const source = String(process.env.VOITHOS_APP_SECRET || 'voithos-default-local-secret').trim();
  return crypto.createHash('sha256').update(source).digest();
};

const isEncrypted = (value) => String(value || '').startsWith(SECRET_PREFIX);

const encryptSecret = (plainText) => {
  const text = String(plainText || '');
  if (!text) return '';
  if (isEncrypted(text)) return text;

  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString('base64');
  return `${SECRET_PREFIX}${payload}`;
};

const decryptSecret = (cipherText) => {
  const raw = String(cipherText || '');
  if (!raw) return '';
  if (!isEncrypted(raw)) return raw;
  try {
    const key = getSecretKey();
    const payload = Buffer.from(raw.slice(SECRET_PREFIX.length), 'base64');
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
};

module.exports = {
  isEncrypted,
  encryptSecret,
  decryptSecret,
};

