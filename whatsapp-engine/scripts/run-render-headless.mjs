import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const nodeBinary = process.execPath;
const bootMode = 'headless';
const processes = [];
let shuttingDown = false;

const parseBoolean = (value, fallback) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

const whatsappQueueEnabled = parseBoolean(process.env.WHATSAPP_QUEUE_ENABLED, false);
const whatsappRedisWorkersEnabled = parseBoolean(process.env.WHATSAPP_REDIS_WORKERS_ENABLED, whatsappQueueEnabled);

const processSpecs = [
  {
    name: 'api',
    entry: resolve(rootDir, 'dist', 'server.js'),
  },
];

if (whatsappQueueEnabled && whatsappRedisWorkersEnabled) {
  processSpecs.push({
    name: 'worker',
    entry: resolve(rootDir, 'dist', 'workers', 'messageWorker.js'),
  });
} else {
  console.warn('[render-runner] WhatsApp Redis worker disabled by WHATSAPP_QUEUE_ENABLED/WHATSAPP_REDIS_WORKERS_ENABLED.');
}

const envSnapshot = {
  node: process.version,
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  hasRedisUrl: Boolean(process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING),
  hasInternalApiToken: Boolean(process.env.INTERNAL_API_TOKEN),
  hasServiceInternalApiToken: Boolean(process.env.SERVICE_INTERNAL_API_TOKEN),
  hasCentralBackendBaseUrl: Boolean(process.env.CENTRAL_BACKEND_BASE_URL),
  hasCentralBackendServiceToken: Boolean(process.env.CENTRAL_BACKEND_SERVICE_TOKEN),
  hasAdminPanelToken: Boolean(process.env.ADMIN_PANEL_TOKEN),
  hasAuthEncryptionKeyHex: Boolean(process.env.AUTH_ENCRYPTION_KEY_HEX),
  whatsappQueueEnabled,
  whatsappRedisWorkersEnabled,
};

for (const spec of processSpecs) {
  if (!existsSync(spec.entry)) {
    console.error(`[render-runner] missing build artifact for ${spec.name}: ${spec.entry}`);
    process.exit(1);
  }
}

const terminateAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (child.killed) continue;
    try {
      child.kill(signal);
    } catch {
      // Best-effort shutdown for sibling processes.
    }
  }
};

const spawnNodeEntry = (name, entry) => {
  const child = spawn(nodeBinary, [entry], {
    cwd: rootDir,
    env: {
      ...process.env,
      WHATSAPP_ENGINE_BOOT_MODE: bootMode,
    },
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(`[render-runner] failed to start ${name}: ${error.message}`);
    terminateAll();
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      if (processes.every((proc) => proc.killed || proc.exitCode !== null)) {
        process.exit(code ?? 0);
      }
      return;
    }

    if (signal) {
      console.error(`[render-runner] ${name} exited by signal ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[render-runner] ${name} exited with code ${code}`);
    } else {
      console.log(`[render-runner] ${name} exited`);
    }

    terminateAll();
    process.exit(code ?? 0);
  });

  processes.push(child);
};

process.on('SIGINT', () => terminateAll('SIGINT'));
process.on('SIGTERM', () => terminateAll('SIGTERM'));

console.log('[render-runner] starting whatsapp-engine headless runtime');
console.log(`[render-runner] env ${JSON.stringify(envSnapshot)}`);

for (const spec of processSpecs) {
  spawnNodeEntry(spec.name, spec.entry);
}
