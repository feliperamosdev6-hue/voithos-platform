import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const rootDir = process.cwd();
const packageJsonPath = resolve(rootDir, 'package.json');
const dockerComposePath = resolve(rootDir, 'docker-compose.yml');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const scriptNames = packageJson.scripts || {};
const uiScriptName = process.env.WHATSAPP_ENGINE_UI_SCRIPT || `${mode}:ui`;
const skipDockerBootstrap = process.env.WHATSAPP_ENGINE_SKIP_DOCKER === '1';
const bootMode = process.env.WHATSAPP_ENGINE_BOOT_MODE || (mode === 'start' ? 'headless' : 'ui');
const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const parseBoolean = (value, fallback) => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

const whatsappQueueEnabled = parseBoolean(process.env.WHATSAPP_QUEUE_ENABLED, !isProduction);
const whatsappRedisWorkersEnabled = parseBoolean(process.env.WHATSAPP_REDIS_WORKERS_ENABLED, whatsappQueueEnabled);

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const commandShell = isWindows ? (process.env.ComSpec || 'cmd.exe') : null;

const processes = [];
let shuttingDown = false;

const buildEntries = () => {
  const entries = [
    { name: 'api', script: mode },
  ];

  if (whatsappQueueEnabled && whatsappRedisWorkersEnabled) {
    entries.push({ name: 'worker', script: `${mode}:worker` });
  } else {
    console.warn('[runner] WhatsApp Redis worker desativado por WHATSAPP_QUEUE_ENABLED/WHATSAPP_REDIS_WORKERS_ENABLED.');
  }

  if (bootMode === 'ui' && scriptNames[uiScriptName]) {
    entries.push({ name: 'ui', script: uiScriptName });
  }

  return entries;
};

const childEntries = buildEntries();

if (!childEntries.length) {
  console.error('[runner] Nenhum processo configurado para iniciar.');
  process.exit(1);
}

if (bootMode === 'ui' && !scriptNames[uiScriptName]) {
  console.log(`[runner] Interface nao configurada. Script opcional ausente: "${uiScriptName}".`);
}

console.log(`[runner] engine_boot_started boot_mode=${bootMode}`);

const sleep = (ms) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, Math.max(0, Number(ms) || 0));
});

const isLocalHost = (host) => {
  const normalized = String(host || '').trim().toLowerCase();
  return !normalized || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
};

const parseUrlHost = (value) => {
  try {
    const parsed = new URL(String(value || '').trim());
    return {
      host: parsed.hostname || '',
      port: Number(parsed.port || ''),
    };
  } catch {
    return null;
  }
};

const detectExternalDependencies = () => {
  const database = parseUrlHost(process.env.DATABASE_URL);
  const redis = parseUrlHost(process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING);

  return {
    hasExternalDatabase: Boolean(database?.host && !isLocalHost(database.host)),
    hasExternalRedis: Boolean(redis?.host && !isLocalHost(redis.host)),
  };
};

const canConnectToPort = (port, host = '127.0.0.1', timeoutMs = 1200) => new Promise((resolvePromise) => {
  const socket = new net.Socket();
  let settled = false;

  const finish = (result) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolvePromise(result);
  };

  socket.setTimeout(timeoutMs);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false));
  socket.once('error', () => finish(false));
  socket.connect(port, host);
});

const waitForPort = async (port, label, timeoutMs = 30000) => {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    if (await canConnectToPort(port)) {
      console.log(`[runner] Dependencia pronta: ${label} em 127.0.0.1:${port}.`);
      return;
    }
    await sleep(1000);
  }
  throw new Error(`Dependencia indisponivel: ${label} em 127.0.0.1:${port}.`);
};

const runCommand = (command, args) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.once('error', rejectPromise);
  child.once('exit', (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }
    rejectPromise(new Error(`Comando falhou: ${command} ${args.join(' ')} (codigo ${code ?? 'desconhecido'})`));
  });
});

const ensureDockerDependencies = async () => {
  const external = detectExternalDependencies();
  if (external.hasExternalDatabase && external.hasExternalRedis) {
    console.log('[runner] Dependencias externas detectadas via DATABASE_URL/REDIS_URL. Bootstrap Docker ignorado.');
    return;
  }

  const postgresReady = await canConnectToPort(5433);
  const redisReady = await canConnectToPort(6379);
  if (postgresReady && redisReady) {
    console.log('[runner] Postgres e Redis ja estao disponiveis localmente.');
    return;
  }

  if (skipDockerBootstrap) {
    throw new Error('Postgres/Redis indisponiveis e o bootstrap Docker foi desativado por WHATSAPP_ENGINE_SKIP_DOCKER=1.');
  }

  console.log('[runner] Subindo dependencias locais do WhatsApp Engine (postgres + redis)...');
  const composeCommands = [
    ['docker', ['compose', 'up', '-d', 'postgres', 'redis']],
    ['docker-compose', ['up', '-d', 'postgres', 'redis']],
  ];

  let lastError = null;
  for (const [command, args] of composeCommands) {
    try {
      await runCommand(command, args);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`Nao foi possivel iniciar postgres/redis automaticamente. ${lastError.message}`);
  }

  await waitForPort(5433, 'Postgres');
  await waitForPort(6379, 'Redis');
};

const terminateAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (child.killed) continue;
    try {
      child.kill(signal);
    } catch {
      // Ignora falhas de encerramento para tentar desligar os demais processos.
    }
  }
};

const spawnNpmScript = (scriptName) => {
  if (isWindows) {
    return spawn(commandShell, ['/d', '/s', '/c', `${npmCommand} run ${scriptName}`], {
      cwd: rootDir,
      env: {
        ...process.env,
        WHATSAPP_ENGINE_BOOT_MODE: bootMode,
      },
      stdio: 'inherit',
      windowsHide: false,
    });
  }

  return spawn(npmCommand, ['run', scriptName], {
    cwd: rootDir,
    env: {
      ...process.env,
      WHATSAPP_ENGINE_BOOT_MODE: bootMode,
    },
    stdio: 'inherit',
  });
};

try {
  await ensureDockerDependencies();
} catch (error) {
  console.error(`[runner] engine_boot_failed boot_mode=${bootMode}: ${error.message}`);
  process.exit(1);
}

for (const entry of childEntries) {
  const child = spawnNpmScript(entry.script);

  processes.push(child);

  child.on('error', (error) => {
    console.error(`[runner] Falha ao iniciar "${entry.name}": ${error.message}`);
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
      console.log(`[runner] Processo "${entry.name}" encerrado por sinal ${signal}.`);
    } else if (code && code !== 0) {
      console.error(`[runner] Processo "${entry.name}" saiu com codigo ${code}.`);
    } else {
      console.log(`[runner] Processo "${entry.name}" finalizado.`);
    }

    terminateAll();
    process.exit(code ?? 0);
  });
}

process.on('SIGINT', () => {
  terminateAll('SIGINT');
});

process.on('SIGTERM', () => {
  terminateAll('SIGTERM');
});

console.log(`[runner] engine_boot_completed boot_mode=${bootMode}`);
