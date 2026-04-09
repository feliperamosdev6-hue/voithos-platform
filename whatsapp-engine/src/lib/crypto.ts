import crypto from 'crypto';
import { env } from '../config/env';

const resolveKey = (): Buffer => {
  if (env.authEncryptionKeyHex) {
    const key = Buffer.from(env.authEncryptionKeyHex, 'hex');
    if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY_HEX must be 32 bytes.');
    return key;
  }
  if (env.authEncryptionKeyBase64) {
    const key = Buffer.from(env.authEncryptionKeyBase64, 'base64');
    if (key.length !== 32) throw new Error('AUTH_ENCRYPTION_KEY_BASE64 must be 32 bytes.');
    return key;
  }
  throw new Error('Define AUTH_ENCRYPTION_KEY_HEX or AUTH_ENCRYPTION_KEY_BASE64.');
};

const KEY = resolveKey();

export const encryptText = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

export const decryptText = (encryptedText: string): string => {
  const raw = Buffer.from(encryptedText, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  const output = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return output.toString('utf8');
};

