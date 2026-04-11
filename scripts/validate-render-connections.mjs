import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';

const repoRoot = process.cwd();
const secretsPath = path.join(repoRoot, 'RENDER-SEGREDOS-LOCAL.md');

const parseSecrets = async () => {
  const raw = await fs.readFile(secretsPath, 'utf8');
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = String(match[2] || '').trim();
  }
  return values;
};

const formatResult = (label, ok, detail) =>
  `${ok ? 'OK' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`;

const validateUrl = (label, value, allowedProtocols) => {
  if (!value) return { ok: false, error: `${label} ausente` };
  try {
    const parsed = new URL(value);
    if (!allowedProtocols.includes(parsed.protocol)) {
      return { ok: false, error: `${label} com protocolo invalido: ${parsed.protocol}` };
    }
    return { ok: true, parsed };
  } catch (error) {
    return { ok: false, error: `${label} invalida: ${error.message}` };
  }
};

const testSocket = ({ host, port, tlsEnabled, servername }) =>
  new Promise((resolve) => {
    const timeoutMs = 6000;
    const socket = tlsEnabled
      ? tls.connect({ host, port, servername, rejectUnauthorized: true })
      : net.connect({ host, port });

    const finish = (ok, message) => {
      try { socket.destroy(); } catch {}
      resolve({ ok, message });
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () => finish(false, `timeout apos ${timeoutMs}ms`));
    socket.once('error', (error) => finish(false, error.message));
    socket.once(tlsEnabled ? 'secureConnect' : 'connect', () => finish(true, `${host}:${port}`));
  });

const main = async () => {
  const values = await parseSecrets();

  const backendDb = validateUrl('BACKEND_DATABASE_URL', values.BACKEND_DATABASE_URL, ['postgresql:', 'postgres:']);
  const ngDb = validateUrl('NG_DATABASE_URL', values.NG_DATABASE_URL, ['postgresql:', 'postgres:']);
  const ngDirectDb = validateUrl('NG_DIRECT_DATABASE_URL', values.NG_DIRECT_DATABASE_URL, ['postgresql:', 'postgres:']);
  const redis = validateUrl('NG_REDIS_URL', values.NG_REDIS_URL, ['redis:', 'rediss:']);

  const results = [];

  if (!backendDb.ok) {
    results.push(formatResult('BACKEND_DATABASE_URL', false, backendDb.error));
  } else {
    const port = Number(backendDb.parsed.port || 5432);
    const probe = await testSocket({
      host: backendDb.parsed.hostname,
      port,
      tlsEnabled: String(backendDb.parsed.searchParams.get('sslmode') || '').toLowerCase() === 'require',
      servername: backendDb.parsed.hostname,
    });
    results.push(formatResult('BACKEND_DATABASE_URL', probe.ok, probe.message));
  }

  if (!ngDb.ok) {
    results.push(formatResult('NG_DATABASE_URL', false, ngDb.error));
  } else {
    const port = Number(ngDb.parsed.port || 5432);
    const probe = await testSocket({
      host: ngDb.parsed.hostname,
      port,
      tlsEnabled: String(ngDb.parsed.searchParams.get('sslmode') || '').toLowerCase() === 'require',
      servername: ngDb.parsed.hostname,
    });
    results.push(formatResult('NG_DATABASE_URL', probe.ok, probe.message));
  }

  if (!ngDirectDb.ok) {
    results.push(formatResult('NG_DIRECT_DATABASE_URL', false, ngDirectDb.error));
  } else {
    const port = Number(ngDirectDb.parsed.port || 5432);
    const probe = await testSocket({
      host: ngDirectDb.parsed.hostname,
      port,
      tlsEnabled: String(ngDirectDb.parsed.searchParams.get('sslmode') || '').toLowerCase() === 'require',
      servername: ngDirectDb.parsed.hostname,
    });
    results.push(formatResult('NG_DIRECT_DATABASE_URL', probe.ok, probe.message));
  }

  if (!redis.ok) {
    results.push(formatResult('NG_REDIS_URL', false, redis.error));
  } else {
    const port = Number(redis.parsed.port || 6379);
    const probe = await testSocket({
      host: redis.parsed.hostname,
      port,
      tlsEnabled: redis.parsed.protocol === 'rediss:',
      servername: redis.parsed.hostname,
    });
    results.push(formatResult('NG_REDIS_URL', probe.ok, probe.message));
  }

  process.stdout.write(results.join('\n') + '\n');
};

main().catch((error) => {
  process.stderr.write(`FAIL validation script error - ${error.message}\n`);
  process.exitCode = 1;
});
